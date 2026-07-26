import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PayrollAdjustmentType } from '../../common/enums/hr.enums';

export type PayrollAdjustmentDocument = HydratedDocument<PayrollAdjustment>;

@Schema({ timestamps: true, collection: 'payroll_adjustments' })
export class PayrollAdjustment {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId!: Types.ObjectId;

  /** Format YYYY-MM. */
  @Prop({ required: true, index: true })
  month!: string;

  @Prop({
    type: String,
    enum: PayrollAdjustmentType,
    required: true,
    index: true,
  })
  type!: PayrollAdjustmentType;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const PayrollAdjustmentSchema =
  SchemaFactory.createForClass(PayrollAdjustment);

PayrollAdjustmentSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
