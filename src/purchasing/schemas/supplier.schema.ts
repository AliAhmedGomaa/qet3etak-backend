import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupplierDocument = HydratedDocument<Supplier>;

@Schema({ timestamps: true, collection: 'suppliers' })
export class Supplier {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  phone!: string;

  @Prop({ trim: true, default: '' })
  country!: string;

  /** ISO currency the supplier invoices in (e.g. USD, CNY, EGP). */
  @Prop({ trim: true, default: 'EGP', uppercase: true })
  currency!: string;

  /**
   * Outstanding balance owed to this supplier. Increases when a purchase
   * order is received, decreases when payments are recorded.
   */
  @Prop({ required: true, default: 0 })
  currentBalance!: number;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
