import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, OrderSource, PaymentMethod } from '../common/enums/order.enums';
import { UserStatus } from '../common/enums/user.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { withBranchFilter } from '../common/branch-scope';
import { absoluteMediaUrl } from '../common/media-url';
import { ProductsService } from '../products/products.service';
import { resolveUnitPrice } from '../products/pricing.util';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { PushService } from '../push/push.service';
import { DeliveryGuysService } from '../delivery/delivery-guys.service';
import { DeliveryShiftsService } from '../delivery/delivery-shifts.service';
import {
  DeliveryFeeModel,
  DeliveryGuyStatus,
} from '../common/enums/delivery.enums';
import { DeliveryGuy } from '../delivery/schemas/delivery-guy.schema';
import { InvoicesService } from '../invoices/invoices.service';
import {
  AssignOrderDeliveryDto,
  CheckoutDto,
  ReorderDto,
  UpdateOrderStatusDto,
  WalkInSaleDto,
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
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURNED,
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

function parseYearMonth(month?: string): string {
  const raw =
    month?.trim() ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new BadRequestException('month must be YYYY-MM');
  }
  return raw;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  return { start, end };
}

/** Calendar day bounds in Africa/Cairo (UTC+2/+3). */
function cairoTodayBounds(now = new Date()): {
  start: Date;
  end: Date;
  date: string;
} {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  // Midday UTC probe to resolve Cairo offset for this calendar day.
  const probe = new Date(`${date}T12:00:00Z`);
  const cairoHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      hour12: false,
    }).format(probe),
  );
  const offsetHours = cairoHour - 12;
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCHours(start.getUTCHours() - offsetHours);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(-1);
  return { start, end, date };
}

function feeModelSummary(
  guy: Pick<
    DeliveryGuy,
    | 'feeModel'
    | 'flatFee'
    | 'percentRate'
    | 'baseFee'
    | 'perItemFee'
    | 'hourlyRate'
  >,
): string {
  switch (guy.feeModel) {
    case DeliveryFeeModel.PERCENT:
      return `${guy.percentRate}% من قيمة الطلب`;
    case DeliveryFeeModel.BASE_PLUS_ITEMS:
      return `${guy.baseFee} ج.م + ${guy.perItemFee} ج.م لكل قطعة`;
    case DeliveryFeeModel.HOURLY:
      return `${guy.hourlyRate} ج.م لكل ساعة عمل`;
    case DeliveryFeeModel.FLAT:
    default:
      return `${guy.flatFee} ج.م لكل توصيلة`;
  }
}

