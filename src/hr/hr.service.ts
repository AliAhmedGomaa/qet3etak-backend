import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import {
  EmployeeStatus,
  PayrollAdjustmentType,
  VacationStatus,
  VacationType,
} from '../common/enums/hr.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { FinancialsService } from '../financials/financials.service';
import { PushService } from '../push/push.service';
import {
  CreateEmployeeDto,
  CreatePayrollAdjustmentDto,
  CreateVacationDto,
  EmployeeVacationRequestDto,
  PaySalaryDto,
  ReviewVacationDto,
  UpdateEmployeeDto,
  UpsertAttendanceDto,
} from './dto/hr.dto';
import {
  AttendanceDay,
  AttendanceDayDocument,
} from './schemas/attendance.schema';
import { Employee, EmployeeDocument } from './schemas/employee.schema';
import {
  PayrollAdjustment,
  PayrollAdjustmentDocument,
} from './schemas/payroll-adjustment.schema';
import {
  SalaryPayment,
  SalaryPaymentDocument,
} from './schemas/salary-payment.schema';
import {
  VacationRequest,
  VacationRequestDocument,
} from './schemas/vacation.schema';

function toView(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseMonth(month?: string): { month: string; start: Date; end: Date } {
  const now = new Date();
  const m =
    month?.trim() ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!/^\d{4}-\d{2}$/.test(m)) {
    throw new BadRequestException('month must be YYYY-MM');
  }
  const [y, mo] = m.split('-').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1));
  const end = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
  return { month: m, start, end };
}

function dayUtc(isoDate: string): Date {
  const d = isoDate.slice(0, 10);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function inclusiveDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000) + 1;
}

