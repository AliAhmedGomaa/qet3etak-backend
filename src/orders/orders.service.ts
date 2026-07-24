import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, PaymentMethod } from '../common/enums/order.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { withBranchFilter } from '../common/branch-scope';
import { ProductsService } from '../products/products.service';
import { resolveUnitPrice } from '../products/pricing.util';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { PushService } from '../push/push.service';
import { DeliveryGuysService } from '../delivery/delivery-guys.service';
import { DeliveryGuyStatus } from '../common/enums/delivery.enums';
import { InvoicesService } from '../invoices/invoices.service';
import {
  AssignOrderDeliveryDto,
  CheckoutDto,
  ReorderDto,
  UpdateOrderStatusDto,
} from './dto/order.dto';
import { Order, OrderDocument } from './schemas/order.schema';

export type ReorderWarningCode =
  | 'UNAVAILABLE'
  | 'OUT_OF_STOCK'
  | 'QTY_REDUCED'
  | 'PRICE_CHANGED';

export interface ReorderWarning {
  code: ReorderWarningCode;
  productId: string;
  title: string;
  message: string;
  requestedQuantity?: number;
  availableQuantity?: number;
  previousUnitPrice?: number;
  currentUnitPrice?: number;
}

export interface ReorderResult {
  order: OrderDocument;
  warnings: ReorderWarning[];
  sourceOrderId: string;
  sourceOrderNumber: string;
}

