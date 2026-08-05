import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DeliveryShiftDocument = HydratedDocument<DeliveryShift>;

@Schema({ timestamps: true, collection: 'delivery_shifts' })
export class DeliveryShift {
  @Prop({ type: Types.ObjectId, ref: 'DeliveryGuy', required: true, index: true })
  deliveryGuyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ type: Date, required: true, index: true })
  clockInAt!: Date;

  @Prop({ type: Number, required: true })
  clockInLat!: number;

  @Prop({ type: Number, required: true })
  clockInLng!: number;

  @Prop({ type: Date })
  clockOutAt?: Date;

  @Prop({ type: Number })
  clockOutLat?: number;

  @Prop({ type: Number })
  clockOutLng?: number;

  /** Decimal hours worked (set on clock-out). */
  @Prop({ type: Number, min: 0, default: 0 })
  hoursWorked!: number;

  /** Snapshot of hourly rate at clock-out (EGP). */
  @Prop({ type: Number, min: 0, default: 0 })
  hourlyRate!: number;

  /** hoursWorked × hourlyRate (EGP), set on clock-out. */
  @Prop({ type: Number, min: 0, default: 0 })
  earnedAmount!: number;
}

export const DeliveryShiftSchema = SchemaFactory.createForClass(DeliveryShift);

DeliveryShiftSchema.index(
  { deliveryGuyId: 1, clockOutAt: 1 },
  { partialFilterExpression: { clockOutAt: null } },
);

DeliveryShiftSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
