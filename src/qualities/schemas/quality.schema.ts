import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type QualityDocument = HydratedDocument<Quality>;

@Schema({ timestamps: true, collection: 'qualities' })
export class Quality {
  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  /** Unique slug (e.g. original, high-copy). Auto-derived from name when omitted. */
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  code!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  sortOrder!: number;
}

export const QualitySchema = SchemaFactory.createForClass(Quality);

QualitySchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
