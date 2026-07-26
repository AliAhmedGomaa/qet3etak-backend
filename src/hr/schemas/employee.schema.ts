import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { EmployeeStatus } from '../../common/enums/hr.enums';

export type EmployeeDocument = HydratedDocument<Employee>;

@Schema({ timestamps: true, collection: 'employees' })
export class Employee {
  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, trim: true, unique: true, index: true })
  phone!: string;

  /** Login password for the employee portal (select: false by default). */
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ trim: true, default: '' })
  jobTitle!: string;

  /** EGP per hour. */
  @Prop({ required: true, min: 0, default: 0 })
  hourlyRate!: number;

  /** Default hours when logging a work day. */
  @Prop({ required: true, min: 0, default: 8 })
  standardDailyHours!: number;

  /** Annual leave entitlement (days per year). */
  @Prop({ required: true, min: 0, default: 21 })
  annualLeaveDays!: number;

  @Prop({
    type: String,
    enum: EmployeeStatus,
    default: EmployeeStatus.ACTIVE,
    index: true,
  })
  status!: EmployeeStatus;

  @Prop({ type: Date, default: () => new Date() })
  hireDate!: Date;

  @Prop({ trim: true, default: '' })
  notes!: string;
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);

EmployeeSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});
