import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';

function toView(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<Supplier>,
  ) {}

  async create(dto: CreateSupplierDto): Promise<Record<string, unknown>> {
    const supplier = await this.supplierModel.create({
      name: dto.name.trim(),
      phone: dto.phone?.trim() ?? '',
      country: dto.country?.trim() ?? '',
      currency: dto.currency?.trim().toUpperCase() || 'EGP',
      currentBalance: dto.currentBalance ?? 0,
    });
    return toView(supplier);
  }

  async findAll(
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 50);
    const [items, total] = await Promise.all([
      this.supplierModel
        .find()
        .sort({ name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.supplierModel.countDocuments().exec(),
    ]);
    return paginatedResult(
      items.map((s) => toView(s)),
      total,
      p.page,
      p.limit,
    );
  }

  async findDocumentById(id: string): Promise<SupplierDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Supplier not found');
    }
    const supplier = await this.supplierModel.findById(id).exec();
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    return toView(await this.findDocumentById(id));
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<Record<string, unknown>> {
    const supplier = await this.findDocumentById(id);
    if (dto.name != null) supplier.name = dto.name.trim();
    if (dto.phone != null) supplier.phone = dto.phone.trim();
    if (dto.country != null) supplier.country = dto.country.trim();
    if (dto.currency != null) {
      supplier.currency = dto.currency.trim().toUpperCase();
    }
    if (dto.currentBalance != null) {
      supplier.currentBalance = dto.currentBalance;
    }
    await supplier.save();
    return toView(supplier);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.supplierModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Supplier not found');
    return { deleted: true };
  }

  /** Adjust outstanding balance (positive = increase debt, negative = payment). */
  async adjustBalance(
    id: string,
    delta: number,
  ): Promise<SupplierDocument> {
    const supplier = await this.findDocumentById(id);
    supplier.currentBalance = Number(
      (supplier.currentBalance + delta).toFixed(2),
    );
    await supplier.save();
    return supplier;
  }

  async recordPayment(
    id: string,
    amount: number,
  ): Promise<Record<string, unknown>> {
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const supplier = await this.adjustBalance(id, -amount);
    return toView(supplier);
  }
}
