import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PurchaseOrderStatus } from '../../common/enums/purchasing.enums';

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

@Schema({ _id: false })
export class PurchaseOrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  title!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  unitPurchasePrice!: number;

  /**
   * Unit purchase price plus this item's allocated share of the order's
   * extra costs (shipping, customs, other). Computed on save.
   */
  @Prop({ required: true, min: 0, default: 0 })
  landedCostPerUnit!: number;
}

export const PurchaseOrderItemSchema =
  SchemaFactory.createForClass(PurchaseOrderItem);

@Schema({ _id: false })
export class ExtraCosts {
  @Prop({ required: true, min: 0, default: 0 })
  shippingFee!: number;

  @Prop({ required: true, min: 0, default: 0 })
  customsFee!: number;

  @Prop({ required: true, min: 0, default: 0 })
  otherExpenses!: number;
}

export const ExtraCostsSchema = SchemaFactory.createForClass(ExtraCosts);

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  @Prop({ required: true, unique: true, index: true })
  reference!: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true, index: true })
  supplierId!: Types.ObjectId;

  @Prop({ default: () => new Date() })
  orderDate!: Date;

  @Prop({
    type: String,
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
    index: true,
  })
  status!: PurchaseOrderStatus;

  @Prop({ type: [PurchaseOrderItemSchema], required: true })
  items!: PurchaseOrderItem[];

  @Prop({ type: ExtraCostsSchema, default: () => ({}) })
  extraCosts!: ExtraCosts;

  /** Items subtotal + all extra costs. Computed on save. */
  @Prop({ required: true, min: 0, default: 0 })
  totalAmount!: number;

  /** Set when status transitions to RECEIVED so stock is only applied once. */
  @Prop({ type: Date, default: null })
  receivedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  notes!: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
