import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SalaryPaymentDocument = HydratedDocument<SalaryPayment>;

@Schema({ timestamps: true, collection: 'salary_payments' })
export class SalaryPayment {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId!: Types.ObjectId;

  /** Format YYYY-MM. */
  @Prop({ required: true, index: true })
  month!: string;

  @Prop({ required: true, min: 0, default: 0 })
  hoursWorked!: number;

  @Prop({ required: true, min: 0, default: 0 })
  hourlyRate!: number;

  /** hoursWorked × hourlyRate before adjustments. */
  @Prop({ required: true, min: 0, default: 0 })
  baseAmount!: number;

  @Prop({ required: true, min: 0, default: 0 })
  bonus!: number;

  @Prop({ required: true, min: 0, default: 0 })
  deduction!: number;

  /** baseAmount + bonus − deduction. */
  @Prop({ required: true, min: 0, default: 0 })
  amount!: number;

  @Prop({ required: true, default: true })
  paid!: boolean;

  @Prop({ type: Date, default: () => new Date() })
  paidAt!: Date;

  @Prop({ type: Types.ObjectId, ref: 'Expense' })
  expenseId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  paidBy?: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const SalaryPaymentSchema = SchemaFactory.createForClass(SalaryPayment);

SalaryPaymentSchema.index({ employeeId: 1, month: 1 }, { unique: true });

SalaryPaymentSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
