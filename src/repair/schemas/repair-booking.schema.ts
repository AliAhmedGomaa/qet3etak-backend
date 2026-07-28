import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RepairBookingStatus } from '../../common/enums/repair.enums';

export type RepairBookingDocument = HydratedDocument<RepairBooking>;

@Schema({ timestamps: true, collection: 'repair_bookings' })
export class RepairBooking {
  @Prop({ type: Types.ObjectId, ref: 'Brand', default: null })
  brandId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  brandName!: string;

  @Prop({ required: true, trim: true })
  deviceModel!: string;

  @Prop({ required: true, trim: true })
  issueCode!: string;

  @Prop({ trim: true, default: '' })
  issueDescription!: string;

  @Prop({ type: Number, min: 0, default: 0 })
  estimatedMin!: number;

  @Prop({ type: Number, min: 0, default: 0 })
  estimatedMax!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  preferredShopId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  preferredShopName!: string;

  @Prop({ default: false })
  homePickup!: boolean;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, trim: true, index: true })
  customerPhone!: string;

  @Prop({ trim: true, default: '' })
  city!: string;

  @Prop({ trim: true, default: '' })
  address!: string;

  @Prop({
    type: String,
    enum: RepairBookingStatus,
    default: RepairBookingStatus.PENDING,
    index: true,
  })
  status!: RepairBookingStatus;

  @Prop({ type: Types.ObjectId, ref: 'RepairTicket', default: null })
  ticketId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  ticketNumber!: string;
}

export const RepairBookingSchema = SchemaFactory.createForClass(RepairBooking);

RepairBookingSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
