import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  DeliveryFeeModel,
  DeliveryGuyStatus,
} from '../../common/enums/delivery.enums';

export type DeliveryGuyDocument = HydratedDocument<DeliveryGuy>;

@Schema({ timestamps: true, collection: 'delivery_guys' })
export class DeliveryGuy {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, trim: true, unique: true, index: true })
  phone!: string;

  @Prop({ trim: true, default: '' })
  city!: string;

  @Prop({ trim: true, default: '' })
  vehicleType!: string;

  @Prop({ trim: true, default: '' })
  notes!: string;

  @Prop({
    type: String,
    enum: DeliveryGuyStatus,
    default: DeliveryGuyStatus.ACTIVE,
    index: true,
  })
  status!: DeliveryGuyStatus;

  @Prop({
    type: String,
    enum: DeliveryFeeModel,
    default: DeliveryFeeModel.FLAT,
  })
  feeModel!: DeliveryFeeModel;

  /** Used when feeModel = FLAT (EGP per delivery). */
  @Prop({ required: true, min: 0, default: 30 })
  flatFee!: number;

  /** Used when feeModel = PERCENT (e.g. 2.5 = 2.5% of order total). */
  @Prop({ required: true, min: 0, default: 0 })
  percentRate!: number;

  /** Used when feeModel = BASE_PLUS_ITEMS. */
  @Prop({ required: true, min: 0, default: 20 })
  baseFee!: number;

  /** Used when feeModel = BASE_PLUS_ITEMS. */
  @Prop({ required: true, min: 0, default: 2 })
  perItemFee!: number;

  /** Running totals (updated when orders are assigned / delivered). */
  @Prop({ required: true, min: 0, default: 0 })
  totalDeliveries!: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalFeesEarned!: number;
}

export const DeliveryGuySchema = SchemaFactory.createForClass(DeliveryGuy);

DeliveryGuySchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
