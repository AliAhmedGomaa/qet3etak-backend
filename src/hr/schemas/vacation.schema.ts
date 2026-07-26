import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { VacationStatus, VacationType } from '../../common/enums/hr.enums';

export type VacationRequestDocument = HydratedDocument<VacationRequest>;

@Schema({ timestamps: true, collection: 'vacation_requests' })
export class VacationRequest {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  from!: Date;

  @Prop({ type: Date, required: true })
  to!: Date;

  /** Inclusive calendar days. */
  @Prop({ required: true, min: 1 })
  days!: number;

  @Prop({
    type: String,
    enum: VacationType,
    default: VacationType.ANNUAL,
    index: true,
  })
  type!: VacationType;

  @Prop({
    type: String,
    enum: VacationStatus,
    default: VacationStatus.PENDING,
    index: true,
  })
  status!: VacationStatus;

  @Prop({ trim: true, default: '' })
  reason!: string;

  @Prop({ trim: true, default: '' })
  reviewNote!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;
}

export const VacationRequestSchema =
  SchemaFactory.createForClass(VacationRequest);

VacationRequestSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
