import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ _id: false })
export class TieredPrice {
  @Prop({ required: true, min: 1 })
  minQty!: number;

  @Prop({ required: true, min: 0 })
  price!: number;
}

export const TieredPriceSchema = SchemaFactory.createForClass(TieredPrice);

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true, index: true })
  brand!: string;

  @Prop({ required: true, trim: true, index: true })
  model!: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  /** Specific part name (e.g. LCD Assembly, Battery Pack) — independent of category */
  @Prop({ required: true, trim: true, index: true, default: '' })
  part!: string;

  /** Optional FK to admin-managed Quality; denormalized name kept in qualityGrade. */
  @Prop({ type: Types.ObjectId, ref: 'Quality', index: true })
  qualityId?: Types.ObjectId;

  /** Denormalized quality name (synced from Quality.name when qualityId is set). */
  @Prop({
    type: String,
    required: true,
    trim: true,
    index: true,
  })
  qualityGrade!: string;

  @Prop({ required: true, min: 0, default: 0 })
  stockQuantity!: number;

  @Prop({ required: true, min: 0 })
  basePrice!: number;

  /**
   * Weighted-average landed cost per unit, recalculated whenever a
   * PurchaseOrder is received. Used for COGS / profit reporting.
   */
  @Prop({ required: true, min: 0, default: 0 })
  costPrice!: number;

  @Prop({ type: [TieredPriceSchema], default: [] })
  tieredPricing!: TieredPrice[];

  @Prop({ trim: true, default: '' })
  imageUrl!: string;

  @Prop({ trim: true, default: '' })
  sku!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({
  title: 'text',
  brand: 'text',
  model: 'text',
  category: 'text',
  part: 'text',
  sku: 'text',
});

ProductSchema.index({ brand: 1, model: 1, category: 1, part: 1, qualityGrade: 1 });

ProductSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
