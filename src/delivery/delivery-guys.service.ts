import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  DeliveryFeeModel,
  DeliveryGuyStatus,
} from '../common/enums/delivery.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import {
  CalculateDeliveryFeeDto,
  CreateDeliveryGuyDto,
  UpdateDeliveryGuyDto,
} from './dto/delivery-guy.dto';
import {
  DeliveryGuy,
  DeliveryGuyDocument,
} from './schemas/delivery-guy.schema';

@Injectable()
export class DeliveryGuysService {
  constructor(
    @InjectModel(DeliveryGuy.name)
    private readonly guyModel: Model<DeliveryGuy>,
  ) {}

  async create(dto: CreateDeliveryGuyDto): Promise<DeliveryGuyDocument> {
    const phone = dto.phone.trim();
    const exists = await this.guyModel.exists({ phone }).exec();
    if (exists) {
      throw new ConflictException('A delivery guy with this phone already exists');
    }
    return this.guyModel.create({
      fullName: dto.fullName.trim(),
      phone,
      city: dto.city?.trim() || '',
      vehicleType: dto.vehicleType?.trim() || '',
      notes: dto.notes?.trim() || '',
      status: dto.status ?? DeliveryGuyStatus.ACTIVE,
      feeModel: dto.feeModel ?? DeliveryFeeModel.FLAT,
      flatFee: dto.flatFee ?? 30,
      percentRate: dto.percentRate ?? 0,
      baseFee: dto.baseFee ?? 20,
      perItemFee: dto.perItemFee ?? 2,
      totalDeliveries: 0,
      totalFeesEarned: 0,
    });
  }

  async findAll(
    page?: number,
    limit?: number,
    q?: string,
    status?: DeliveryGuyStatus,
  ): Promise<PaginatedResult<DeliveryGuyDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    if (q?.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter['$or'] = [{ fullName: rx }, { phone: rx }, { city: rx }];
    }
    const [items, total] = await Promise.all([
      this.guyModel
        .find(filter)
        .sort({ fullName: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.guyModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async findById(id: string): Promise<DeliveryGuyDocument> {
    const guy = await this.guyModel.findById(id).exec();
    if (!guy) throw new NotFoundException('Delivery guy not found');
    return guy;
  }

  async update(
    id: string,
    dto: UpdateDeliveryGuyDto,
  ): Promise<DeliveryGuyDocument> {
    const guy = await this.findById(id);
    if (dto.phone && dto.phone.trim() !== guy.phone) {
      const exists = await this.guyModel
        .exists({ phone: dto.phone.trim(), _id: { $ne: guy._id } })
        .exec();
      if (exists) {
        throw new ConflictException(
          'A delivery guy with this phone already exists',
        );
      }
      guy.phone = dto.phone.trim();
    }
    if (dto.fullName !== undefined) guy.fullName = dto.fullName.trim();
    if (dto.city !== undefined) guy.city = dto.city.trim();
    if (dto.vehicleType !== undefined) guy.vehicleType = dto.vehicleType.trim();
    if (dto.notes !== undefined) guy.notes = dto.notes.trim();
    if (dto.status !== undefined) guy.status = dto.status;
    if (dto.feeModel !== undefined) guy.feeModel = dto.feeModel;
    if (dto.flatFee !== undefined) guy.flatFee = dto.flatFee;
    if (dto.percentRate !== undefined) guy.percentRate = dto.percentRate;
    if (dto.baseFee !== undefined) guy.baseFee = dto.baseFee;
    if (dto.perItemFee !== undefined) guy.perItemFee = dto.perItemFee;
    await guy.save();
    return guy;
  }

  async remove(id: string): Promise<void> {
    const res = await this.guyModel.deleteOne({ _id: id }).exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Delivery guy not found');
    }
  }

  /** Pure fee calculation from a courier's fee settings. */
  calculateFee(
    guy: Pick<
      DeliveryGuy,
      'feeModel' | 'flatFee' | 'percentRate' | 'baseFee' | 'perItemFee'
    >,
    input: CalculateDeliveryFeeDto,
  ): number {
    const orderTotal = Math.max(0, Number(input.orderTotal) || 0);
    const itemCount = Math.max(0, Math.floor(Number(input.itemCount) || 0));

    let fee = 0;
    switch (guy.feeModel) {
      case DeliveryFeeModel.PERCENT:
        fee = (orderTotal * (guy.percentRate || 0)) / 100;
        break;
      case DeliveryFeeModel.BASE_PLUS_ITEMS:
        fee = (guy.baseFee || 0) + itemCount * (guy.perItemFee || 0);
        break;
      case DeliveryFeeModel.FLAT:
      default:
        fee = guy.flatFee || 0;
        break;
    }
    return Number(fee.toFixed(2));
  }

  async calculateFeeForGuy(
    id: string,
    input: CalculateDeliveryFeeDto,
  ): Promise<{ fee: number; feeModel: DeliveryFeeModel; guyId: string }> {
    const guy = await this.findById(id);
    return {
      fee: this.calculateFee(guy, input),
      feeModel: guy.feeModel,
      guyId: String(guy._id),
    };
  }

  async recordDeliveryStats(
    id: string,
    fee: number,
  ): Promise<DeliveryGuyDocument> {
    const guy = await this.findById(id);
    guy.totalDeliveries += 1;
    guy.totalFeesEarned = Number(
      (guy.totalFeesEarned + Math.max(0, fee)).toFixed(2),
    );
    await guy.save();
    return guy;
  }
}
