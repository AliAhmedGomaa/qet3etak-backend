import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole, UserStatus } from '../../common/enums/user.enums';

export type UserDocument = HydratedDocument<User>;

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
}

export const UserSchema = SchemaFactory.createForClass(User);

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
