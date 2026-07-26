import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrderStatus } from '../common/enums/order.enums';
import { ExpenseCategory } from '../common/enums/financial.enums';
import { ExpenseSource } from '../common/enums/hr.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { withBranchFilter } from '../common/branch-scope';
import { ProductsService } from '../products/products.service';
import { Order } from '../orders/schemas/order.schema';
import { CreateExpenseDto, DamagedStockDto } from './dto/expense.dto';
import { Expense } from './schemas/expense.schema';

/** Orders in these statuses count as realized sales (revenue + COGS). */
const COMPLETED_STATUSES = [OrderStatus.DELIVERED];

function toView(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

export interface PnlReport {
  range: { startDate: string; endDate: string };
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number;
  netMargin: number;
  orderCount: number;
  unitsSold: number;
  expensesByCategory: Array<{ category: ExpenseCategory; amount: number }>;
}

@Injectable()
export class FinancialsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    private readonly productsService: ProductsService,
  ) {}

  async getPnl(
    startDate?: string,
    endDate?: string,
    branchScope?: string | null,
  ): Promise<PnlReport> {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    // Include the whole end day when only a date (no time) is provided.
    if (endDate && endDate.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }

    const orderMatch = withBranchFilter(
      {
        status: { $in: COMPLETED_STATUSES },
        createdAt: { $gte: start, $lte: end },
      },
      branchScope ?? null,
    );

    const scoped = branchScope !== null && branchScope !== undefined;

    const [revenueAgg, cogsAgg, expenseAgg] = await Promise.all([
      this.orderModel
        .aggregate([
          { $match: orderMatch },
          {
            $group: {
              _id: null,
              revenue: { $sum: '$total' },
              orders: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: orderMatch },
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              localField: 'items.productId',
              foreignField: '_id',
              as: 'product',
            },
          },
          { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: null,
              cogs: {
                $sum: {
                  $multiply: [
                    '$items.quantity',
                    { $ifNull: ['$product.costPrice', 0] },
                  ],
                },
              },
              unitsSold: { $sum: '$items.quantity' },
            },
          },
        ])
        .exec(),
      // HQ expenses stay global; branch-scoped P&L omits them.
      scoped
        ? Promise.resolve([])
        : this.expenseModel
            .aggregate([
              { $match: { date: { $gte: start, $lte: end } } },
              { $group: { _id: '$category', amount: { $sum: '$amount' } } },
              { $sort: { amount: -1 } },
            ])
            .exec(),
    ]);

    const totalRevenue = round(revenueAgg[0]?.revenue ?? 0);
    const orderCount = revenueAgg[0]?.orders ?? 0;
    const totalCogs = round(cogsAgg[0]?.cogs ?? 0);
    const unitsSold = cogsAgg[0]?.unitsSold ?? 0;
    const grossProfit = round(totalRevenue - totalCogs);

    const expensesByCategory = (
      expenseAgg as Array<{ _id: ExpenseCategory; amount: number }>
    ).map((e) => ({ category: e._id, amount: round(e.amount) }));
    const totalExpenses = round(
      expensesByCategory.reduce((sum, e) => sum + e.amount, 0),
    );

    const netProfit = round(grossProfit - totalExpenses);

    return {
      range: { startDate: start.toISOString(), endDate: end.toISOString() },
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMargin: totalRevenue > 0 ? round((grossProfit / totalRevenue) * 100) : 0,
      totalExpenses,
      netProfit,
      netMargin: totalRevenue > 0 ? round((netProfit / totalRevenue) * 100) : 0,
      orderCount,
      unitsSold,
      expensesByCategory,
    };
  }

  async createExpense(
    dto: CreateExpenseDto,
  ): Promise<Record<string, unknown>> {
    const expense = await this.expenseModel.create({
      category: dto.category,
      amount: dto.amount,
      date: dto.date ? new Date(dto.date) : new Date(),
      description: dto.description?.trim() ?? '',
      source: ExpenseSource.MANUAL,
    });
    return toView(expense);
  }

  async createPayrollExpense(input: {
    employeeId: string;
    payrollMonth: string;
    amount: number;
    description: string;
    date?: Date;
  }): Promise<Record<string, unknown>> {
    const expense = await this.expenseModel.create({
      category: ExpenseCategory.SALARIES,
      amount: input.amount,
      date: input.date ?? new Date(),
      description: input.description,
      source: ExpenseSource.PAYROLL,
      employeeId: new Types.ObjectId(input.employeeId),
      payrollMonth: input.payrollMonth,
    });
    return toView(expense);
  }

  async listExpenses(
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const [items, total] = await Promise.all([
      this.expenseModel
        .find()
        .populate('employeeId', 'fullName phone jobTitle')
        .sort({ date: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.expenseModel.countDocuments().exec(),
    ]);
    return paginatedResult(
      items.map((e) => {
        const view = toView(e);
        const emp = e.employeeId as unknown as
          | { fullName?: string; phone?: string; jobTitle?: string; _id?: unknown; id?: string }
          | Types.ObjectId
          | null
          | undefined;
        if (emp && typeof emp === 'object' && 'fullName' in emp) {
          view['employeeName'] = emp.fullName ?? '';
          view['employeeId'] = String(emp._id ?? emp.id ?? '');
        }
        return view;
      }),
      total,
      p.page,
      p.limit,
    );
  }

  async removeExpense(id: string): Promise<{ deleted: boolean }> {
    const res = await this.expenseModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Expense not found');
    return { deleted: true };
  }

  async removeExpenseById(id: string): Promise<void> {
    await this.expenseModel.findByIdAndDelete(id).exec();
  }

  /**
   * Write off damaged/lost stock: decrement inventory and log the loss as a
   * DAMAGED_PARTS expense valued at the product's current cost price.
   */
  async recordDamagedStock(
    dto: DamagedStockDto,
  ): Promise<Record<string, unknown>> {
    const product = await this.productsService.decrementStock(
      dto.productId,
      dto.quantity,
    );
    const lossValue = round((product.costPrice ?? 0) * dto.quantity);
    const expense = await this.expenseModel.create({
      category: ExpenseCategory.DAMAGED_PARTS,
      amount: lossValue,
      date: new Date(),
      description:
        dto.description?.trim() ||
        `تلف ${dto.quantity} وحدة من ${product.title}`,
      source: ExpenseSource.MANUAL,
    });
    return {
      expense: toView(expense),
      product: {
        id: String(product._id),
        title: product.title,
        stockQuantity: product.stockQuantity,
        costPrice: product.costPrice,
      },
      lossValue,
    };
  }
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
