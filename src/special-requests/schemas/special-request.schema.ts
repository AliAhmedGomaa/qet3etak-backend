import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SpecialRequestStatus } from '../../common/enums/special-request.enums';

export type SpecialRequestDocument = HydratedDocument<SpecialRequest>;

@Schema({ timestamps: true, collection: 'special_requests' })
export class SpecialRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  @Prop({ required: true, trim: true })
  deviceModel!: string;

  @Prop({ required: true, trim: true })
  partName!: string;

  @Prop({ required: true, min: 1, default: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  targetPrice!: number;

  @Prop({ required: true })
  photoUrl!: string;

  @Prop({
    type: String,
    enum: SpecialRequestStatus,
    default: SpecialRequestStatus.PENDING,
    index: true,
  })
  status!: SpecialRequestStatus;

  @Prop({ min: 0 })
  quotePrice?: number;

  @Prop()
  estimatedArrival?: Date;

  @Prop({ trim: true, default: '' })
  adminReply!: string;

  @Prop()
  quotedAt?: Date;
}

export const SpecialRequestSchema =
  SchemaFactory.createForClass(SpecialRequest);

SpecialRequestSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
