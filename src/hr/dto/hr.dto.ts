import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import {
  EmployeeStatus,
  PayrollAdjustmentType,
  VacationStatus,
  VacationType,
} from '../../common/enums/hr.enums';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'أحمد محمود' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({ example: '01001234567' })
  @IsString()
  @MinLength(8)
  phone!: string;

  @ApiPropertyOptional({ example: 'أمين مخزن' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiProperty({ example: 50, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate!: number;

  @ApiPropertyOptional({ example: 8, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  standardDailyHours?: number;

  @ApiPropertyOptional({ example: 21, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  annualLeaveDays?: number;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ example: 'Emp123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class UpsertAttendanceDto {
  @ApiProperty({ example: '2026-07-15' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: 8, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hours!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateVacationDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: VacationType })
  @IsOptional()
  @IsEnum(VacationType)
  type?: VacationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewVacationDto {
  @ApiProperty({ enum: [VacationStatus.APPROVED, VacationStatus.REJECTED] })
  @IsEnum(VacationStatus)
  status!: VacationStatus.APPROVED | VacationStatus.REJECTED;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class PaySalaryDto {
  @ApiProperty({ example: '2026-07', description: 'YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;

  @ApiPropertyOptional({ example: 200, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bonus?: number;

  @ApiPropertyOptional({ example: 50, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deduction?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class MonthQueryDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

/** Paginated employees list (+ optional status / payroll month). */
export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'أحمد' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ example: '2026-07', description: 'YYYY-MM' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

export class ListVacationsQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  /** PENDING | APPROVED | REJECTED — validated in the controller/service. */
  @ApiPropertyOptional({
    example: 'PENDING',
    enum: VacationStatus,
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ListAdjustmentsQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: '2026-07' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;

  @ApiPropertyOptional({ enum: PayrollAdjustmentType })
  @IsOptional()
  @IsEnum(PayrollAdjustmentType)
  type?: PayrollAdjustmentType;
}

export class CreatePayrollAdjustmentDto {
  @ApiProperty({ example: '6a5ed4b2f718e30c208e48d0' })
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: '2026-07' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month!: string;

  @ApiProperty({ enum: PayrollAdjustmentType })
  @IsEnum(PayrollAdjustmentType)
  type!: PayrollAdjustmentType;

  @ApiProperty({ example: 200, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class EmployeeVacationRequestDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  to!: string;

  @ApiPropertyOptional({ enum: VacationType })
  @IsOptional()
  @IsEnum(VacationType)
  type?: VacationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class DateRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: '2026-07' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}
