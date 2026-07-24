import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ReturnRefundMethod,
  ReturnRequestStatus,
} from '../../common/enums/return.enums';
import { PaymentMethod } from '../../common/enums/order.enums';

export type ReturnRequestDocument = HydratedDocument<ReturnRequest>;

@Schema({ _id: false })
export class ReturnItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  sku!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  lineTotal!: number;
}

export const ReturnItemSchema = SchemaFactory.createForClass(ReturnItem);

@Schema({ timestamps: true, collection: 'return_requests' })
export class ReturnRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  orderNumber!: string;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  paymentMethod!: PaymentMethod;

  @Prop({ type: [ReturnItemSchema], required: true })
  items!: ReturnItem[];

  @Prop({ required: true, min: 0 })
  refundAmount!: number;

  @Prop({ trim: true, required: true })
  reason!: string;

  @Prop({
    type: String,
    enum: ReturnRequestStatus,
    default: ReturnRequestStatus.PENDING,
    index: true,
  })
  status!: ReturnRequestStatus;

  @Prop({ trim: true, default: '' })
  adminNote!: string;

  @Prop({ type: String, enum: ReturnRefundMethod })
  refundMethod?: ReturnRefundMethod;

  @Prop()
  reviewedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;
}

export const ReturnRequestSchema = SchemaFactory.createForClass(ReturnRequest);

ReturnRequestSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
