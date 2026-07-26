import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FinancialsModule } from '../financials/financials.module';
import { PushModule } from '../push/push.module';
import { EmployeePortalController } from './employee-portal.controller';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import {
  AttendanceDay,
  AttendanceDaySchema,
} from './schemas/attendance.schema';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
import {
  PayrollAdjustment,
  PayrollAdjustmentSchema,
} from './schemas/payroll-adjustment.schema';
import {
  SalaryPayment,
  SalaryPaymentSchema,
} from './schemas/salary-payment.schema';
import {
  VacationRequest,
  VacationRequestSchema,
} from './schemas/vacation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: AttendanceDay.name, schema: AttendanceDaySchema },
      { name: VacationRequest.name, schema: VacationRequestSchema },
      { name: SalaryPayment.name, schema: SalaryPaymentSchema },
      { name: PayrollAdjustment.name, schema: PayrollAdjustmentSchema },
    ]),
    FinancialsModule,
    PushModule,
  ],
  controllers: [HrController, EmployeePortalController],
  providers: [HrService],
  exports: [HrService, MongooseModule],
})
export class HrModule {}
