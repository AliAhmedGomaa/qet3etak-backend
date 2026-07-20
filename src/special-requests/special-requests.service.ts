import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SpecialRequestStatus } from '../common/enums/special-request.enums';
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
  ): Promise<SpecialRequestDocument> {
    const shop = await this.usersService.findByIdOrFail(shopUserId);
    const photoUrl =
      photoFilename != null
        ? `/uploads/${photoFilename}`
        : dto.photoUrl?.trim();
    if (!photoUrl) {
      throw new BadRequestException('Photo of the rare part is required');
    }

    return this.requestModel.create({
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
  }

  listForShop(shopId: string): Promise<SpecialRequestDocument[]> {
    return this.requestModel
      .find({ shopId })
      .sort({ createdAt: -1 })
      .exec();
  }

  listAll(status?: SpecialRequestStatus): Promise<SpecialRequestDocument[]> {
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    return this.requestModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async quote(
    id: string,
    dto: QuoteSpecialRequestDto,
  ): Promise<SpecialRequestDocument> {
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
      url: `/special-requests`,
      tag: `special-${req.id}`,
    });

    return req;
  }

  async fulfill(id: string): Promise<SpecialRequestDocument> {
    const req = await this.requestModel.findById(id).exec();
    if (!req) throw new NotFoundException('Special request not found');
    req.status = SpecialRequestStatus.FULFILLED;
    await req.save();
    await this.pushService.notifyUser(String(req.shopId), {
      title: 'تم توفير القطعة النادرة',
      body: `${req.partName} لـ ${req.deviceModel} أصبحت للتأكيد`,
      url: `/special-requests`,
      tag: `special-done-${req.id}`,
    });
    return req;
  }
}
