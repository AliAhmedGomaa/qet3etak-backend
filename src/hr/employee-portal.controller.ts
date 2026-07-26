import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { EmployeeOnly } from '../auth/decorators/employee-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DateRangeQueryDto,
  EmployeeVacationRequestDto,
  MonthQueryDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

@ApiTags('Employee portal')
@ApiBearerAuth('JWT')
@Controller('employee')
@UseGuards(JwtAuthGuard, RolesGuard)
@EmployeeOnly()
export class EmployeePortalController {
  constructor(private readonly hrService: HrService) {}

  @Get('me')
  @ApiOperation({ summary: 'My profile + current/selected month payroll snapshot' })
  me(@CurrentUser() user: AuthUser, @Query() query: MonthQueryDto) {
    return this.hrService.employeeSelfDashboard(user.userId, query.month);
  }

  @Get('attendance')
  @ApiOperation({
    summary: 'My attendance by month or custom date range',
  })
  attendance(
    @CurrentUser() user: AuthUser,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.hrService.employeeSelfAttendance(
      user.userId,
      query.month,
      query.from,
      query.to,
    );
  }

  @Get('vacations')
  @ApiOperation({ summary: 'My vacation requests' })
  vacations(@CurrentUser() user: AuthUser) {
    return this.hrService.employeeSelfVacations(user.userId);
  }

  @Post('vacations')
  @ApiOperation({ summary: 'Request a vacation (appears in admin HR inbox)' })
  requestVacation(
    @CurrentUser() user: AuthUser,
    @Body() dto: EmployeeVacationRequestDto,
  ) {
    return this.hrService.employeeRequestVacation(user.userId, dto);
  }

  @Get('adjustments')
  @ApiOperation({ summary: 'My bonuses and deductions' })
  adjustments(
    @CurrentUser() user: AuthUser,
    @Query() query: MonthQueryDto,
  ) {
    return this.hrService.employeeSelfAdjustments(user.userId, query.month);
  }

  @Get('salary')
  @ApiOperation({ summary: 'Salary snapshot for a month (alias of me)' })
  salary(@CurrentUser() user: AuthUser, @Query() query: MonthQueryDto) {
    return this.hrService.employeeSelfDashboard(user.userId, query.month);
  }
}
