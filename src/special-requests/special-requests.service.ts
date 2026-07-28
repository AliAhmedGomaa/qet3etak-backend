import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SpecialRequestStatus } from '../common/enums/special-request.enums';
import { absoluteMediaUrl } from '../common/media-url';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { PushService } from '../push/push.service';
import { UsersService } from '../users/users.service';
import {
  CreateSpecialRequestDto,
  QuoteSpecialRequestDto,
} from '../push/dto/push.dto';
import {
  SpecialRequest,
  SpecialRequestDocument,
} from './schemas/special-request.schema';

@Injectable()
export class SpecialRequestsService {
  constructor(
    @InjectModel(SpecialRequest.name)
    private readonly requestModel: Model<SpecialRequest>,
    private readonly usersService: UsersService,
    private readonly pushService: PushService,
  ) {}

  async create(
    shopUserId: string,
    dto: CreateSpecialRequestDto,
    photoFilename?: string,
  ): Promise<Record<string, unknown>> {
    const shop = await this.usersService.findByIdOrFail(shopUserId);
    const photoUrl =
      photoFilename != null
        ? `/uploads/${photoFilename}`
        : dto.photoUrl?.trim();
    if (!photoUrl) {
      throw new BadRequestException('Photo of the rare part is required');
    }

    const created = await this.requestModel.create({
      shopId: new Types.ObjectId(shopUserId),
      shopName: shop.shopName,
      deviceModel: dto.deviceModel.trim(),
      partName: dto.partName.trim(),
      quantity: dto.quantity,
      targetPrice: dto.targetPrice,
      photoUrl,
      status: SpecialRequestStatus.PENDING,
      adminReply: '',
    });

    await this.pushService.notifyAdmins({
      title: 'طلب قطعة نادرة',
      body: `${shop.shopName} — ${created.partName} (${created.deviceModel})`,
      url: '/special-requests',
      tag: `special-new-${String(created._id)}`,
    });

    return this.toRequestView(created);
  }

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = { shopId: new Types.ObjectId(shopId) };
    const [items, total] = await Promise.all([
      this.requestModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.requestModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toRequestView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async listAll(
    status?: SpecialRequestStatus,
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    const term = q?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      filter['$or'] = [
        { shopName: rx },
        { deviceModel: rx },
        { partName: rx },
      ];
    }
    const [items, total] = await Promise.all([
      this.requestModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.requestModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toRequestView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async quote(
    id: string,
    dto: QuoteSpecialRequestDto,
  ): Promise<Record<string, unknown>> {
    const req = await this.requestModel.findById(id).exec();
    if (!req) throw new NotFoundException('Special request not found');

    req.quotePrice = dto.quotePrice;
    req.adminReply = dto.adminReply?.trim() || req.adminReply || '';
    if (dto.estimatedArrival) {
      const d = new Date(dto.estimatedArrival);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid estimatedArrival date');
      }
      req.estimatedArrival = d;
    }
    req.status = SpecialRequestStatus.QUOTED;
    req.quotedAt = new Date();
    await req.save();

    const arrival = req.estimatedArrival
      ? ` · ETA ${req.estimatedArrival.toISOString().slice(0, 10)}`
      : '';
    await this.pushService.notifyUser(String(req.shopId), {
      title: 'تم تسعير طلبك الخاص',
      body: `${req.partName} — عرض سعر ${req.quotePrice} ر.س${arrival}`,
      url: '/special-requests',
      tag: `special-${req.id}`,
    });

    return this.toRequestView(req);
  }

  async fulfill(id: string): Promise<Record<string, unknown>> {
    const req = await this.requestModel.findById(id).exec();
    if (!req) throw new NotFoundException('Special request not found');
    req.status = SpecialRequestStatus.FULFILLED;
    await req.save();
    await this.pushService.notifyUser(String(req.shopId), {
      title: 'تم توفير القطعة النادرة',
      body: `${req.partName} لـ ${req.deviceModel} جاهزة للتأكيد`,
      url: '/special-requests',
      tag: `special-done-${req.id}`,
    });
    return this.toRequestView(req);
  }

  private toRequestView(req: SpecialRequestDocument): Record<string, unknown> {
    const json = req.toJSON() as unknown as Record<string, unknown>;
    return {
      ...json,
      photoUrl: absoluteMediaUrl(
        typeof json.photoUrl === 'string' ? json.photoUrl : '',
      ),
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
