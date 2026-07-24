import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrderStatus, PaymentMethod } from '../../common/enums/order.enums';
import { QualityGrade } from '../../common/enums/product.enums';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  sku!: string;

  @Prop({ type: String, enum: QualityGrade })
  qualityGrade?: QualityGrade;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPrice!: number;

  @Prop({ required: true, min: 0 })
  lineTotal!: number;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderStatusEvent {
  @Prop({ type: String, enum: OrderStatus, required: true })
  status!: OrderStatus;

  @Prop({ default: () => new Date() })
  at!: Date;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const OrderStatusEventSchema =
  SchemaFactory.createForClass(OrderStatusEvent);

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ required: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.RECEIVED, index: true })
  status!: OrderStatus;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  paymentMethod!: PaymentMethod;

  @Prop({ type: [OrderItemSchema], required: true })
  items!: OrderItem[];

  @Prop({ required: true, min: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({ type: [OrderStatusEventSchema], default: [] })
  statusHistory!: OrderStatusEvent[];

  @Prop({ trim: true, default: '' })
  notes!: string;

  @Prop({ type: Types.ObjectId, ref: 'DeliveryGuy', index: true })
  deliveryGuyId?: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  deliveryGuyName!: string;

  /** Courier fee for this order (EGP), calculated from the guy’s fee model. */
  @Prop({ min: 0, default: 0 })
  deliveryFee!: number;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
