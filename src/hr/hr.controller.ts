import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { VacationStatus } from '../common/enums/hr.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UnscopedAdminOnly } from '../auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateEmployeeDto,
  CreatePayrollAdjustmentDto,
  CreateVacationDto,
  ListAdjustmentsQueryDto,
  ListEmployeesQueryDto,
  ListVacationsQueryDto,
  MonthQueryDto,
  PaySalaryDto,
  ReviewVacationDto,
  UpdateEmployeeDto,
  UpsertAttendanceDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('Admin — HR')
@ApiBearerAuth('JWT')
@Controller('admin/hr')
@UseGuards(JwtAuthGuard, RolesGuard)
@UnscopedAdminOnly()
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get('employees')
  @ApiOperation({ summary: 'List employees with month payroll snapshot' })
  listEmployees(@Query() query: ListEmployeesQueryDto) {
    return this.hrService.listEmployees(
      query.page,
      query.limit,
      query.q,
      query.status,
      query.month,
    );
  }

  @Post('employees')
  @ApiOperation({ summary: 'Create employee' })
  createEmployee(@Body() dto: CreateEmployeeDto) {
    return this.hrService.createEmployee(dto);
  }

  @Get('employees/:id')
  @ApiOperation({ summary: 'Get employee detail + month snapshot' })
  getEmployee(@Param('id') id: string, @Query() monthQuery: MonthQueryDto) {
    return this.hrService.getEmployee(id, monthQuery.month);
  }

  @Patch('employees/:id')
  @ApiOperation({ summary: 'Update employee' })
  updateEmployee(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.hrService.updateEmployee(id, dto);
  }

  @Delete('employees/:id')
  @ApiOperation({ summary: 'Terminate employee (soft)' })
  terminate(@Param('id') id: string) {
    return this.hrService.terminateEmployee(id);
  }

  @Get('employees/:id/attendance')
  @ApiOperation({ summary: 'List attendance for a month' })
  listAttendance(
    @Param('id') id: string,
    @Query() monthQuery: MonthQueryDto,
  ) {
    return this.hrService.listAttendance(id, monthQuery.month);
  }

  @Post('employees/:id/attendance')
  @ApiOperation({ summary: 'Upsert attendance day' })
  upsertAttendance(
    @Param('id') id: string,
    @Body() dto: UpsertAttendanceDto,
  ) {
    return this.hrService.upsertAttendance(id, dto);
  }

  @Delete('employees/:id/attendance/:date')
  @ApiOperation({ summary: 'Delete attendance day (YYYY-MM-DD)' })
  removeAttendance(@Param('id') id: string, @Param('date') date: string) {
    return this.hrService.removeAttendance(id, date);
  }

  @Get('vacations/pending-count')
  @ApiOperation({ summary: 'Count of PENDING vacation requests (nav badge)' })
  vacationPendingCount() {
    return this.hrService.vacationPendingCount();
  }

  @Get('vacations')
  @ApiOperation({ summary: 'List vacation requests' })
  listVacations(@Query() query: ListVacationsQueryDto) {
    if (
      query.status &&
      !Object.values(VacationStatus).includes(query.status as VacationStatus)
    ) {
      throw new BadRequestException('Invalid status filter');
    }
    return this.hrService.listVacations(
      query.page,
      query.limit,
      query.employeeId,
      query.status as VacationStatus | undefined,
    );
  }

  @Post('vacations')
  @ApiOperation({ summary: 'Create vacation request' })
  createVacation(@Body() dto: CreateVacationDto) {
    return this.hrService.createVacation(dto);
  }

  @Patch('vacations/:id/review')
  @ApiOperation({ summary: 'Approve or reject vacation' })
  reviewVacation(
    @Param('id') id: string,
    @Body() dto: ReviewVacationDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.hrService.reviewVacation(id, dto, admin.userId);
  }

  @Get('payroll')
  @ApiOperation({ summary: 'Payroll snapshot for all active employees' })
  payroll(@Query() monthQuery: MonthQueryDto) {
    return this.hrService.payrollSnapshot(monthQuery.month);
  }

  @Post('employees/:id/pay')
  @ApiOperation({ summary: 'Mark salary paid for a month (creates expense)' })
  pay(
    @Param('id') id: string,
    @Body() dto: PaySalaryDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.hrService.paySalary(id, dto, admin.userId);
  }

  @Delete('employees/:id/pay/:month')
  @ApiOperation({ summary: 'Undo salary payment and remove payroll expense' })
  unpay(@Param('id') id: string, @Param('month') month: string) {
    return this.hrService.unpaySalary(id, month);
  }

  @Get('adjustments')
  @ApiOperation({ summary: 'List bonuses and deductions' })
  listAdjustments(@Query() query: ListAdjustmentsQueryDto) {
    return this.hrService.listAdjustments(
      query.page,
      query.limit,
      query.employeeId,
      query.month,
      query.type,
    );
  }

  @Post('adjustments')
  @ApiOperation({ summary: 'Add bonus or deduction for an employee/month' })
  createAdjustment(
    @Body() dto: CreatePayrollAdjustmentDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.hrService.createAdjustment(dto, admin.userId);
  }

  @Delete('adjustments/:id')
  @ApiOperation({ summary: 'Delete a bonus or deduction' })
  removeAdjustment(@Param('id') id: string) {
    return this.hrService.removeAdjustment(id);
  }
}
