import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InvoiceStatus } from '../common/enums/invoice.enums';
import { PaymentMethod } from '../common/enums/order.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { withBranchFilter } from '../common/branch-scope';
import { UsersService } from '../users/users.service';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';

/** Minimal order shape needed to snapshot an invoice at checkout. */
export type OrderInvoiceSource = {
  _id: Types.ObjectId;
  orderNumber: string;
  shopId: Types.ObjectId;
  shopName: string;
  branchId?: Types.ObjectId;
  paymentMethod: PaymentMethod;
  items: Array<{
    productId?: Types.ObjectId;
    title: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  total: number;
  notes?: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildInvoiceSearchFilter(q?: string): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return {};
  const rx = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [
      { invoiceNumber: rx },
      { orderNumber: rx },
      { shopName: rx },
    ],
  };
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Auto-issue an invoice when an order is placed (checkout).
   * Idempotent: one invoice per orderId.
   */
  async issueFromOrder(order: OrderInvoiceSource): Promise<InvoiceDocument> {
    const existing = await this.invoiceModel
      .findOne({ orderId: order._id })
      .exec();
    if (existing) return existing;

    const shop = await this.usersService.findByIdOrFail(String(order.shopId));
    const invoiceNumber = await this.nextInvoiceNumber();

    try {
      return await this.invoiceModel.create({
        invoiceNumber,
        orderId: order._id,
        orderNumber: order.orderNumber,
        shopId: order.shopId,
        shopName: order.shopName || shop.shopName,
        branchId: order.branchId ?? shop.branchId,
        seller: this.sellerFromConfig(),
        buyer: {
          name: shop.shopName || order.shopName,
          phone: shop.phone || '',
          city: shop.city || '',
          address: shop.address || '',
          taxId: '',
        },
        items: (order.items ?? []).map((line) => ({
          productId: line.productId,
          title: line.title,
          sku: line.sku || '',
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        })),
        subtotal: order.subtotal,
        total: order.total,
        paymentMethod: order.paymentMethod,
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        notes: order.notes?.trim() || '',
      });
    } catch (err: unknown) {
      // Race: another concurrent checkout issued the same order invoice.
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code?: number }).code
          : undefined;
      if (code === 11000) {
        const again = await this.invoiceModel
          .findOne({ orderId: order._id })
          .exec();
        if (again) return again;
      }
      throw err;
    }
  }

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<InvoiceDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {
      shopId: new Types.ObjectId(shopId),
      ...buildInvoiceSearchFilter(q),
    };
    const [items, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ issuedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.invoiceModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async getForShop(shopId: string, invoiceId: string): Promise<InvoiceDocument> {
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = await this.invoiceModel
      .findOne({
        _id: new Types.ObjectId(invoiceId),
        shopId: new Types.ObjectId(shopId),
      })
      .exec();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async getByOrderForShop(
    shopId: string,
    orderId: string,
  ): Promise<InvoiceDocument> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = await this.invoiceModel
      .findOne({
        orderId: new Types.ObjectId(orderId),
        shopId: new Types.ObjectId(shopId),
      })
      .exec();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async listAll(
    page?: number,
    limit?: number,
    q?: string,
    status?: InvoiceStatus,
    branchScope?: string | null,
  ): Promise<PaginatedResult<InvoiceDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter = withBranchFilter(
      {
        ...buildInvoiceSearchFilter(q),
        ...(status ? { status } : {}),
      },
      branchScope ?? null,
    );
    const [items, total] = await Promise.all([
      this.invoiceModel
        .find(filter)
        .sort({ issuedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.invoiceModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async getById(invoiceId: string): Promise<InvoiceDocument> {
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new NotFoundException('Invoice not found');
    }
    const invoice = await this.invoiceModel.findById(invoiceId).exec();
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async voidInvoice(invoiceId: string): Promise<InvoiceDocument> {
    const invoice = await this.getById(invoiceId);
    if (invoice.status === InvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is already void');
    }
    invoice.status = InvoiceStatus.VOID;
    await invoice.save();
    return invoice;
  }

  private sellerFromConfig() {
    return {
      name:
        this.config.get<string>('INVOICE_SELLER_NAME')?.trim() ||
        'قطع غيار — Qet3etak',
      phone: this.config.get<string>('INVOICE_SELLER_PHONE')?.trim() || '',
      city: this.config.get<string>('INVOICE_SELLER_CITY')?.trim() || '',
      address: this.config.get<string>('INVOICE_SELLER_ADDRESS')?.trim() || '',
      taxId: this.config.get<string>('INVOICE_SELLER_TAX_ID')?.trim() || '',
    };
  }

  private async nextInvoiceNumber(): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INV-${day}-`;
    const latest = await this.invoiceModel
      .findOne({ invoiceNumber: new RegExp(`^${prefix}`) })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber')
      .lean()
      .exec();
    let seq = 1;
    if (latest?.invoiceNumber) {
      const tail = latest.invoiceNumber.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n)) seq = n + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }
}
