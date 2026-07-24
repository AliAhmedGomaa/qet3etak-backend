import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PurchaseOrderStatus } from '../common/enums/purchasing.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { ProductsService } from '../products/products.service';
import {
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
  ExtraCostsDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from './schemas/purchase-order.schema';
import { SuppliersService } from './suppliers.service';

function toView(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

interface ComputedItem {
  productId: Types.ObjectId;
  title: string;
  quantity: number;
  unitPurchasePrice: number;
  landedCostPerUnit: number;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private readonly poModel: Model<PurchaseOrder>,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
  ) {}

  async create(dto: CreatePurchaseOrderDto): Promise<Record<string, unknown>> {
    await this.suppliersService.findDocumentById(dto.supplierId);
    const extra = this.normalizeExtra(dto.extraCosts);
    const { items, totalAmount } = await this.buildItems(dto.items, extra);
    const status = dto.status ?? PurchaseOrderStatus.DRAFT;

    const po = await this.poModel.create({
      reference: await this.nextReference(),
      supplierId: new Types.ObjectId(dto.supplierId),
      orderDate: dto.orderDate ? new Date(dto.orderDate) : new Date(),
      status,
      items,
      extraCosts: extra,
      totalAmount,
      notes: dto.notes?.trim() || '',
    });

    // If created directly as RECEIVED, apply stock immediately.
    if (status === PurchaseOrderStatus.RECEIVED) {
      await this.receiveStock(po);
    }

    return toView(po);
  }

  async findAll(
    page?: number,
    limit?: number,
    status?: PurchaseOrderStatus,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      this.poModel
        .find(filter)
        .populate('supplierId', 'name currency')
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.poModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((po) => toView(po)),
      total,
      p.page,
      p.limit,
    );
  }

  async findDocumentById(id: string): Promise<PurchaseOrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Purchase order not found');
    }
    const po = await this.poModel.findById(id).exec();
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    const po = await this.poModel
      .findById(id)
      .populate('supplierId', 'name currency phone country')
      .exec();
    if (!po) throw new NotFoundException('Purchase order not found');
    return toView(po);
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<Record<string, unknown>> {
    const po = await this.findDocumentById(id);
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot edit a purchase order that has already been received',
      );
    }
    if (dto.orderDate != null) po.orderDate = new Date(dto.orderDate);
    if (dto.notes != null) po.notes = dto.notes.trim();

    const extra = dto.extraCosts
      ? this.normalizeExtra(dto.extraCosts)
      : po.extraCosts;

    if (dto.items != null || dto.extraCosts != null) {
      const sourceItems: PurchaseOrderItemDto[] = dto.items
        ? dto.items
        : po.items.map((i) => ({
            productId: String(i.productId),
            quantity: i.quantity,
            unitPurchasePrice: i.unitPurchasePrice,
          }));
      const { items, totalAmount } = await this.buildItems(sourceItems, extra);
      po.items = items;
      po.extraCosts = extra;
      po.totalAmount = totalAmount;
    }
    await po.save();
    return toView(po);
  }

  async updateStatus(
    id: string,
    status: PurchaseOrderStatus,
  ): Promise<Record<string, unknown>> {
    const po = await this.findDocumentById(id);

    if (po.status === status) return toView(po);

    if (
      status === PurchaseOrderStatus.RECEIVED &&
      po.status !== PurchaseOrderStatus.RECEIVED
    ) {
      po.status = PurchaseOrderStatus.RECEIVED;
      await this.receiveStock(po);
    } else if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'A received purchase order cannot change status',
      );
    } else {
      po.status = status;
      await po.save();
    }
    return toView(po);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const po = await this.findDocumentById(id);
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot delete a received purchase order',
      );
    }
    await po.deleteOne();
    return { deleted: true };
  }

  /**
   * Apply received stock: increment product stock & recalc weighted-average
   * cost for every line, then add the order total to the supplier balance.
   * Guarded by `receivedAt` so it can only run once.
   */
  private async receiveStock(po: PurchaseOrderDocument): Promise<void> {
    if (po.receivedAt) return;
    for (const item of po.items) {
      await this.productsService.applyReceivedStock(
        String(item.productId),
        item.quantity,
        item.landedCostPerUnit,
      );
    }
    po.receivedAt = new Date();
    await po.save();
    await this.suppliersService.adjustBalance(
      String(po.supplierId),
      po.totalAmount,
    );
  }

  /**
   * Compute per-unit landed cost by allocating the order's extra costs across
   * lines in proportion to each line's purchase value.
   */
  private async buildItems(
    rawItems: PurchaseOrderItemDto[],
    extra: { shippingFee: number; customsFee: number; otherExpenses: number },
  ): Promise<{ items: ComputedItem[]; totalAmount: number }> {
    const ids = rawItems.map((i) => i.productId);
    const invalid = ids.filter((id) => !Types.ObjectId.isValid(id));
    if (invalid.length) {
      throw new BadRequestException(`Invalid product ids: ${invalid.join(', ')}`);
    }

    const products = await Promise.all(
      ids.map((id) => this.productsService.findDocumentById(id)),
    );
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const itemsSubtotal = rawItems.reduce(
      (sum, i) => sum + i.quantity * i.unitPurchasePrice,
      0,
    );
    const extraTotal =
      extra.shippingFee + extra.customsFee + extra.otherExpenses;

    const items: ComputedItem[] = rawItems.map((raw) => {
      const product = byId.get(raw.productId)!;
      const lineValue = raw.quantity * raw.unitPurchasePrice;
      const allocatedExtra =
        itemsSubtotal > 0 ? (extraTotal * lineValue) / itemsSubtotal : 0;
      const landedCostPerUnit = Number(
        (raw.unitPurchasePrice + allocatedExtra / raw.quantity).toFixed(4),
      );
      return {
        productId: product._id as Types.ObjectId,
        title: product.title,
        quantity: raw.quantity,
        unitPurchasePrice: raw.unitPurchasePrice,
        landedCostPerUnit,
      };
    });

    const totalAmount = Number((itemsSubtotal + extraTotal).toFixed(2));
    return { items, totalAmount };
  }

  private normalizeExtra(extra?: ExtraCostsDto): {
    shippingFee: number;
    customsFee: number;
    otherExpenses: number;
  } {
    return {
      shippingFee: extra?.shippingFee ?? 0,
      customsFee: extra?.customsFee ?? 0,
      otherExpenses: extra?.otherExpenses ?? 0,
    };
  }

  private async nextReference(): Promise<string> {
    const count = await this.poModel.countDocuments();
    const seq = String(count + 1).padStart(5, '0');
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `PO-${day}-${seq}`;
  }
}
