import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  /** Display name (Arabic-friendly). */
  @Prop({ required: true, trim: true })
  name!: string;

  /** Stable unique slug, e.g. ADMIN, MANAGER, OPS. */
  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  code!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  /** Optional permission flags for future fine-grained gating. */
  @Prop({ type: [String], default: [] })
  permissions!: string[];

  /**
   * Whether holders may log into the admin dashboard.
   * System panel roles default true; SHOP_OWNER is false.
   */
  @Prop({ default: false, index: true })
  adminPanel!: boolean;

  /** System roles cannot be deleted (and code cannot change). */
  @Prop({ default: false, index: true })
  isSystem!: boolean;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