@Injectable()
export class HrService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
    @InjectModel(AttendanceDay.name)
    private readonly attendanceModel: Model<AttendanceDay>,
    @InjectModel(VacationRequest.name)
    private readonly vacationModel: Model<VacationRequest>,
    @InjectModel(SalaryPayment.name)
    private readonly paymentModel: Model<SalaryPayment>,
    @InjectModel(PayrollAdjustment.name)
    private readonly adjustmentModel: Model<PayrollAdjustment>,
    private readonly financialsService: FinancialsService,
    private readonly pushService: PushService,
  ) {}

  async createEmployee(dto: CreateEmployeeDto): Promise<EmployeeDocument> {
    const phone = dto.phone.trim();
    const exists = await this.employeeModel.exists({ phone }).exec();
    if (exists) {
      throw new ConflictException('An employee with this phone already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    return this.employeeModel.create({
      fullName: dto.fullName.trim(),
      phone,
      passwordHash,
      jobTitle: dto.jobTitle?.trim() || '',
      hourlyRate: dto.hourlyRate,
      standardDailyHours: dto.standardDailyHours ?? 8,
      annualLeaveDays: dto.annualLeaveDays ?? 21,
      status: dto.status ?? EmployeeStatus.ACTIVE,
      hireDate: dto.hireDate ? dayUtc(dto.hireDate) : new Date(),
      notes: dto.notes?.trim() || '',
    });
  }

  async findEmployeeByPhoneWithPassword(
    phone: string,
  ): Promise<EmployeeDocument | null> {
    return this.employeeModel
      .findOne({ phone: phone.trim() })
      .select('+passwordHash')
      .exec();
  }

  async findEmployeeById(id: string): Promise<EmployeeDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.employeeModel.findById(id).exec();
  }

  async listEmployees(
    page?: number,
    limit?: number,
    q?: string,
    status?: EmployeeStatus,
    month?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const { month: m } = parseMonth(month);
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    if (q?.trim()) {
      const rx = new RegExp(escapeRegex(q.trim()), 'i');
      filter['$or'] = [{ fullName: rx }, { phone: rx }, { jobTitle: rx }];
    }
    const [items, total] = await Promise.all([
      this.employeeModel
        .find(filter)
        .sort({ fullName: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.employeeModel.countDocuments(filter).exec(),
    ]);
    const views = await Promise.all(
      items.map((emp) => this.employeeMonthSnapshot(emp, m)),
    );
    return paginatedResult(views, total, p.page, p.limit);
  }

  async getEmployee(
    id: string,
    month?: string,
  ): Promise<Record<string, unknown>> {
    const emp = await this.findEmployeeOrFail(id);
    const { month: m } = parseMonth(month);
    return this.employeeMonthSnapshot(emp, m);
  }

  async updateEmployee(
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<EmployeeDocument> {
    const emp = await this.findEmployeeOrFail(id);
    if (dto.phone && dto.phone.trim() !== emp.phone) {
      const exists = await this.employeeModel
        .exists({ phone: dto.phone.trim(), _id: { $ne: emp._id } })
        .exec();
      if (exists) {
        throw new ConflictException(
          'An employee with this phone already exists',
        );
      }
      emp.phone = dto.phone.trim();
    }
    if (dto.fullName !== undefined) emp.fullName = dto.fullName.trim();
    if (dto.jobTitle !== undefined) emp.jobTitle = dto.jobTitle.trim();
    if (dto.hourlyRate !== undefined) emp.hourlyRate = dto.hourlyRate;
    if (dto.standardDailyHours !== undefined) {
      emp.standardDailyHours = dto.standardDailyHours;
    }
    if (dto.annualLeaveDays !== undefined) {
      emp.annualLeaveDays = dto.annualLeaveDays;
    }
    if (dto.status !== undefined) emp.status = dto.status;
    if (dto.hireDate !== undefined) emp.hireDate = dayUtc(dto.hireDate);
    if (dto.notes !== undefined) emp.notes = dto.notes.trim();
    if (dto.password?.trim()) {
      emp.passwordHash = await bcrypt.hash(dto.password.trim(), 10);
    }
    await emp.save();
    return emp;
  }

  async terminateEmployee(id: string): Promise<EmployeeDocument> {
    const emp = await this.findEmployeeOrFail(id);
    emp.status = EmployeeStatus.TERMINATED;
    await emp.save();
    return emp;
  }

  async listAttendance(
    employeeId: string,
    month?: string,
  ): Promise<{
    month: string;
    hoursWorked: number;
    items: Record<string, unknown>[];
  }> {
    await this.findEmployeeOrFail(employeeId);
    const { month: m, start, end } = parseMonth(month);
    const items = await this.attendanceModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        date: { $gte: start, $lte: end },
      })
      .sort({ date: 1 })
      .exec();
    const hoursWorked = round(
      items.reduce((sum, d) => sum + (d.hours || 0), 0),
    );
    return {
      month: m,
      hoursWorked,
      items: items.map((d) => toView(d)),
    };
  }

  async upsertAttendance(
    employeeId: string,
    dto: UpsertAttendanceDto,
  ): Promise<AttendanceDayDocument> {
    await this.findEmployeeOrFail(employeeId);
    const date = dayUtc(dto.date);
    const doc = await this.attendanceModel
      .findOneAndUpdate(
        { employeeId: new Types.ObjectId(employeeId), date },
        {
          $set: {
            hours: dto.hours,
            note: dto.note?.trim() || '',
          },
          $setOnInsert: {
            employeeId: new Types.ObjectId(employeeId),
            date,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    if (!doc) throw new BadRequestException('Failed to save attendance');
    return doc;
  }

  async removeAttendance(
    employeeId: string,
    dateIso: string,
  ): Promise<{ ok: boolean }> {
    const date = dayUtc(dateIso);
    const res = await this.attendanceModel
      .deleteOne({
        employeeId: new Types.ObjectId(employeeId),
        date,
      })
      .exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Attendance day not found');
    }
    return { ok: true };
  }

  async vacationPendingCount(): Promise<{ count: number }> {
    const count = await this.vacationModel
      .countDocuments({ status: VacationStatus.PENDING })
      .exec();
    return { count };
  }

  async listVacations(
    page?: number,
    limit?: number,
    employeeId?: string,
    status?: VacationStatus,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) {
        throw new BadRequestException('Invalid employeeId');
      }
      filter['employeeId'] = new Types.ObjectId(employeeId);
    }
    if (status) filter['status'] = status;
    const [items, total] = await Promise.all([
      this.vacationModel
        .find(filter)
        .populate('employeeId', 'fullName phone jobTitle')
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.vacationModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((v) => this.vacationView(v)),
      total,
      p.page,
      p.limit,
    );
  }

  async createVacation(dto: CreateVacationDto): Promise<Record<string, unknown>> {
    const emp = await this.findEmployeeOrFail(dto.employeeId);
    const from = dayUtc(dto.from);
    const to = dayUtc(dto.to);
    const days = inclusiveDays(from, to);
    if (days < 1) {
      throw new BadRequestException('"to" must be on or after "from"');
    }
    const doc = await this.vacationModel.create({
      employeeId: new Types.ObjectId(dto.employeeId),
      from,
      to,
      days,
      type: dto.type ?? VacationType.ANNUAL,
      status: VacationStatus.PENDING,
      reason: dto.reason?.trim() || '',
    });
    void this.pushService.notifyAdmins({
      title: 'طلب إجازة جديد',
      body: `${emp.fullName} — ${days} يوم`,
      url: '/employees/vacations',
      tag: 'vacation-pending',
    });
    return toView(doc);
  }

  async reviewVacation(
    id: string,
    dto: ReviewVacationDto,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    if (
      dto.status !== VacationStatus.APPROVED &&
      dto.status !== VacationStatus.REJECTED
    ) {
      throw new BadRequestException('status must be APPROVED or REJECTED');
    }
    const vac = await this.vacationModel.findById(id).exec();
    if (!vac) throw new NotFoundException('Vacation request not found');
    if (vac.status !== VacationStatus.PENDING) {
      throw new BadRequestException('Vacation already reviewed');
    }
    vac.status = dto.status;
    vac.reviewNote = dto.reviewNote?.trim() || '';
    vac.reviewedBy = new Types.ObjectId(adminId);
    vac.reviewedAt = new Date();
    await vac.save();
    return toView(vac);
  }

  async payrollSnapshot(month?: string): Promise<{
    month: string;
    items: Record<string, unknown>[];
  }> {
    const { month: m } = parseMonth(month);
    const employees = await this.employeeModel
      .find({ status: { $ne: EmployeeStatus.TERMINATED } })
      .sort({ fullName: 1 })
      .exec();
    const items = await Promise.all(
      employees.map((emp) => this.employeeMonthSnapshot(emp, m)),
    );
    return { month: m, items };
  }

  async paySalary(
    employeeId: string,
    dto: PaySalaryDto,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    const emp = await this.findEmployeeOrFail(employeeId);
    const { month, start, end } = parseMonth(dto.month);

    const existing = await this.paymentModel
      .findOne({ employeeId: emp._id, month, paid: true })
      .exec();
    if (existing) {
      throw new ConflictException(
        `Salary already paid for ${emp.fullName} in ${month}`,
      );
    }

    const hoursWorked = await this.sumHours(String(emp._id), start, end);
    const hourlyRate = emp.hourlyRate;
    const baseAmount = round(hoursWorked * hourlyRate);
    const adj = await this.sumAdjustments(String(emp._id), month);
    const bonus = round(dto.bonus ?? adj.bonus);
    const deduction = round(dto.deduction ?? adj.deduction);
    const amount = round(Math.max(0, baseAmount + bonus - deduction));

    const expense = await this.financialsService.createPayrollExpense({
      employeeId: String(emp._id),
      payrollMonth: month,
      amount,
      description: `راتب ${emp.fullName} — ${month}`,
    });

    const payment = await this.paymentModel.create({
      employeeId: emp._id,
      month,
      hoursWorked,
      hourlyRate,
      baseAmount,
      bonus,
      deduction,
      amount,
      paid: true,
      paidAt: new Date(),
      expenseId: new Types.ObjectId(String(expense['id'])),
      paidBy: new Types.ObjectId(adminId),
      note: dto.note?.trim() || '',
    });

    return {
      ...toView(payment),
      expense,
      employeeName: emp.fullName,
    };
  }

  async unpaySalary(
    employeeId: string,
    monthRaw: string,
  ): Promise<{ ok: boolean }> {
    const { month } = parseMonth(monthRaw);
    const payment = await this.paymentModel
      .findOne({
        employeeId: new Types.ObjectId(employeeId),
        month,
        paid: true,
      })
      .exec();
    if (!payment) {
      throw new NotFoundException('Paid salary record not found');
    }
    if (payment.expenseId) {
      await this.financialsService.removeExpenseById(String(payment.expenseId));
    }
    await payment.deleteOne();
    return { ok: true };
  }

  private async findEmployeeOrFail(id: string): Promise<EmployeeDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Employee not found');
    }
    const emp = await this.employeeModel.findById(id).exec();
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  private async sumHours(
    employeeId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const agg = await this.attendanceModel
      .aggregate([
        {
          $match: {
            employeeId: new Types.ObjectId(employeeId),
            date: { $gte: start, $lte: end },
          },
        },
        { $group: { _id: null, hours: { $sum: '$hours' } } },
      ])
      .exec();
    return round(agg[0]?.hours ?? 0);
  }

  private async approvedAnnualDaysUsed(
    employeeId: string,
    year: number,
  ): Promise<number> {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const agg = await this.vacationModel
      .aggregate([
        {
          $match: {
            employeeId: new Types.ObjectId(employeeId),
            status: VacationStatus.APPROVED,
            type: VacationType.ANNUAL,
            from: { $lte: end },
            to: { $gte: start },
          },
        },
        { $group: { _id: null, days: { $sum: '$days' } } },
      ])
      .exec();
    return agg[0]?.days ?? 0;
  }

  private async employeeMonthSnapshot(
    emp: EmployeeDocument,
    month: string,
  ): Promise<Record<string, unknown>> {
    const { start, end } = parseMonth(month);
    const year = Number(month.slice(0, 4));
    const [hoursWorked, payment, usedLeave, adj, adjustments] =
      await Promise.all([
        this.sumHours(String(emp._id), start, end),
        this.paymentModel
          .findOne({ employeeId: emp._id, month, paid: true })
          .exec(),
        this.approvedAnnualDaysUsed(String(emp._id), year),
        this.sumAdjustments(String(emp._id), month),
        this.listAdjustmentsForEmployee(String(emp._id), month),
      ]);
    const baseAmount = round(hoursWorked * emp.hourlyRate);
    const bonus = payment ? payment.bonus : adj.bonus;
    const deduction = payment ? payment.deduction : adj.deduction;
    const expectedPay = payment
      ? payment.amount
      : round(Math.max(0, baseAmount + bonus - deduction));
    const remainingLeave = Math.max(0, emp.annualLeaveDays - usedLeave);

    return {
      ...toView(emp),
      month,
      hoursWorkedThisMonth: hoursWorked,
      expectedPay,
      baseAmount,
      bonus,
      deduction,
      salaryPaidThisMonth: !!payment,
      payment: payment ? toView(payment) : null,
      adjustments,
      vacationDaysUsedThisYear: usedLeave,
      vacationDaysRemaining: remainingLeave,
    };
  }

  async listAdjustments(
    page?: number,
    limit?: number,
    employeeId?: string,
    month?: string,
    type?: PayrollAdjustmentType,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (employeeId) {
      if (!Types.ObjectId.isValid(employeeId)) {
        throw new BadRequestException('Invalid employeeId');
      }
      filter['employeeId'] = new Types.ObjectId(employeeId);
    }
    if (month) {
      parseMonth(month);
      filter['month'] = month;
    }
    if (type) filter['type'] = type;
    const [items, total] = await Promise.all([
      this.adjustmentModel
        .find(filter)
        .populate('employeeId', 'fullName phone jobTitle')
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.adjustmentModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((a) => this.adjustmentView(a)),
      total,
      p.page,
      p.limit,
    );
  }

  async createAdjustment(
    dto: CreatePayrollAdjustmentDto,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    await this.findEmployeeOrFail(dto.employeeId);
    parseMonth(dto.month);
    const doc = await this.adjustmentModel.create({
      employeeId: new Types.ObjectId(dto.employeeId),
      month: dto.month,
      type: dto.type,
      amount: round(dto.amount),
      note: dto.note?.trim() || '',
      createdBy: new Types.ObjectId(adminId),
    });
    return toView(doc);
  }

  async removeAdjustment(id: string): Promise<{ ok: boolean }> {
    const res = await this.adjustmentModel.deleteOne({ _id: id }).exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Adjustment not found');
    }
    return { ok: true };
  }

  /** Employee portal: month dashboard. */
  async employeeSelfDashboard(
    employeeId: string,
    month?: string,
  ): Promise<Record<string, unknown>> {
    const emp = await this.findEmployeeOrFail(employeeId);
    if (emp.status === EmployeeStatus.TERMINATED) {
      throw new UnauthorizedException('Employee account is terminated');
    }
    return this.employeeMonthSnapshot(emp, parseMonth(month).month);
  }

  async employeeSelfAttendance(
    employeeId: string,
    month?: string,
    from?: string,
    to?: string,
  ): Promise<Record<string, unknown>> {
    await this.findEmployeeOrFail(employeeId);
    if (from && to) {
      const start = dayUtc(from);
      const end = dayUtc(to);
      end.setUTCHours(23, 59, 59, 999);
      const items = await this.attendanceModel
        .find({
          employeeId: new Types.ObjectId(employeeId),
          date: { $gte: start, $lte: end },
        })
        .sort({ date: 1 })
        .exec();
      const hoursWorked = round(
        items.reduce((sum, d) => sum + (d.hours || 0), 0),
      );
      return {
        from: from.slice(0, 10),
        to: to.slice(0, 10),
        hoursWorked,
        items: items.map((d) => toView(d)),
      };
    }
    return this.listAttendance(employeeId, month);
  }

  async employeeSelfVacations(
    employeeId: string,
  ): Promise<Record<string, unknown>[]> {
    const items = await this.vacationModel
      .find({ employeeId: new Types.ObjectId(employeeId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
    return items.map((v) => toView(v));
  }

  async employeeRequestVacation(
    employeeId: string,
    dto: EmployeeVacationRequestDto,
  ): Promise<Record<string, unknown>> {
    return this.createVacation({
      employeeId,
      from: dto.from,
      to: dto.to,
      type: dto.type,
      reason: dto.reason,
    });
  }

  async employeeSelfAdjustments(
    employeeId: string,
    month?: string,
  ): Promise<Record<string, unknown>[]> {
    const m = month ? parseMonth(month).month : undefined;
    return this.listAdjustmentsForEmployee(employeeId, m);
  }

  private async sumAdjustments(
    employeeId: string,
    month: string,
  ): Promise<{ bonus: number; deduction: number }> {
    const rows = await this.adjustmentModel
      .aggregate([
        {
          $match: {
            employeeId: new Types.ObjectId(employeeId),
            month,
          },
        },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$amount' },
          },
        },
      ])
      .exec();
    let bonus = 0;
    let deduction = 0;
    for (const row of rows as Array<{ _id: string; total: number }>) {
      if (row._id === PayrollAdjustmentType.BONUS) bonus = round(row.total);
      if (row._id === PayrollAdjustmentType.DEDUCTION) {
        deduction = round(row.total);
      }
    }
    return { bonus, deduction };
  }

  private async listAdjustmentsForEmployee(
    employeeId: string,
    month?: string,
  ): Promise<Record<string, unknown>[]> {
    const filter: Record<string, unknown> = {
      employeeId: new Types.ObjectId(employeeId),
    };
    if (month) filter['month'] = month;
    const items = await this.adjustmentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .exec();
    return items.map((a) => toView(a));
  }

  private adjustmentView(
    a: PayrollAdjustmentDocument,
  ): Record<string, unknown> {
    const view = toView(a);
    const emp = a.employeeId as unknown as
      | {
          fullName?: string;
          phone?: string;
          _id?: unknown;
          id?: string;
        }
      | Types.ObjectId;
    if (emp && typeof emp === 'object' && 'fullName' in emp) {
      view['employeeName'] = emp.fullName ?? '';
      view['employeeId'] = String(emp._id ?? emp.id ?? '');
    }
    return view;
  }

  private vacationView(v: VacationRequestDocument): Record<string, unknown> {
    const view = toView(v);
    const emp = v.employeeId as unknown as
      | {
          fullName?: string;
          phone?: string;
          jobTitle?: string;
          _id?: unknown;
          id?: string;
        }
      | Types.ObjectId;
    if (emp && typeof emp === 'object' && 'fullName' in emp) {
      view['employeeName'] = emp.fullName ?? '';
      view['employeePhone'] = emp.phone ?? '';
      view['employeeId'] = String(emp._id ?? emp.id ?? '');
    }
    return view;
  }
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
