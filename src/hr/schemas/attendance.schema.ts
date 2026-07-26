import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AttendanceDayDocument = HydratedDocument<AttendanceDay>;

@Schema({ timestamps: true, collection: 'attendance_days' })
export class AttendanceDay {
  @Prop({ type: Types.ObjectId, ref: 'Employee', required: true, index: true })
  employeeId!: Types.ObjectId;

  /** Calendar day (UTC midnight of that date). */
  @Prop({ type: Date, required: true, index: true })
  date!: Date;

  @Prop({ required: true, min: 0 })
  hours!: number;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const AttendanceDaySchema = SchemaFactory.createForClass(AttendanceDay);

AttendanceDaySchema.index({ employeeId: 1, date: 1 }, { unique: true });

AttendanceDaySchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
