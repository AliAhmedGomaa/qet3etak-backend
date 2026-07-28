import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  RepairTicketSource,
  RepairTicketStatus,
} from '../../common/enums/repair.enums';

export type RepairTicketDocument = HydratedDocument<RepairTicket>;

@Schema({ _id: false })
export class RepairStatusEvent {
  @Prop({ type: String, enum: RepairTicketStatus, required: true })
  status!: RepairTicketStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  at!: Date;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const RepairStatusEventSchema =
  SchemaFactory.createForClass(RepairStatusEvent);

@Schema({ timestamps: true, collection: 'repair_tickets' })
export class RepairTicket {
  @Prop({ required: true, unique: true, index: true, trim: true })
  ticketNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  shopName!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  customerId!: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  customerName!: string;

  @Prop({ required: true, trim: true, index: true })
  customerPhone!: string;

  @Prop({ type: Types.ObjectId, ref: 'Brand', default: null })
  brandId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  brandName!: string;

  @Prop({ required: true, trim: true })
  deviceModel!: string;

  @Prop({ trim: true, default: '' })
  issueCode!: string;

  @Prop({ required: true, trim: true })
  issueDescription!: string;

  @Prop({
    type: String,
    enum: RepairTicketStatus,
    default: RepairTicketStatus.RECEIVED,
    index: true,
  })
  status!: RepairTicketStatus;

  @Prop({ type: [RepairStatusEventSchema], default: [] })
  statusHistory!: RepairStatusEvent[];

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  requiredPartId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  requiredPartTitle!: string;

  @Prop({ type: Types.ObjectId, ref: 'Order', default: null })
  partsOrderId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  partsOrderNumber!: string;

  @Prop({ type: Number, min: 0, default: 0 })
  estimatedCost!: number;

  @Prop({ type: Number, min: 0, default: 0 })
  laborFee!: number;

  @Prop({ type: Number, min: 0, default: 0 })
  partsCost!: number;

  @Prop({ type: Number, min: 0, default: 0 })
  totalCost!: number;

  @Prop({ type: Number, min: 0, default: 0 })
  warrantyDays!: number;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ default: false })
  homePickup!: boolean;

  @Prop({ trim: true, default: '' })
  city!: string;

  @Prop({ trim: true, default: '' })
  address!: string;

  @Prop({
    type: String,
    enum: RepairTicketSource,
    default: RepairTicketSource.SHOP,
  })
  source!: RepairTicketSource;
}

export const RepairTicketSchema = SchemaFactory.createForClass(RepairTicket);

RepairTicketSchema.index({ shopId: 1, createdAt: -1 });
RepairTicketSchema.index({ status: 1, updatedAt: -1 });

RepairTicketSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
