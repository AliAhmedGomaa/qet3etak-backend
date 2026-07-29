import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ShopProductDocument = HydratedDocument<ShopProduct>;

/** Retail products a shop owner shows in their customer (C2B) app. */
@Schema({ timestamps: true, collection: 'shop_products' })
export class ShopProduct {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ required: true, min: 0, default: 0 })
  price!: number;

  @Prop({ trim: true, default: '' })
  imageUrl!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ type: Number, default: 0 })
  sortOrder!: number;
}

export const ShopProductSchema = SchemaFactory.createForClass(ShopProduct);

ShopProductSchema.index({ shopId: 1, isActive: 1, sortOrder: 1 });

ShopProductSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    if (ret.shopId) ret.shopId = String(ret.shopId);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
