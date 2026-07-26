import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ExpenseCategory } from '../../common/enums/financial.enums';
import { ExpenseSource } from '../../common/enums/hr.enums';

export type ExpenseDocument = HydratedDocument<Expense>;

@Schema({ timestamps: true, collection: 'expenses' })
export class Expense {
  @Prop({
    type: String,
    enum: ExpenseCategory,
    required: true,
    index: true,
  })
  category!: ExpenseCategory;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ default: () => new Date(), index: true })
  date!: Date;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({
    type: String,
    enum: ExpenseSource,
    default: ExpenseSource.MANUAL,
    index: true,
  })
  source!: ExpenseSource;

  @Prop({ type: Types.ObjectId, ref: 'Employee', index: true })
  employeeId?: Types.ObjectId;

  /** Format YYYY-MM when source is PAYROLL. */
  @Prop({ trim: true, index: true })
  payrollMonth?: string;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);

ExpenseSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
