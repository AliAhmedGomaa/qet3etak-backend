import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BranchesService } from '../branches/branches.service';
import { DeliveryFeeModel } from '../common/enums/delivery.enums';
import { DeliveryLocationDto } from '../auth/dto/login.dto';
import { DeliveryGuysService } from './delivery-guys.service';
import {
  DeliveryShift,
  DeliveryShiftDocument,
} from './schemas/delivery-shift.schema';

@Injectable()
export class DeliveryShiftsService {
  constructor(
    @InjectModel(DeliveryShift.name)
    private readonly shiftModel: Model<DeliveryShift>,
    private readonly deliveryGuysService: DeliveryGuysService,
    private readonly branchesService: BranchesService,
  ) {}

  async getActiveShift(
    deliveryGuyId: string,
  ): Promise<DeliveryShiftDocument | null> {
    if (!Types.ObjectId.isValid(deliveryGuyId)) {
      throw new BadRequestException('Invalid delivery guy id');
    }
    return this.shiftModel
      .findOne({
        deliveryGuyId: new Types.ObjectId(deliveryGuyId),
        clockOutAt: null,
      })
      .sort({ clockInAt: -1 })
      .exec();
  }

  async clockIn(
    deliveryGuyId: string,
    dto: DeliveryLocationDto,
  ): Promise<DeliveryShiftDocument> {
    const guy = await this.deliveryGuysService.findById(deliveryGuyId);
    if (guy.feeModel === DeliveryFeeModel.HOURLY && (guy.hourlyRate ?? 0) <= 0) {
      throw new BadRequestException(
        'Hourly rate is not configured for this courier',
      );
    }

    const existing = await this.getActiveShift(deliveryGuyId);
    if (existing) {
      throw new BadRequestException('Already clocked in — clock out first');
    }

    const workplace = await this.branchesService.assertInsideWorkplace(
      Number(dto.lat),
      Number(dto.lng),
    );

    return this.shiftModel.create({
      deliveryGuyId: guy._id,
      branchId: new Types.ObjectId(workplace.branchId),
      clockInAt: new Date(),
      clockInLat: Number(dto.lat),
      clockInLng: Number(dto.lng),
      hoursWorked: 0,
      hourlyRate: guy.hourlyRate || 0,
      earnedAmount: 0,
    });
  }

  async clockOut(
    deliveryGuyId: string,
    dto: DeliveryLocationDto,
  ): Promise<DeliveryShiftDocument> {
    const shift = await this.getActiveShift(deliveryGuyId);
    if (!shift) {
      throw new NotFoundException('No active shift to clock out');
    }

    // Soft geofence on clock-out: prefer workplace, but allow if GPS fails? Enforce for consistency.
    await this.branchesService.assertInsideWorkplace(
      Number(dto.lat),
      Number(dto.lng),
    );

    const guy = await this.deliveryGuysService.findById(deliveryGuyId);
    const clockOutAt = new Date();
    const ms = clockOutAt.getTime() - shift.clockInAt.getTime();
    const hoursWorked = Math.max(0, Number((ms / 3_600_000).toFixed(4)));
    const hourlyRate =
      guy.feeModel === DeliveryFeeModel.HOURLY
        ? guy.hourlyRate || shift.hourlyRate || 0
        : 0;
    const earnedAmount = Number((hoursWorked * hourlyRate).toFixed(2));

    shift.clockOutAt = clockOutAt;
    shift.clockOutLat = Number(dto.lat);
    shift.clockOutLng = Number(dto.lng);
    shift.hoursWorked = hoursWorked;
    shift.hourlyRate = hourlyRate;
    shift.earnedAmount = earnedAmount;
    await shift.save();

    if (earnedAmount > 0) {
      await this.deliveryGuysService.addHourlyEarnings(
        deliveryGuyId,
        earnedAmount,
      );
    }

    return shift;
  }

  async hoursForMonth(
    deliveryGuyId: string,
    start: Date,
    end: Date,
  ): Promise<{ hoursWorked: number; earnedAmount: number; shifts: number }> {
    if (!Types.ObjectId.isValid(deliveryGuyId)) {
      throw new BadRequestException('Invalid delivery guy id');
    }
    const agg = await this.shiftModel
      .aggregate([
        {
          $match: {
            deliveryGuyId: new Types.ObjectId(deliveryGuyId),
            clockOutAt: { $gte: start, $lt: end },
          },
        },
        {
          $group: {
            _id: null,
            hoursWorked: { $sum: '$hoursWorked' },
            earnedAmount: { $sum: '$earnedAmount' },
            shifts: { $sum: 1 },
          },
        },
      ])
      .exec();
    const row = agg[0] ?? {};
    return {
      hoursWorked: Number((row.hoursWorked ?? 0).toFixed(4)),
      earnedAmount: Number((row.earnedAmount ?? 0).toFixed(2)),
      shifts: row.shifts ?? 0,
    };
  }
}
