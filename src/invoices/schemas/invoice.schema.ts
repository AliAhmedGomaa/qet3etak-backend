import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { InvoiceStatus } from '../../common/enums/invoice.enums';
import { PaymentMethod } from '../../common/enums/order.enums';

export type InvoiceDocument = HydratedDocument<Invoice>;

@Schema({ _id: false })
export class InvoiceLineItem {
  @Prop({ type: Types.ObjectId, ref: 'Product' })
  productId?: Types.ObjectId;

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

export const InvoiceLineItemSchema =
  SchemaFactory.createForClass(InvoiceLineItem);

@Schema({ _id: false })
export class InvoiceParty {
  @Prop({ default: '' })
  name!: string;

  @Prop({ default: '' })
  phone!: string;

  @Prop({ default: '' })
  city!: string;

  @Prop({ default: '' })
  address!: string;

  @Prop({ default: '' })
  taxId!: string;
}

export const InvoicePartySchema = SchemaFactory.createForClass(InvoiceParty);

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ required: true, unique: true, index: true })
  invoiceNumber!: string;

  /** One invoice per order. */
  @Prop({
    type: Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true,
  })
  orderId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  orderNumber!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true })
  shopName!: string;

  @Prop({ type: InvoicePartySchema, required: true })
  seller!: InvoiceParty;

  @Prop({ type: InvoicePartySchema, required: true })
  buyer!: InvoiceParty;

  @Prop({ type: [InvoiceLineItemSchema], required: true })
  items!: InvoiceLineItem[];

  @Prop({ required: true, min: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({ type: String, enum: PaymentMethod, required: true })
  paymentMethod!: PaymentMethod;

  @Prop({
    type: String,
    enum: InvoiceStatus,
    default: InvoiceStatus.ISSUED,
    index: true,
  })
  status!: InvoiceStatus;

  @Prop({ default: () => new Date(), index: true })
  issuedAt!: Date;

  @Prop({ trim: true, default: '' })
  notes!: string;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);

InvoiceSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
