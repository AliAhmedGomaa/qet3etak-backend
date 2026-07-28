import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole, UserStatus } from '../../common/enums/user.enums';

export type UserDocument = HydratedDocument<User>;

/** White-label identity for this shop's customer (C2B) app experience. */
@Schema({ _id: false })
export class ShopCustomerAppBranding {
  /** When false, customer portal falls back to platform branding. */
  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ trim: true, default: '' })
  displayName!: string;

  @Prop({ trim: true, default: '' })
  tagline!: string;

  /** Unique public slug for share links (?shop=slug). Sparse unique. */
  @Prop({ trim: true, lowercase: true, default: '' })
  slug!: string;

  @Prop({ default: '#10b880' })
  accentColor!: string;

  @Prop({ default: '#0d9a6a' })
  accentStrongColor!: string;

  @Prop({ default: '#0f172a' })
  brandColor!: string;

  @Prop({ trim: true, default: '' })
  logoUrl!: string;

  @Prop({ trim: true, default: '' })
  faviconUrl!: string;
}

export const ShopCustomerAppBrandingSchema = SchemaFactory.createForClass(
  ShopCustomerAppBranding,
);

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, trim: true })
  shopName!: string;

  @Prop({ required: true, unique: true, trim: true })
  phone!: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  address!: string;

  @Prop({ required: true })
  commercialRegPhotoUrl!: string;

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.PENDING_VERIFICATION,
  })
  status!: UserStatus;

  /**
   * Denormalized role code (synced from Role.code) for JWT/guards compatibility.
   * System codes: ADMIN, MANAGER, STAFF, BRANCH_MANAGER, SHOP_OWNER.
   * Custom roles use their own code (e.g. OPS) and are treated like STAFF when adminPanel.
   */
  @Prop({ type: String, default: UserRole.SHOP_OWNER, index: true })
  role!: UserRole | string;

  /** Reference to the Role document. */
  @Prop({ type: Types.ObjectId, ref: 'Role', index: true })
  roleId?: Types.ObjectId;

  /**
   * Optional branch assignment.
   * - SHOP_OWNER: which branch the shop belongs to (null = HQ / unassigned)
   * - BRANCH_MANAGER: the branch they manage
   */
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  /** Optional note when an admin rejects the shop */
  @Prop({ trim: true })
  rejectionReason?: string;

  /**
   * Shop-specific catalog discount percent (0–100).
   * Applied after volume tier pricing for this shop only.
   */
  @Prop({ type: Number, default: 0, min: 0, max: 100 })
  shopDiscountPercent!: number;

  /** Hashed password for JWT login */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  /** Customer-app (C2B) white-label identity — shop owner only. */
  @Prop({ type: ShopCustomerAppBrandingSchema, default: () => ({}) })
  customerApp!: ShopCustomerAppBranding;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index(
  { 'customerApp.slug': 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: {
      'customerApp.slug': { $type: 'string', $gt: '' },
    },
  },
);

UserSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    if (ret.roleId) ret.roleId = String(ret.roleId);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});