@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly productsService: ProductsService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
    private readonly deliveryGuysService: DeliveryGuysService,
    private readonly deliveryShiftsService: DeliveryShiftsService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async onModuleInit(): Promise<void> {
    // PREPARING removed — fold legacy rows into RECEIVED (status + history).
    await this.orderModel
      .updateMany(
        { status: 'PREPARING' } as Record<string, unknown>,
        { $set: { status: OrderStatus.RECEIVED } },
      )
      .exec();
    await this.orderModel
      .updateMany(
        { 'statusHistory.status': 'PREPARING' } as Record<string, unknown>,
        { $set: { 'statusHistory.$[ev].status': OrderStatus.RECEIVED } },
        { arrayFilters: [{ 'ev.status': 'PREPARING' }] },
      )
      .exec();
  }

  async checkout(shopUserId: string, dto: CheckoutDto): Promise<OrderDocument> {
    const shop = await this.usersService.findByIdOrFail(shopUserId);
    const shopDiscountPercent = Number(shop.shopDiscountPercent ?? 0);
    const priced = await this.priceItems(dto.items, shopDiscountPercent);

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
      shopCity: shop.city || '',
      shopAddress: shop.address || '',
      shopLocationLat: shop.locationLat,
      shopLocationLng: shop.locationLng,
      branchId: shop.branchId,
      source: OrderSource.WHOLESALE,
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

    await this.pushService.notifyAdmins({
      title: 'طلب جديد',
      body: `${order.orderNumber} — ${order.shopName} — ${order.total} ج.م`,
      url: '/orders-board',
      tag: `order-new-${String(order._id)}`,
    });

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
    const { items, warnings } = await this.resolveReorderItems(
      source,
      shopUserId,
    );

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

  private async resolveReorderItems(
    source: OrderDocument,
    shopUserId: string,
  ): Promise<{
    items: CheckoutDto['items'];
    warnings: ReorderWarning[];
  }> {
    const items: CheckoutDto['items'] = [];
    const warnings: ReorderWarning[] = [];
    const shopDiscountPercent =
      await this.usersService.getShopDiscountPercent(shopUserId);

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
        shopDiscountPercent,
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
    const filter = withBranchFilter(
      {
        ...buildOrderSearchFilter(q),
        // Keep the delivery board free of counter sales.
        source: { $ne: OrderSource.WALK_IN },
      },
      branchScope ?? null,
    );
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

  /**
   * Create an in-store sale: stock ↓, order DELIVERED, invoice issued.
   * Without shopId → anonymous walk-in (cash).
   * With shopId → sale for an approved registered shop (cash or credit).
   */
  async createWalkInSale(
    adminUserId: string,
    dto: WalkInSaleDto,
    branchId?: string | null,
  ): Promise<OrderDocument> {
    const shopId = dto.shopId?.trim();
    let shop;
    let source: OrderSource;
    let shopDiscountPercent = 0;

    if (shopId) {
      shop = await this.usersService.findShopByIdOrFail(shopId);
      if (shop.status !== UserStatus.APPROVED) {
        throw new BadRequestException('Shop must be approved');
      }
      if (shop.phone === '00000000000') {
        throw new BadRequestException('Invalid shop for counter sale');
      }
      source = OrderSource.WHOLESALE;
      shopDiscountPercent = Number(shop.shopDiscountPercent ?? 0);
    } else {
      shop = await this.usersService.ensureWalkInCounterShop();
      source = OrderSource.WALK_IN;
    }

    const paymentMethod =
      shopId && dto.paymentMethod === PaymentMethod.CREDIT
        ? PaymentMethod.CREDIT
        : PaymentMethod.CASH;

    if (!shopId && dto.paymentMethod === PaymentMethod.CREDIT) {
      throw new BadRequestException(
        'Credit payment requires selecting a registered shop',
      );
    }

    const priced = await this.priceWalkInItems(dto.items, shopDiscountPercent);

    if (paymentMethod === PaymentMethod.CREDIT) {
      const wallet = await this.walletsService.ensureForShop(String(shop._id));
      this.walletsService.assertCreditAvailable(wallet, priced.total);
    }

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

    const now = new Date();
    const orderNumber = await this.nextOrderNumber();
    const note =
      dto.notes?.trim() ||
      (shopId ? 'بيع من المحل لمتجر مسجّل' : 'بيع مباشر من المحل');
    const order = await this.orderModel.create({
      orderNumber,
      shopId: shop._id,
      shopName: shop.shopName,
      shopCity: shop.city || '',
      shopAddress: shop.address || '',
      shopLocationLat: shop.locationLat,
      shopLocationLng: shop.locationLng,
      source,
      customerName: shopId ? '' : dto.customerName?.trim() || '',
      customerPhone: shopId ? '' : dto.customerPhone?.trim() || '',
      createdByUserId: new Types.ObjectId(adminUserId),
      ...(branchId && Types.ObjectId.isValid(branchId)
        ? { branchId: new Types.ObjectId(branchId) }
        : shop.branchId
          ? { branchId: shop.branchId }
          : {}),
      status: OrderStatus.DELIVERED,
      paymentMethod,
      items: priced.lines,
      subtotal: priced.total,
      total: priced.total,
      notes: note,
      deliveredAt: now,
      statusHistory: [
        {
          status: OrderStatus.DELIVERED,
          at: now,
          note:
            paymentMethod === PaymentMethod.CREDIT
              ? 'بيع آجل من المحل'
              : 'بيع نقدي من المحل',
        },
      ],
    });

    if (paymentMethod === PaymentMethod.CREDIT) {
      await this.walletsService.chargeCredit(
        String(shop._id),
        priced.total,
        order._id as Types.ObjectId,
        `Pay later · ${orderNumber}`,
      );
    }

    await this.invoicesService.issueFromOrder(order);
    return order;
  }

  /** Line items sold today (Cairo calendar day), both wholesale and walk-in. */
  async soldToday(
    branchScope?: string | null,
  ): Promise<{
    date: string;
    totalQuantity: number;
    totalRevenue: number;
    orderCount: number;
    lines: Array<{
      orderId: string;
      orderNumber: string;
      source: string;
      shopName: string;
      customerName: string;
      productId: string;
      title: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      paymentMethod: string;
      createdAt: Date;
    }>;
  }> {
    const { start, end, date } = cairoTodayBounds();
    const filter = withBranchFilter(
      { createdAt: { $gte: start, $lte: end } },
      branchScope ?? null,
    );
    const orders = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();

    const lines: Array<{
      orderId: string;
      orderNumber: string;
      source: string;
      shopName: string;
      customerName: string;
      productId: string;
      title: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      paymentMethod: string;
      createdAt: Date;
    }> = [];

    let totalQuantity = 0;
    let totalRevenue = 0;
    for (const order of orders) {
      const createdAt =
        (order as OrderDocument & { createdAt?: Date }).createdAt ?? new Date();
      for (const item of order.items ?? []) {
        const qty = Number(item.quantity) || 0;
        const lineTotal = Number(item.lineTotal) || 0;
        totalQuantity += qty;
        totalRevenue += lineTotal;
        lines.push({
          orderId: String(order._id),
          orderNumber: order.orderNumber,
          source: order.source || OrderSource.WHOLESALE,
          shopName: order.shopName,
          customerName: order.customerName || '',
          productId: String(item.productId),
          title: item.title,
          sku: item.sku || '',
          quantity: qty,
          unitPrice: Number(item.unitPrice) || 0,
          lineTotal,
          paymentMethod: order.paymentMethod,
          createdAt,
        });
      }
    }

    return {
      date,
      totalQuantity,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      orderCount: orders.length,
      lines,
    };
  }

  async updateStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order id');
    }
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    this.sanitizeLegacyStatus(order);

    if (dto.status === OrderStatus.RETURNED) {
      throw new BadRequestException(
        'Use PATCH /admin/orders/:id/return to mark an order as returned (restocks inventory)',
      );
    }
    if (order.status === OrderStatus.RETURNED) {
      throw new BadRequestException(
        'Returned orders cannot change status',
      );
    }

    const currentIdx = STATUS_FLOW.indexOf(order.status);
    const nextIdx = STATUS_FLOW.indexOf(dto.status);
    if (nextIdx < 0) {
      throw new BadRequestException('Invalid status');
    }
    // Allow move to any status in the board (including backwards for ops flexibility).
    const statusChanged = currentIdx !== nextIdx;
    if (statusChanged) {
      order.status = dto.status;
      order.statusHistory.push({
        status: dto.status,
        at: new Date(),
        note: dto.note?.trim() || `Status → ${dto.status}`,
      });
      if (dto.status === OrderStatus.DELIVERED && !order.deliveredAt) {
        order.deliveredAt = new Date();
      }
    }

    if (dto.deliveryGuyId) {
      await this.applyDeliveryAssignment(order, dto.deliveryGuyId, dto.note);
    }

    if (!statusChanged && !dto.deliveryGuyId) {
      // Still persist if we sanitized legacy PREPARING rows.
      if (order.isModified()) await order.save();
      return order;
    }

    try {
      await order.save();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update order status';
      throw new BadRequestException(msg);
    }

    if (statusChanged) {
      const statusLabel: Record<OrderStatus, string> = {
        [OrderStatus.RECEIVED]: 'تم استلام الطلب',
        [OrderStatus.SHIPPED]: 'تم الشحن',
        [OrderStatus.DELIVERED]: 'تم التسليم',
        [OrderStatus.RETURNED]: 'تم إرجاع الطلب',
      };
      try {
        await this.pushService.notifyUser(String(order.shopId), {
          title: `تحديث الطلب ${order.orderNumber}`,
          body: statusLabel[dto.status],
          url: `/orders/${String(order._id)}`,
          tag: `order-${String(order._id)}`,
        });
        if (dto.status === OrderStatus.DELIVERED) {
          await this.pushService.notifyAdmins({
            title: `تم تسليم ${order.orderNumber}`,
            body: `${order.shopName}${order.deliveryGuyName ? ` — ${order.deliveryGuyName}` : ''}`,
            url: '/orders-board',
            tag: `order-delivered-${String(order._id)}`,
          });
        }
      } catch {
        // Push failures must not roll back a successful status change.
      }
    }

    // Count fee toward courier stats once when order reaches DELIVERED.
    if (
      statusChanged &&
      dto.status === OrderStatus.DELIVERED &&
      order.deliveryGuyId
    ) {
      try {
        await this.deliveryGuysService.recordDeliveryStats(
          String(order.deliveryGuyId),
          order.deliveryFee,
        );
      } catch {
        // Stats are best-effort; status already saved.
      }
    }

    return order;
  }

  /** Mark order RETURNED after inventory/refund handling (called by ReturnsService). */
  async setReturnedStatus(
    orderId: string,
    note?: string,
  ): Promise<OrderDocument> {
    const order = await this.getById(orderId);
    this.sanitizeLegacyStatus(order);
    if (order.status === OrderStatus.RETURNED) {
      return order;
    }
    order.status = OrderStatus.RETURNED;
    order.statusHistory.push({
      status: OrderStatus.RETURNED,
      at: new Date(),
      note: note?.trim() || 'تم إرجاع الطلب بواسطة الإدارة',
    });
    await order.save();
    try {
      await this.pushService.notifyUser(String(order.shopId), {
        title: `إرجاع الطلب ${order.orderNumber}`,
        body: 'تم إرجاع الطلب وإعادة الكميات للمخزون',
        url: `/orders/${String(order._id)}`,
        tag: `order-returned-${String(order._id)}`,
      });
    } catch {
      /* push is best-effort */
    }
    return order;
  }

  /** Map removed PREPARING status so saves pass current schema validation. */
  private sanitizeLegacyStatus(order: OrderDocument): void {
    if ((order.status as string) === 'PREPARING') {
      order.status = OrderStatus.RECEIVED;
    }
    if (!Array.isArray(order.statusHistory)) return;
    let changed = false;
    for (const ev of order.statusHistory) {
      if ((ev.status as string) === 'PREPARING') {
        ev.status = OrderStatus.RECEIVED;
        changed = true;
      }
    }
    if (changed) order.markModified('statusHistory');
  }

  async listForDeliveryGuy(
    deliveryGuyId: string,
    page?: number,
    limit?: number,
    tab: 'active' | 'delivered' | 'all' = 'active',
  ): Promise<PaginatedResult<OrderDocument>> {
    if (!Types.ObjectId.isValid(deliveryGuyId)) {
      throw new BadRequestException('Invalid delivery guy id');
    }
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {
      deliveryGuyId: new Types.ObjectId(deliveryGuyId),
    };
    if (tab === 'active') {
      filter['status'] = {
        $in: [OrderStatus.RECEIVED, OrderStatus.SHIPPED],
      };
    } else if (tab === 'delivered') {
      filter['status'] = OrderStatus.DELIVERED;
    }
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async getForDeliveryGuy(
    deliveryGuyId: string,
    orderId: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    if (String(order.deliveryGuyId ?? '') !== deliveryGuyId) {
      throw new ForbiddenException('Order is not assigned to you');
    }
    // Backfill live shop location for older orders that lack a snapshot.
    if (
      (order.shopLocationLat == null || order.shopLocationLng == null) &&
      order.shopId
    ) {
      try {
        const shop = await this.usersService.findByIdOrFail(String(order.shopId));
        if (!order.shopCity && shop.city) order.shopCity = shop.city;
        if (!order.shopAddress && shop.address) order.shopAddress = shop.address;
        if (
          shop.locationLat != null &&
          shop.locationLng != null &&
          Number.isFinite(shop.locationLat) &&
          Number.isFinite(shop.locationLng)
        ) {
          order.shopLocationLat = shop.locationLat;
          order.shopLocationLng = shop.locationLng;
        }
      } catch {
        /* shop may be deleted */
      }
    }
    return order;
  }

  async markShippedByCourier(
    deliveryGuyId: string,
    orderId: string,
    note?: string,
  ): Promise<OrderDocument> {
    const order = await this.getForDeliveryGuy(deliveryGuyId, orderId);
    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Order already delivered');
    }
    if (order.status === OrderStatus.SHIPPED) {
      return order;
    }
    return this.updateStatus(orderId, {
      status: OrderStatus.SHIPPED,
      note: note?.trim() || 'تم الشحن بواسطة المندوب',
    });
  }

  async markDeliveredByCourier(
    deliveryGuyId: string,
    orderId: string,
    note?: string,
    photoFilename?: string,
  ): Promise<OrderDocument> {
    if (!photoFilename?.trim()) {
      throw new BadRequestException(
        'صورة إثبات التسليم مطلوبة',
      );
    }
    const order = await this.getForDeliveryGuy(deliveryGuyId, orderId);
    if (order.status === OrderStatus.DELIVERED) {
      throw new BadRequestException('Order already delivered');
    }
    this.sanitizeLegacyStatus(order);
    order.deliveryPhotoUrl = `/uploads/${photoFilename.trim()}`;
    order.deliveredAt = new Date();
    await order.save();
    return this.updateStatus(orderId, {
      status: OrderStatus.DELIVERED,
      note: note?.trim() || 'تم التسليم بواسطة المندوب',
    });
  }

  async earningsForDeliveryGuy(
    deliveryGuyId: string,
    monthRaw?: string,
  ): Promise<Record<string, unknown>> {
    if (!Types.ObjectId.isValid(deliveryGuyId)) {
      throw new BadRequestException('Invalid delivery guy id');
    }
    const guy = await this.deliveryGuysService.findById(deliveryGuyId);
    const month = parseYearMonth(monthRaw);
    const { start, end } = monthBounds(month);
    const guyOid = new Types.ObjectId(deliveryGuyId);

    const [monthAgg, pendingAgg, monthOrders] = await Promise.all([
      this.orderModel
        .aggregate([
          {
            $match: {
              deliveryGuyId: guyOid,
              status: OrderStatus.DELIVERED,
              statusHistory: {
                $elemMatch: {
                  status: OrderStatus.DELIVERED,
                  at: { $gte: start, $lt: end },
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              deliveries: { $sum: 1 },
              feesEarned: { $sum: '$deliveryFee' },
              orderTotal: { $sum: '$total' },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          {
            $match: {
              deliveryGuyId: guyOid,
              status: {
                $in: [OrderStatus.RECEIVED, OrderStatus.SHIPPED],
              },
            },
          },
          {
            $group: {
              _id: null,
              activeOrders: { $sum: 1 },
              pendingFees: { $sum: '$deliveryFee' },
            },
          },
        ])
        .exec(),
      this.orderModel
        .find({
          deliveryGuyId: guyOid,
          status: OrderStatus.DELIVERED,
          statusHistory: {
            $elemMatch: {
              status: OrderStatus.DELIVERED,
              at: { $gte: start, $lt: end },
            },
          },
        })
        .sort({ updatedAt: -1 })
        .limit(50)
        .select(
          'orderNumber shopName total deliveryFee deliveryPhotoUrl deliveredAt updatedAt status',
        )
        .exec(),
    ]);

    const monthStats = monthAgg[0] ?? {};
    const pending = pendingAgg[0] ?? {};

    const isHourly = guy.feeModel === DeliveryFeeModel.HOURLY;
    const shiftStats = isHourly
      ? await this.deliveryShiftsService.hoursForMonth(
          deliveryGuyId,
          start,
          end,
        )
      : { hoursWorked: 0, earnedAmount: 0, shifts: 0 };

    const monthFeesEarned = isHourly
      ? shiftStats.earnedAmount
      : Number((monthStats.feesEarned ?? 0).toFixed(2));

    return {
      id: String(guy._id),
      fullName: guy.fullName,
      phone: guy.phone,
      city: guy.city,
      vehicleType: guy.vehicleType,
      feeModel: guy.feeModel,
      flatFee: guy.flatFee,
      percentRate: guy.percentRate,
      baseFee: guy.baseFee,
      perItemFee: guy.perItemFee,
      hourlyRate: guy.hourlyRate,
      feeSummary: feeModelSummary(guy),
      month,
      lifetimeDeliveries: guy.totalDeliveries,
      lifetimeFeesEarned: guy.totalFeesEarned,
      monthDeliveries: monthStats.deliveries ?? 0,
      monthFeesEarned,
      monthOrderTotal: Number((monthStats.orderTotal ?? 0).toFixed(2)),
      monthHoursWorked: shiftStats.hoursWorked,
      monthShifts: shiftStats.shifts,
      activeOrders: pending.activeOrders ?? 0,
      pendingFees: isHourly
        ? 0
        : Number((pending.pendingFees ?? 0).toFixed(2)),
      recentDeliveries: monthOrders.map((o) => {
        const json = o.toJSON() as unknown as Record<string, unknown>;
        return {
          id: json.id,
          orderNumber: json.orderNumber,
          shopName: json.shopName,
          total: json.total,
          deliveryFee: json.deliveryFee,
          deliveryPhotoUrl: absoluteMediaUrl(
            typeof json.deliveryPhotoUrl === 'string'
              ? json.deliveryPhotoUrl
              : '',
          ),
          deliveredAt: json.deliveredAt ?? json.updatedAt,
        };
      }),
    };
  }

  async assignDelivery(
    orderId: string,
    dto: AssignOrderDeliveryDto,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    this.sanitizeLegacyStatus(order);
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
    await this.pushService.notifyUser(String(guy._id), {
      title: `طلب جديد للتوصيل`,
      body: `${order.orderNumber} — ${order.shopName}`,
      url: `/orders/${String(order._id)}`,
      tag: `order-assigned-${String(order._id)}`,
    });
  }

  private async priceItems(
    items: CheckoutDto['items'],
    shopDiscountPercent = 0,
  ) {
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
        shopDiscountPercent,
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

  private async priceWalkInItems(
    items: WalkInSaleDto['items'],
    shopDiscountPercent = 0,
  ) {
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
      const override =
        item.unitPrice != null && Number.isFinite(Number(item.unitPrice))
          ? Number(item.unitPrice)
          : null;
      const unitPrice =
        override != null
          ? override
          : resolveUnitPrice(
              item.quantity,
              product.basePrice,
              product.tieredPricing ?? [],
              shopDiscountPercent,
            ).unitPrice;
      const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
      lines.push({
        productId: product._id,
        title: product.title,
        sku: product.sku || '',
        qualityGrade: product.qualityGrade,
        quantity: item.quantity,
        unitPrice,
        lineTotal,
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
