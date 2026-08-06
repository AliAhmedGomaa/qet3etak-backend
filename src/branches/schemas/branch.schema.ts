import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BranchStatus } from '../../common/enums/branch.enums';

export type BranchDocument = HydratedDocument<Branch>;

@Schema({ timestamps: true, collection: 'branches' })
export class Branch {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  address!: string;

  @Prop({ trim: true, default: '' })
  phone!: string;

  @Prop({ trim: true, default: '' })
  notes!: string;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  managerUserId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: BranchStatus,
    default: BranchStatus.ACTIVE,
    index: true,
  })
  status!: BranchStatus;

  /** Workplace geofence center latitude (WGS84). Optional legacy / centroid. */
  @Prop({ type: Number, min: -90, max: 90 })
  geofenceLat?: number;

  /** Workplace geofence center longitude (WGS84). Optional legacy / centroid. */
  @Prop({ type: Number, min: -180, max: 180 })
  geofenceLng?: number;

  /** Allowed radius around the workplace in meters (legacy circle geofence). */
  @Prop({ type: Number, min: 10, max: 50000 })
  geofenceRadiusMeters?: number;

  /**
   * Drawn workplace boundary as a polygon of WGS84 points (min 3).
   * Preferred over the legacy circle when present.
   */
  @Prop({
    type: [
      {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        _id: false,
      },
    ],
    default: undefined,
  })
  geofencePolygon?: Array<{ lat: number; lng: number }>;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);

BranchSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
