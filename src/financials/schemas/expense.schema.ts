import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ExpenseCategory } from '../../common/enums/financial.enums';

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
