import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus, PaymentMethod } from '../common/enums/order.enums';
import {
  ReturnRefundMethod,
  ReturnRequestStatus,
} from '../common/enums/return.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { withBranchFilter } from '../common/branch-scope';
import { OrdersService } from '../orders/orders.service';
import { ProductsService } from '../products/products.service';
import { PushService } from '../push/push.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  ApproveReturnDto,
  CreateReturnRequestDto,
  RejectReturnDto,
} from './dto/return.dto';
import {
  ReturnRequest,
  ReturnRequestDocument,
} from './schemas/return-request.schema';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectModel(ReturnRequest.name)
    private readonly returnModel: Model<ReturnRequest>,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly walletsService: WalletsService,
    private readonly pushService: PushService,
  ) {}

  async create(
    shopUserId: string,
    dto: CreateReturnRequestDto,
  ): Promise<Record<string, unknown>> {
    const order = await this.ordersService.getForShop(
      shopUserId,
      dto.orderId,
    );

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Return requests are only allowed for delivered orders',
      );
    }

    const returnedQty = await this.returnedQuantitiesForOrder(
      String(order._id),
    );
    const resolvedItems = this.resolveReturnItems(order.items, dto.items, returnedQty);
    const refundAmount = Number(
      resolvedItems
        .reduce((sum, line) => sum + line.lineTotal, 0)
        .toFixed(2),
    );

    const created = await this.returnModel.create({
      shopId: order.shopId,
      shopName: order.shopName,
      branchId: order.branchId,
      orderId: order._id,
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      items: resolvedItems,
      refundAmount,
      reason: dto.reason.trim(),
      status: ReturnRequestStatus.PENDING,
      adminNote: '',
    });

    return this.toView(created);
  }

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = { shopId: new Types.ObjectId(shopId) };
    const [items, total] = await Promise.all([
      this.returnModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.returnModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async getForShop(
    shopId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const req = await this.findByIdOrFail(id);
    if (String(req.shopId) !== shopId) {
      throw new ForbiddenException('Return request does not belong to this shop');
    }
    return this.toView(req);
  }

  async listAll(
    status?: ReturnRequestStatus,
    page?: number,
    limit?: number,
    q?: string,
    branchScope?: string | null,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    const term = q?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      filter['$or'] = [
        { shopName: rx },
        { orderNumber: rx },
        { reason: rx },
      ];
    }
    const scoped = withBranchFilter(filter, branchScope ?? null);
    const [items, total] = await Promise.all([
      this.returnModel
        .find(scoped)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.returnModel.countDocuments(scoped).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async getById(id: string): Promise<Record<string, unknown>> {
    return this.toView(await this.findByIdOrFail(id));
  }

  /** Live count of PENDING return requests (admin nav badge). */
  async pendingCount(branchScope?: string | null): Promise<{ count: number }> {
    const filter = withBranchFilter(
      { status: ReturnRequestStatus.PENDING },
      branchScope ?? null,
    );
    const count = await this.returnModel.countDocuments(filter).exec();
    return { count };
  }

  async approve(
    id: string,
    adminId: string,
    dto: ApproveReturnDto,
  ): Promise<Record<string, unknown>> {
    const req = await this.findByIdOrFail(id);
    if (req.status !== ReturnRequestStatus.PENDING) {
      throw new BadRequestException('Only pending return requests can be approved');
    }

    for (const line of req.items) {
      await this.productsService.incrementStock(
        String(line.productId),
        line.quantity,
      );
    }

    let refundMethod = ReturnRefundMethod.NONE;
    if (req.paymentMethod === PaymentMethod.CREDIT && req.refundAmount > 0) {
      await this.walletsService.applyReturnCredit(
        String(req.shopId),
        req.refundAmount,
        req.orderId,
        adminId,
        `Return ${req.orderNumber}: ${req.reason}`,
      );
      refundMethod = ReturnRefundMethod.WALLET_CREDIT;
    }

    req.status = ReturnRequestStatus.APPROVED;
    req.refundMethod = refundMethod;
    req.adminNote = dto.adminNote?.trim() || req.adminNote || '';
    req.reviewedAt = new Date();
    req.reviewedBy = new Types.ObjectId(adminId);
    await req.save();

    await this.pushService.notifyUser(String(req.shopId), {
      title: 'تم قبول طلب الإرجاع',
      body: `طلب إرجاع ${req.orderNumber} بمبلغ ${req.refundAmount} ج.م`,
      url: `/returns`,
      tag: `return-approved-${req.id}`,
    });

    return this.toView(req);
  }

  async reject(
    id: string,
    adminId: string,
    dto: RejectReturnDto,
  ): Promise<Record<string, unknown>> {
    const req = await this.findByIdOrFail(id);
    if (req.status !== ReturnRequestStatus.PENDING) {
      throw new BadRequestException('Only pending return requests can be rejected');
    }

    req.status = ReturnRequestStatus.REJECTED;
    req.adminNote = dto.reason.trim();
    req.refundMethod = ReturnRefundMethod.NONE;
    req.reviewedAt = new Date();
    req.reviewedBy = new Types.ObjectId(adminId);
    await req.save();

    await this.pushService.notifyUser(String(req.shopId), {
      title: 'تم رفض طلب الإرجاع',
      body: `طلب إرجاع ${req.orderNumber}: ${req.adminNote}`,
      url: `/returns`,
      tag: `return-rejected-${req.id}`,
    });

    return this.toView(req);
  }

  private async findByIdOrFail(id: string): Promise<ReturnRequestDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Return request not found');
    }
    const req = await this.returnModel.findById(id).exec();
    if (!req) throw new NotFoundException('Return request not found');
    return req;
  }

  /**
   * Sum of quantities already claimed in PENDING or APPROVED returns
   * for each product on an order (REJECTED does not count).
   */
  private async returnedQuantitiesForOrder(
    orderId: string,
  ): Promise<Map<string, number>> {
    const prior = await this.returnModel
      .find({
        orderId: new Types.ObjectId(orderId),
        status: {
          $in: [ReturnRequestStatus.PENDING, ReturnRequestStatus.APPROVED],
        },
      })
      .select('items')
      .exec();

    const map = new Map<string, number>();
    for (const req of prior) {
      for (const line of req.items) {
        const key = String(line.productId);
        map.set(key, (map.get(key) ?? 0) + line.quantity);
      }
    }
    return map;
  }

  private resolveReturnItems(
    orderItems: Array<{
      productId: Types.ObjectId;
      title: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>,
    requested: Array<{ productId: string; quantity: number }>,
    alreadyReturned: Map<string, number>,
  ) {
    const byProduct = new Map<
      string,
      {
        productId: Types.ObjectId;
        title: string;
        sku: string;
        quantity: number;
        unitPrice: number;
      }
    >();
    for (const line of orderItems) {
      const key = String(line.productId);
      const existing = byProduct.get(key);
      if (existing) {
        existing.quantity += line.quantity;
      } else {
        byProduct.set(key, {
          productId: line.productId,
          title: line.title,
          sku: line.sku ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        });
      }
    }

    const seen = new Set<string>();
    const resolved: Array<{
      productId: Types.ObjectId;
      title: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];

    for (const req of requested) {
      const key = req.productId;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Duplicate productId in return items: ${key}`,
        );
      }
      seen.add(key);

      const orderLine = byProduct.get(key);
      if (!orderLine) {
        throw new BadRequestException(
          `Product ${key} is not part of this order`,
        );
      }

      const used = alreadyReturned.get(key) ?? 0;
      const available = orderLine.quantity - used;
      if (req.quantity > available) {
        throw new BadRequestException(
          `Cannot return ${req.quantity} of ${orderLine.title}; only ${available} remaining`,
        );
      }

      const lineTotal = Number((orderLine.unitPrice * req.quantity).toFixed(2));
      resolved.push({
        productId: orderLine.productId,
        title: orderLine.title,
        sku: orderLine.sku,
        quantity: req.quantity,
        unitPrice: orderLine.unitPrice,
        lineTotal,
      });
    }

    return resolved;
  }

  private toView(req: ReturnRequestDocument): Record<string, unknown> {
    return req.toJSON() as unknown as Record<string, unknown>;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
