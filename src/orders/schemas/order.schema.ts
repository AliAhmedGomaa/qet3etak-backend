import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrderStatus, OrderSource, PaymentMethod } from '../../common/enums/order.enums';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ default: '' })
  sku!: string;

  /** Snapshot of product quality name at order time. */
  @Prop({ type: String, trim: true })
  qualityGrade?: string;

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
  /**
   * Stored as string so legacy history rows (e.g. PREPARING) do not
   * break document saves after the status enum was narrowed.
   */
  @Prop({ type: String, required: true })
  status!: string;

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

  /** Denormalized from the shop at checkout for branch-scoped reports. */
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  /**
   * Sales channel. Legacy orders without this field are treated as WHOLESALE.
   */
  @Prop({
    type: String,
    enum: OrderSource,
    default: OrderSource.WHOLESALE,
    index: true,
  })
  source!: OrderSource;

  /** Optional walk-in customer name (counter sales). */
  @Prop({ trim: true, default: '' })
  customerName!: string;

  /** Optional walk-in customer phone. */
  @Prop({ trim: true, default: '' })
  customerPhone!: string;

  /** Admin/staff who created a walk-in sale. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdByUserId?: Types.ObjectId;

  /** Snapshot of shop address at checkout for courier navigation. */
  @Prop({ trim: true, default: '' })
  shopCity!: string;

  @Prop({ trim: true, default: '' })
  shopAddress!: string;

  @Prop({ type: Number })
  shopLocationLat?: number;

  @Prop({ type: Number })
  shopLocationLng?: number;

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

  /** Proof-of-delivery photo (data URL preferred; legacy `/uploads/...` paths supported). */
  @Prop({ trim: true, default: '' })
  deliveryPhotoUrl!: string;

  /** When the courier marked the order as delivered. */
  @Prop({ type: Date })
  deliveredAt?: Date;
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
