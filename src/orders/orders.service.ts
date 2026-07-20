import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, PaymentMethod } from '../common/enums/order.enums';
import { ProductsService } from '../products/products.service';
import { resolveUnitPrice } from '../products/pricing.util';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { PushService } from '../push/push.service';
import { CheckoutDto, UpdateOrderStatusDto } from './dto/order.dto';
import { Order, OrderDocument } from './schemas/order.schema';

const STATUS_FLOW: OrderStatus[] = [
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly productsService: ProductsService,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
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
      const product = await this.productsService.findById(String(line.productId));
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

    return order;
  }

  async listForShop(shopId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ shopId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async getForShop(shopId: string, orderId: string): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ _id: orderId, shopId }).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async listAll(): Promise<OrderDocument[]> {
    return this.orderModel.find().sort({ createdAt: -1 }).exec();
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
    if (currentIdx === nextIdx) return order;

    order.status = dto.status;
    order.statusHistory.push({
      status: dto.status,
      at: new Date(),
      note: dto.note?.trim() || `Status → ${dto.status}`,
    });
    await order.save();

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

    return order;
  }

  private async priceItems(items: CheckoutDto['items']) {
    const lines = [];
    for (const item of items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(`Invalid product id ${item.productId}`);
      }
      const product = await this.productsService.findById(item.productId);
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
