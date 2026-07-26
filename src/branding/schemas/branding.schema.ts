import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BrandingDocument = HydratedDocument<Branding>;

/** Singleton platform branding applied across all apps. */
@Schema({ timestamps: true, collection: 'branding' })
export class Branding {
  /** Stable key so we always upsert the same document. */
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ required: true, trim: true, default: 'قطع غيار' })
  appName!: string;

  @Prop({ trim: true, default: 'منصة الجملة لقطع غيار الموبايل' })
  tagline!: string;

  /** Primary accent (buttons, links) — CSS --accent */
  @Prop({ required: true, default: '#10b880' })
  accentColor!: string;

  /** Stronger accent hover — CSS --accent-strong */
  @Prop({ required: true, default: '#0d9a6a' })
  accentStrongColor!: string;

  /** Brand / ink dark — CSS --brand */
  @Prop({ required: true, default: '#0f172a' })
  brandColor!: string;

  /** Logo image URL (relative /uploads/... or absolute). */
  @Prop({ trim: true, default: '' })
  logoUrl!: string;

  /** Optional favicon override; falls back to logoUrl. */
  @Prop({ trim: true, default: '' })
  faviconUrl!: string;
}

export const BrandingSchema = SchemaFactory.createForClass(Branding);

BrandingSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