const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Match orders by order number or shop name (case-insensitive, partial). */
function buildOrderSearchFilter(q?: string): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return {};
  const rx = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ orderNumber: rx }, { shopName: rx }] };
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly productsService: ProductsService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
    private readonly deliveryGuysService: DeliveryGuysService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async checkout(shopUserId: string, dto: CheckoutDto): Promise<OrderDocument> {
    const shop = await this.usersService.findByIdOrFail(shopUserId);
    const priced = await this.priceItems(dto.items);

    if (dto.paymentMethod === PaymentMethod.CREDIT) {
      const wallet = await this.walletsService.ensureForShop(shopUserId);
      this.walletsService.assertCreditAvailable(wallet, priced.total);
    }

    // Decrement stock
    for (const line of priced.lines) {
      const product = await this.productsService.findDocumentById(
        String(line.productId),
      );
      if (product.stockQuantity < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.title}`,
        );
      }
      product.stockQuantity -= line.quantity;
      await product.save();
    }

    const orderNumber = await this.nextOrderNumber();
    const order = await this.orderModel.create({
      orderNumber,
      shopId: new Types.ObjectId(shopUserId),
      shopName: shop.shopName,
      branchId: shop.branchId,
      status: OrderStatus.RECEIVED,
      paymentMethod: dto.paymentMethod,
      items: priced.lines,
      subtotal: priced.total,
      total: priced.total,
      notes: dto.notes?.trim() || '',
      statusHistory: [
        {
          status: OrderStatus.RECEIVED,
          at: new Date(),
          note: 'Order placed',
        },
      ],
    });

    if (dto.paymentMethod === PaymentMethod.CREDIT) {
      await this.walletsService.chargeCredit(
        shopUserId,
        priced.total,
        order._id as Types.ObjectId,
        `Pay later · ${orderNumber}`,
      );
    }

    // Commercial invoice is issued at checkout (priced snapshot; 1 per order).
    await this.invoicesService.issueFromOrder(order);

    return order;
  }

  countForShop(shopId: string): Promise<number> {
    return this.orderModel
      .countDocuments({ shopId: new Types.ObjectId(shopId) })
      .exec();
  }

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<OrderDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter = { shopId: new Types.ObjectId(shopId) };
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async getForShop(shopId: string, orderId: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderModel
      .findOne({
        _id: new Types.ObjectId(orderId),
        shopId: new Types.ObjectId(shopId),
      })
      .exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getById(orderId: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Create a new order from a past order’s line items via the normal checkout
   * path (live prices, stock decrement, credit checks). Unavailable items are
   * skipped (or qty capped to stock) with warnings; fails if nothing remains.
   */
  async reorder(
    shopUserId: string,
    orderId: string,
    dto: ReorderDto = {},
  ): Promise<ReorderResult> {
    const source = await this.getForShop(shopUserId, orderId);
    const { items, warnings } = await this.resolveReorderItems(source);

    if (!items.length) {
      throw new BadRequestException({
        message: 'None of the items from this order are available to reorder',
        warnings,
      });
    }

    const paymentMethod = dto.paymentMethod ?? source.paymentMethod;
    const notes =
      dto.notes?.trim() ||
      `Reorder of ${source.orderNumber}`;

    const order = await this.checkout(shopUserId, {
      items,
      paymentMethod,
      notes,
    });

    return {
      order,
      warnings,
      sourceOrderId: String(source._id),
      sourceOrderNumber: source.orderNumber,
    };
  }

  private async resolveReorderItems(source: OrderDocument): Promise<{
    items: CheckoutDto['items'];
    warnings: ReorderWarning[];
  }> {
    const items: CheckoutDto['items'] = [];
    const warnings: ReorderWarning[] = [];

    for (const line of source.items ?? []) {
      const productId = String(line.productId);
      const title = line.title || productId;
      const requestedQuantity = line.quantity;

      let product;
      try {
        product = await this.productsService.findDocumentById(productId);
      } catch {
        warnings.push({
          code: 'UNAVAILABLE',
          productId,
          title,
          message: `${title} is no longer available`,
          requestedQuantity,
        });
        continue;
      }

      if (!product.isActive) {
        warnings.push({
          code: 'UNAVAILABLE',
          productId,
          title: product.title,
          message: `${product.title} is not available`,
          requestedQuantity,
        });
        continue;
      }

      if (product.stockQuantity <= 0) {
        warnings.push({
          code: 'OUT_OF_STOCK',
          productId,
          title: product.title,
          message: `${product.title} is out of stock`,
          requestedQuantity,
          availableQuantity: 0,
        });
        continue;
      }

      let quantity = requestedQuantity;
      if (quantity > product.stockQuantity) {
        warnings.push({
          code: 'QTY_REDUCED',
          productId,
          title: product.title,
          message: `${product.title}: quantity reduced from ${requestedQuantity} to ${product.stockQuantity}`,
          requestedQuantity,
          availableQuantity: product.stockQuantity,
        });
        quantity = product.stockQuantity;
      }

      const pricing = resolveUnitPrice(
        quantity,
        product.basePrice,
        product.tieredPricing ?? [],
      );
      if (Number(line.unitPrice) !== Number(pricing.unitPrice)) {
        warnings.push({
          code: 'PRICE_CHANGED',
          productId,
          title: product.title,
          message: `${product.title}: price changed from ${line.unitPrice} to ${pricing.unitPrice}`,
          previousUnitPrice: line.unitPrice,
          currentUnitPrice: pricing.unitPrice,
        });
      }

      items.push({ productId, quantity });
    }

    return { items, warnings };
  }

  async listAll(
    page?: number,
    limit?: number,
    q?: string,
    branchScope?: string | null,
  ): Promise<PaginatedResult<OrderDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter = withBranchFilter(buildOrderSearchFilter(q), branchScope ?? null);
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async updateStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    const currentIdx = STATUS_FLOW.indexOf(order.status);
    const nextIdx = STATUS_FLOW.indexOf(dto.status);
    if (nextIdx < 0) {
      throw new BadRequestException('Invalid status');
    }
    // Allow move to any status in the board (including backwards for ops flexibility)
    // but block skipping delivered from received without preparing/shipped? User asked drag-drop through board — allow any of the 4.
    const statusChanged = currentIdx !== nextIdx;
    if (statusChanged) {
      order.status = dto.status;
      order.statusHistory.push({
        status: dto.status,
        at: new Date(),
        note: dto.note?.trim() || `Status → ${dto.status}`,
      });
    }

    if (dto.deliveryGuyId) {
      await this.applyDeliveryAssignment(order, dto.deliveryGuyId, dto.note);
    }

    if (!statusChanged && !dto.deliveryGuyId) return order;

    await order.save();

    if (statusChanged) {
      const statusLabel: Record<OrderStatus, string> = {
        [OrderStatus.RECEIVED]: 'تم استلام الطلب',
        [OrderStatus.PREPARING]: 'جاري التجهيز',
        [OrderStatus.SHIPPED]: 'تم الشحن',
        [OrderStatus.DELIVERED]: 'تم التسليم',
      };
      await this.pushService.notifyUser(String(order.shopId), {
        title: `تحديث الطلب ${order.orderNumber}`,
        body: statusLabel[dto.status],
        url: `/orders/${order.id}`,
        tag: `order-${order.id}`,
      });
    }

    // Count fee toward courier stats once when order reaches DELIVERED.
    if (
      statusChanged &&
      dto.status === OrderStatus.DELIVERED &&
      order.deliveryGuyId &&
      order.deliveryFee > 0
    ) {
      await this.deliveryGuysService.recordDeliveryStats(
        String(order.deliveryGuyId),
        order.deliveryFee,
      );
    }

    return order;
  }

  async assignDelivery(
    orderId: string,
    dto: AssignOrderDeliveryDto,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    await this.applyDeliveryAssignment(order, dto.deliveryGuyId, dto.note);
    await order.save();
    return order;
  }

  private async applyDeliveryAssignment(
    order: OrderDocument,
    deliveryGuyId: string,
    note?: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(deliveryGuyId)) {
      throw new BadRequestException('Invalid deliveryGuyId');
    }
    const guy = await this.deliveryGuysService.findById(deliveryGuyId);
    if (guy.status !== DeliveryGuyStatus.ACTIVE) {
      throw new BadRequestException('Delivery guy is inactive');
    }
    const itemCount = (order.items ?? []).reduce(
      (sum, line) => sum + (line.quantity || 0),
      0,
    );
    const fee = this.deliveryGuysService.calculateFee(guy, {
      orderTotal: order.total,
      itemCount,
    });
    order.deliveryGuyId = guy._id as Types.ObjectId;
    order.deliveryGuyName = guy.fullName;
    order.deliveryFee = fee;
    if (note?.trim()) {
      order.statusHistory.push({
        status: order.status,
        at: new Date(),
        note: note.trim(),
      });
    }
  }

  private async priceItems(items: CheckoutDto['items']) {
    const lines = [];
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(`Invalid product id ${item.productId}`);
      }
      const product = await this.productsService.findDocumentById(
        item.productId,
      );
      if (!product.isActive) {
        throw new BadRequestException(`${product.title} is not available`);
      }
      if (item.quantity > product.stockQuantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.title} (available: ${product.stockQuantity})`,
        );
      }
      const pricing = resolveUnitPrice(
        item.quantity,
        product.basePrice,
        product.tieredPricing ?? [],
      );
      lines.push({
        productId: product._id,
        title: product.title,
        sku: product.sku || '',
        qualityGrade: product.qualityGrade,
        quantity: item.quantity,
        unitPrice: pricing.unitPrice,
        lineTotal: pricing.lineTotal,
      });
    }
    const total = Number(
      lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2),
    );
    return { lines, total };
  }

  private async nextOrderNumber(): Promise<string> {
    const count = await this.orderModel.countDocuments();
    const seq = String(count + 1).padStart(5, '0');
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `QT-${day}-${seq}`;
  }
}
