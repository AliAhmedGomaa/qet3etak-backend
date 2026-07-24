import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OrderStatus,
  PaymentMethod,
  WalletTxType,
} from '../common/enums/order.enums';
import { withBranchFilter } from '../common/branch-scope';
import {
  normalizePagination,
  paginatedResult,
} from '../common/pagination';
import { DeliveryGuy } from '../delivery/schemas/delivery-guy.schema';
import { Order } from '../orders/schemas/order.schema';
import { Product } from '../products/schemas/product.schema';
import {
  ReturnRequest,
} from '../returns/schemas/return-request.schema';
import { User } from '../users/schemas/user.schema';
import { Wallet } from '../wallets/schemas/wallet.schema';
import { toCsv } from './csv.util';
import { UserRole } from '../common/enums/user.enums';

function parseRange(from?: string, to?: string): {
  start: Date;
  end: Date;
  from: string;
  to: string;
} {
  const start = from ? new Date(from) : new Date(0);
  const end = to ? new Date(to) : new Date();
  if (to && to.length <= 10) {
    end.setHours(23, 59, 59, 999);
  }
  return {
    start,
    end,
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function createdAtMatch(start: Date, end: Date) {
  return { createdAt: { $gte: start, $lte: end } };
}

function orderMatch(
  start: Date,
  end: Date,
  branchScope?: string | null,
): Record<string, unknown> {
  return withBranchFilter(createdAtMatch(start, end), branchScope ?? null);
}

/** Sum item quantities without unwinding (avoids double-count in $group). */
function itemsQtySumExpr() {
  return {
    $reduce: {
      input: { $ifNull: ['$items', []] },
      initialValue: 0,
      in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 0] }] },
    },
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(DeliveryGuy.name)
    private readonly deliveryGuyModel: Model<DeliveryGuy>,
    @InjectModel(ReturnRequest.name)
    private readonly returnModel: Model<ReturnRequest>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private async shopIdsForBranch(
    branchScope?: string | null,
  ): Promise<Types.ObjectId[] | null> {
    if (branchScope === null || branchScope === undefined) return null;
    if (!branchScope || !Types.ObjectId.isValid(branchScope)) return [];
    const shops = await this.userModel
      .find({
        role: UserRole.SHOP_OWNER,
        branchId: new Types.ObjectId(branchScope),
      })
      .select('_id')
      .exec();
    return shops.map((s) => s._id as Types.ObjectId);
  }

  // ─── Summary dashboard KPIs ───────────────────────────────────────────

  async getSummary(
    from?: string,
    to?: string,
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = orderMatch(range.start, range.end, branchScope);
    const shopIds = await this.shopIdsForBranch(branchScope);
    const walletMatch =
      shopIds === null
        ? {}
        : shopIds.length
          ? { shopId: { $in: shopIds } }
          : { _id: { $in: [] } };

    const [orderAgg, deliveredAgg, walletAgg, lowStock, deliveryAgg] =
      await Promise.all([
        this.orderModel
          .aggregate([
            { $match: match },
            {
              $group: {
                _id: null,
                orderCount: { $sum: 1 },
                revenue: { $sum: '$total' },
              },
            },
          ])
          .exec(),
        this.orderModel
          .aggregate([
            {
              $match: {
                ...match,
                status: OrderStatus.DELIVERED,
              },
            },
            {
              $group: {
                _id: null,
                deliveredCount: { $sum: 1 },
                deliveredRevenue: { $sum: '$total' },
                deliveryFees: { $sum: '$deliveryFee' },
              },
            },
          ])
          .exec(),
        this.walletModel
          .aggregate([
            { $match: walletMatch },
            {
              $group: {
                _id: null,
                totalDebt: { $sum: '$currentDebt' },
                totalCreditLimit: { $sum: '$creditLimit' },
                shopsWithDebt: {
                  $sum: { $cond: [{ $gt: ['$currentDebt', 0] }, 1, 0] },
                },
              },
            },
          ])
          .exec(),
        this.productModel
          .countDocuments({ isActive: true, stockQuantity: { $lte: 10 } })
          .exec(),
        this.orderModel
          .aggregate([
            {
              $match: {
                ...match,
                deliveryGuyId: { $exists: true, $ne: null },
              },
            },
            {
              $group: {
                _id: null,
                assignedDeliveries: { $sum: 1 },
              },
            },
          ])
          .exec(),
      ]);

    return {
      range: { from: range.from, to: range.to },
      orderCount: orderAgg[0]?.orderCount ?? 0,
      revenue: round(orderAgg[0]?.revenue ?? 0),
      deliveredCount: deliveredAgg[0]?.deliveredCount ?? 0,
      deliveredRevenue: round(deliveredAgg[0]?.deliveredRevenue ?? 0),
      deliveryFees: round(deliveredAgg[0]?.deliveryFees ?? 0),
      assignedDeliveries: deliveryAgg[0]?.assignedDeliveries ?? 0,
      totalDebt: round(walletAgg[0]?.totalDebt ?? 0),
      totalCreditLimit: round(walletAgg[0]?.totalCreditLimit ?? 0),
      shopsWithDebt: walletAgg[0]?.shopsWithDebt ?? 0,
      lowStockCount: lowStock,
    };
  }

  // ─── Sales / orders ───────────────────────────────────────────────────

  async getSales(
    from?: string,
    to?: string,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = orderMatch(range.start, range.end, branchScope);

    const [totals, byStatus, byPayment, byDay] = await Promise.all([
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
              unitsSold: { $sum: itemsQtySumExpr() },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$status',
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
          { $sort: { orderCount: -1 } },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$paymentMethod',
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
          { $sort: { revenue: -1 } },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
    ]);

    const payload = {
      range: { from: range.from, to: range.to },
      totals: {
        orderCount: totals[0]?.orderCount ?? 0,
        revenue: round(totals[0]?.revenue ?? 0),
        unitsSold: totals[0]?.unitsSold ?? 0,
      },
      byStatus: (
        byStatus as Array<{ _id: OrderStatus; orderCount: number; revenue: number }>
      ).map((r) => ({
        status: r._id,
        orderCount: r.orderCount,
        revenue: round(r.revenue),
      })),
      byPaymentMethod: (
        byPayment as Array<{
          _id: PaymentMethod;
          orderCount: number;
          revenue: number;
        }>
      ).map((r) => ({
        paymentMethod: r._id,
        orderCount: r.orderCount,
        revenue: round(r.revenue),
      })),
      byDay: (
        byDay as Array<{ _id: string; orderCount: number; revenue: number }>
      ).map((r) => ({
        date: r._id,
        orderCount: r.orderCount,
        revenue: round(r.revenue),
      })),
    };

    if (format === 'csv') {
      return {
        csv: toCsv(
          ['date', 'orderCount', 'revenue'],
          payload.byDay.map((d) => [d.date, d.orderCount, d.revenue]),
        ),
        filename: `sales-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      };
    }
    return payload;
  }

  // ─── Shop performance ─────────────────────────────────────────────────

  async getShops(
    from?: string,
    to?: string,
    page?: number,
    limit?: number,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = orderMatch(range.start, range.end, branchScope);
    const { page: p, limit: l, skip } = normalizePagination(page, limit, 20);

    const [facet] = await this.orderModel
      .aggregate([
        { $match: match },
          {
            $group: {
              _id: '$shopId',
              shopName: { $first: '$shopName' },
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
              unitsSold: { $sum: itemsQtySumExpr() },
            },
          },
          { $sort: { revenue: -1 } },
          {
            $facet: {
              items: [
                { $skip: skip },
                { $limit: l },
                {
                  $project: {
                    _id: 0,
                    shopId: { $toString: '$_id' },
                    shopName: 1,
                    orderCount: 1,
                    revenue: { $round: ['$revenue', 2] },
                    unitsSold: 1,
                  },
                },
              ],
              total: [{ $count: 'count' }],
              summary: [
                {
                  $group: {
                    _id: null,
                    shopCount: { $sum: 1 },
                    orderCount: { $sum: '$orderCount' },
                    revenue: { $sum: '$revenue' },
                  },
                },
              ],
            },
          },
        ])
        .exec();

    const items = (facet?.items ?? []) as Array<{
      shopId: string;
      shopName: string;
      orderCount: number;
      revenue: number;
      unitsSold: number;
    }>;
    const total = facet?.total?.[0]?.count ?? 0;
    const summary = facet?.summary?.[0] ?? {
      shopCount: 0,
      orderCount: 0,
      revenue: 0,
    };

    if (format === 'csv') {
      // Export top page (or re-fetch all capped) — export up to 500 for CSV
      const all = await this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$shopId',
              shopName: { $first: '$shopName' },
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
              unitsSold: { $sum: itemsQtySumExpr() },
            },
          },
          { $sort: { revenue: -1 } },
          { $limit: 500 },
        ])
        .exec();
      return {
        csv: toCsv(
          ['shopId', 'shopName', 'orderCount', 'revenue', 'unitsSold'],
          all.map((r) => [
            String(r._id),
            r.shopName,
            r.orderCount,
            round(r.revenue),
            r.unitsSold,
          ]),
        ),
        filename: `shops-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      };
    }

    return {
      range: { from: range.from, to: range.to },
      summary: {
        shopCount: summary.shopCount,
        orderCount: summary.orderCount,
        revenue: round(summary.revenue),
      },
      ...paginatedResult(items, total, p, l),
    };
  }

  // ─── Product performance ──────────────────────────────────────────────

  async getProducts(
    from?: string,
    to?: string,
    page?: number,
    limit?: number,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = orderMatch(range.start, range.end, branchScope);
    const { page: p, limit: l, skip } = normalizePagination(page, limit, 20);

    const [facet] = await this.orderModel
      .aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            title: { $first: '$items.title' },
            sku: { $first: '$items.sku' },
            quantitySold: { $sum: '$items.quantity' },
            revenue: { $sum: '$items.lineTotal' },
            orderCount: { $addToSet: '$_id' },
          },
        },
        {
          $project: {
            title: 1,
            sku: 1,
            quantitySold: 1,
            revenue: 1,
            orderCount: { $size: '$orderCount' },
          },
        },
        { $sort: { quantitySold: -1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: l },
              {
                $project: {
                  _id: 0,
                  productId: { $toString: '$_id' },
                  title: 1,
                  sku: 1,
                  quantitySold: 1,
                  revenue: { $round: ['$revenue', 2] },
                  orderCount: 1,
                },
              },
            ],
            total: [{ $count: 'count' }],
          },
        },
      ])
      .exec();

    const items = (facet?.items ?? []) as Array<{
      productId: string;
      title: string;
      sku: string;
      quantitySold: number;
      revenue: number;
      orderCount: number;
    }>;
    const total = facet?.total?.[0]?.count ?? 0;

    if (format === 'csv') {
      const all = await this.orderModel
        .aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              title: { $first: '$items.title' },
              sku: { $first: '$items.sku' },
              quantitySold: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.lineTotal' },
            },
          },
          { $sort: { quantitySold: -1 } },
          { $limit: 500 },
        ])
        .exec();
      return {
        csv: toCsv(
          ['productId', 'title', 'sku', 'quantitySold', 'revenue'],
          all.map((r) => [
            String(r._id),
            r.title,
            r.sku,
            r.quantitySold,
            round(r.revenue),
          ]),
        ),
        filename: `products-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      };
    }

    return {
      range: { from: range.from, to: range.to },
      ...paginatedResult(items, total, p, l),
    };
  }

  // ─── Credit / wallet ──────────────────────────────────────────────────

  async getCredit(
    from?: string,
    to?: string,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const shopIds = await this.shopIdsForBranch(branchScope);
    const walletMatch =
      shopIds === null
        ? {}
        : shopIds.length
          ? { shopId: { $in: shopIds } }
          : { _id: { $in: [] } };

    const [balances, movements] = await Promise.all([
      this.walletModel
        .aggregate([
          { $match: walletMatch },
          {
            $lookup: {
              from: 'users',
              localField: 'shopId',
              foreignField: '_id',
              as: 'shop',
            },
          },
          {
            $unwind: { path: '$shop', preserveNullAndEmptyArrays: true },
          },
          {
            $project: {
              _id: 0,
              shopId: { $toString: '$shopId' },
              shopName: { $ifNull: ['$shop.shopName', ''] },
              creditLimit: 1,
              currentDebt: 1,
              availableCredit: {
                $subtract: ['$creditLimit', '$currentDebt'],
              },
              utilization: {
                $cond: [
                  { $lte: ['$creditLimit', 0] },
                  0,
                  {
                    $multiply: [
                      { $divide: ['$currentDebt', '$creditLimit'] },
                      100,
                    ],
                  },
                ],
              },
            },
          },
          { $sort: { currentDebt: -1 } },
          { $limit: 500 },
        ])
        .exec(),
      this.walletModel
        .aggregate([
          { $match: walletMatch },
          { $unwind: '$transactions' },
          {
            $match: {
              'transactions.createdAt': {
                $gte: range.start,
                $lte: range.end,
              },
            },
          },
          {
            $group: {
              _id: '$transactions.type',
              count: { $sum: 1 },
              totalAmount: { $sum: '$transactions.amount' },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
    ]);

    const balanceRows = (
      balances as Array<{
        shopId: string;
        shopName: string;
        creditLimit: number;
        currentDebt: number;
        availableCredit: number;
        utilization: number;
      }>
    ).map((b) => ({
      ...b,
      creditLimit: round(b.creditLimit),
      currentDebt: round(b.currentDebt),
      availableCredit: round(b.availableCredit),
      utilization: round(b.utilization),
    }));

    const totals = balanceRows.reduce(
      (acc, b) => {
        acc.totalDebt += b.currentDebt;
        acc.totalCreditLimit += b.creditLimit;
        if (b.currentDebt > 0) acc.shopsWithDebt += 1;
        return acc;
      },
      { totalDebt: 0, totalCreditLimit: 0, shopsWithDebt: 0 },
    );

    const movementSummary = (
      movements as Array<{
        _id: WalletTxType;
        count: number;
        totalAmount: number;
      }>
    ).map((m) => ({
      type: m._id,
      count: m.count,
      totalAmount: round(m.totalAmount),
    }));

    if (format === 'csv') {
      return {
        csv: toCsv(
          [
            'shopId',
            'shopName',
            'creditLimit',
            'currentDebt',
            'availableCredit',
            'utilization',
          ],
          balanceRows.map((b) => [
            b.shopId,
            b.shopName,
            b.creditLimit,
            b.currentDebt,
            b.availableCredit,
            b.utilization,
          ]),
        ),
        filename: `credit-${range.from.slice(0, 10)}.csv`,
      };
    }

    return {
      range: { from: range.from, to: range.to },
      summary: {
        totalDebt: round(totals.totalDebt),
        totalCreditLimit: round(totals.totalCreditLimit),
        shopsWithDebt: totals.shopsWithDebt,
        walletCount: balanceRows.length,
      },
      movements: movementSummary,
      balances: balanceRows,
    };
  }

  // ─── Delivery ─────────────────────────────────────────────────────────

  async getDelivery(
    from?: string,
    to?: string,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = {
      ...orderMatch(range.start, range.end, branchScope),
      deliveryGuyId: { $exists: true, $ne: null },
    };

    const [byCourier, totals] = await Promise.all([
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$deliveryGuyId',
              deliveryGuyName: { $first: '$deliveryGuyName' },
              deliveries: { $sum: 1 },
              deliveredCount: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', OrderStatus.DELIVERED] },
                    1,
                    0,
                  ],
                },
              },
              feesEarned: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', OrderStatus.DELIVERED] },
                    '$deliveryFee',
                    0,
                  ],
                },
              },
              feesAssigned: { $sum: '$deliveryFee' },
              orderRevenue: { $sum: '$total' },
            },
          },
          { $sort: { feesEarned: -1 } },
          {
            $project: {
              _id: 0,
              deliveryGuyId: { $toString: '$_id' },
              deliveryGuyName: 1,
              deliveries: 1,
              deliveredCount: 1,
              feesEarned: { $round: ['$feesEarned', 2] },
              feesAssigned: { $round: ['$feesAssigned', 2] },
              orderRevenue: { $round: ['$orderRevenue', 2] },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              deliveries: { $sum: 1 },
              deliveredCount: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', OrderStatus.DELIVERED] },
                    1,
                    0,
                  ],
                },
              },
              feesEarned: {
                $sum: {
                  $cond: [
                    { $eq: ['$status', OrderStatus.DELIVERED] },
                    '$deliveryFee',
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
    ]);

    // Lifetime counters from delivery_guys (for context)
    const lifetime = await this.deliveryGuyModel
      .find()
      .select('fullName totalDeliveries totalFeesEarned status')
      .lean()
      .exec();

    const couriers = byCourier as Array<{
      deliveryGuyId: string;
      deliveryGuyName: string;
      deliveries: number;
      deliveredCount: number;
      feesEarned: number;
      feesAssigned: number;
      orderRevenue: number;
    }>;

    if (format === 'csv') {
      return {
        csv: toCsv(
          [
            'deliveryGuyId',
            'deliveryGuyName',
            'deliveries',
            'deliveredCount',
            'feesEarned',
            'feesAssigned',
            'orderRevenue',
          ],
          couriers.map((c) => [
            c.deliveryGuyId,
            c.deliveryGuyName,
            c.deliveries,
            c.deliveredCount,
            c.feesEarned,
            c.feesAssigned,
            c.orderRevenue,
          ]),
        ),
        filename: `delivery-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      };
    }

    return {
      range: { from: range.from, to: range.to },
      summary: {
        deliveries: totals[0]?.deliveries ?? 0,
        deliveredCount: totals[0]?.deliveredCount ?? 0,
        feesEarned: round(totals[0]?.feesEarned ?? 0),
      },
      byCourier: couriers,
      lifetime: lifetime.map((g) => ({
        id: String(g._id),
        fullName: g.fullName,
        status: g.status,
        totalDeliveries: g.totalDeliveries,
        totalFeesEarned: round(g.totalFeesEarned),
      })),
    };
  }

  // ─── Inventory ────────────────────────────────────────────────────────

  async getInventory(
    page?: number,
    limit?: number,
    lowStockThreshold = 10,
    format: 'json' | 'csv' = 'json',
  ) {
    const { page: p, limit: l, skip } = normalizePagination(page, limit, 50);
    const threshold = Math.max(0, lowStockThreshold);

    const [summaryAgg, lowStockFacet] = await Promise.all([
      this.productModel
        .aggregate([
          { $match: { isActive: true } },
          {
            $group: {
              _id: null,
              productCount: { $sum: 1 },
              totalUnits: { $sum: '$stockQuantity' },
              inventoryValue: {
                $sum: { $multiply: ['$stockQuantity', '$costPrice'] },
              },
              retailValue: {
                $sum: { $multiply: ['$stockQuantity', '$basePrice'] },
              },
              outOfStock: {
                $sum: { $cond: [{ $lte: ['$stockQuantity', 0] }, 1, 0] },
              },
              lowStock: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $gt: ['$stockQuantity', 0] },
                        { $lte: ['$stockQuantity', threshold] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ])
        .exec(),
      this.productModel
        .aggregate([
          {
            $match: {
              isActive: true,
              stockQuantity: { $lte: threshold },
            },
          },
          { $sort: { stockQuantity: 1, title: 1 } },
          {
            $facet: {
              items: [
                { $skip: skip },
                { $limit: l },
                {
                  $project: {
                    _id: 0,
                    productId: { $toString: '$_id' },
                    title: 1,
                    sku: 1,
                    brand: 1,
                    stockQuantity: 1,
                    costPrice: 1,
                    basePrice: 1,
                    stockValue: {
                      $round: [
                        { $multiply: ['$stockQuantity', '$costPrice'] },
                        2,
                      ],
                    },
                  },
                },
              ],
              total: [{ $count: 'count' }],
            },
          },
        ])
        .exec(),
    ]);

    const summary = summaryAgg[0] ?? {
      productCount: 0,
      totalUnits: 0,
      inventoryValue: 0,
      retailValue: 0,
      outOfStock: 0,
      lowStock: 0,
    };
    const facet = lowStockFacet[0] ?? { items: [], total: [] };
    const items = facet.items ?? [];
    const total = facet.total?.[0]?.count ?? 0;

    if (format === 'csv') {
      const all = await this.productModel
        .find({ isActive: true, stockQuantity: { $lte: threshold } })
        .sort({ stockQuantity: 1 })
        .limit(500)
        .select('title sku brand stockQuantity costPrice basePrice')
        .lean()
        .exec();
      return {
        csv: toCsv(
          [
            'productId',
            'title',
            'sku',
            'brand',
            'stockQuantity',
            'costPrice',
            'basePrice',
            'stockValue',
          ],
          all.map((r) => [
            String(r._id),
            r.title,
            r.sku,
            r.brand,
            r.stockQuantity,
            r.costPrice,
            r.basePrice,
            round(r.stockQuantity * r.costPrice),
          ]),
        ),
        filename: `inventory-low-stock.csv`,
      };
    }

    return {
      lowStockThreshold: threshold,
      summary: {
        productCount: summary.productCount,
        totalUnits: summary.totalUnits,
        inventoryValue: round(summary.inventoryValue),
        retailValue: round(summary.retailValue),
        outOfStock: summary.outOfStock,
        lowStock: summary.lowStock,
      },
      ...paginatedResult(items, total, p, l),
    };
  }

  // ─── Shop-owner: my orders summary ────────────────────────────────────

  async getMyOrdersSummary(shopId: string, from?: string, to?: string) {
    const range = parseRange(from, to);
    const shopObjectId = new Types.ObjectId(shopId);
    const match = {
      shopId: shopObjectId,
      ...orderMatch(range.start, range.end),
    };

    const [totals, byStatus, byPayment, topProducts] = await Promise.all([
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
              unitsBought: { $sum: itemsQtySumExpr() },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$status',
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$paymentMethod',
              orderCount: { $sum: 1 },
              revenue: { $sum: '$total' },
            },
          },
        ])
        .exec(),
      this.orderModel
        .aggregate([
          { $match: match },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              title: { $first: '$items.title' },
              quantity: { $sum: '$items.quantity' },
              spent: { $sum: '$items.lineTotal' },
            },
          },
          { $sort: { quantity: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              productId: { $toString: '$_id' },
              title: 1,
              quantity: 1,
              spent: { $round: ['$spent', 2] },
            },
          },
        ])
        .exec(),
    ]);

    return {
      range: { from: range.from, to: range.to },
      totals: {
        orderCount: totals[0]?.orderCount ?? 0,
        spent: round(totals[0]?.revenue ?? 0),
        unitsBought: totals[0]?.unitsBought ?? 0,
      },
      byStatus: (
        byStatus as Array<{ _id: string; orderCount: number; revenue: number }>
      ).map((r) => ({
        status: r._id,
        orderCount: r.orderCount,
        spent: round(r.revenue),
      })),
      byPaymentMethod: (
        byPayment as Array<{ _id: string; orderCount: number; revenue: number }>
      ).map((r) => ({
        paymentMethod: r._id,
        orderCount: r.orderCount,
        spent: round(r.revenue),
      })),
      topProducts,
    };
  }

  // ─── Returns ──────────────────────────────────────────────────────────

  async getReturns(
    from?: string,
    to?: string,
    format: 'json' | 'csv' = 'json',
    branchScope?: string | null,
  ) {
    const range = parseRange(from, to);
    const match = orderMatch(range.start, range.end, branchScope);

    const [totals, byStatus, byRefund, recent] = await Promise.all([
      this.returnModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: null,
              returnCount: { $sum: 1 },
              refundAmount: { $sum: '$refundAmount' },
              unitsReturned: { $sum: itemsQtySumExpr() },
            },
          },
        ])
        .exec(),
      this.returnModel
        .aggregate([
          { $match: match },
          {
            $group: {
              _id: '$status',
              returnCount: { $sum: 1 },
              refundAmount: { $sum: '$refundAmount' },
            },
          },
          { $sort: { returnCount: -1 } },
        ])
        .exec(),
      this.returnModel
        .aggregate([
          {
            $match: {
              ...match,
              status: 'APPROVED',
              refundMethod: { $exists: true, $ne: null },
            },
          },
          {
            $group: {
              _id: '$refundMethod',
              returnCount: { $sum: 1 },
              refundAmount: { $sum: '$refundAmount' },
            },
          },
        ])
        .exec(),
      this.returnModel
        .aggregate([
          { $match: match },
          { $sort: { createdAt: -1 } },
          { $limit: 100 },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              shopName: 1,
              orderNumber: 1,
              status: 1,
              refundAmount: 1,
              refundMethod: 1,
              reason: 1,
              createdAt: 1,
            },
          },
        ])
        .exec(),
    ]);

    const payload = {
      range: { from: range.from, to: range.to },
      summary: {
        returnCount: totals[0]?.returnCount ?? 0,
        refundAmount: round(totals[0]?.refundAmount ?? 0),
        unitsReturned: totals[0]?.unitsReturned ?? 0,
      },
      byStatus: (
        byStatus as Array<{
          _id: string;
          returnCount: number;
          refundAmount: number;
        }>
      ).map((r) => ({
        status: r._id,
        returnCount: r.returnCount,
        refundAmount: round(r.refundAmount),
      })),
      byRefundMethod: (
        byRefund as Array<{
          _id: string;
          returnCount: number;
          refundAmount: number;
        }>
      ).map((r) => ({
        refundMethod: r._id,
        returnCount: r.returnCount,
        refundAmount: round(r.refundAmount),
      })),
      recent: (
        recent as Array<{
          id: string;
          shopName: string;
          orderNumber: string;
          status: string;
          refundAmount: number;
          refundMethod?: string;
          reason: string;
          createdAt: Date;
        }>
      ).map((r) => ({
        ...r,
        refundAmount: round(r.refundAmount),
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt ?? ''),
      })),
    };

    if (format === 'csv') {
      return {
        csv: toCsv(
          [
            'id',
            'shopName',
            'orderNumber',
            'status',
            'refundAmount',
            'refundMethod',
            'reason',
            'createdAt',
          ],
          payload.recent.map((r) => [
            r.id,
            r.shopName,
            r.orderNumber,
            r.status,
            r.refundAmount,
            r.refundMethod ?? '',
            r.reason,
            r.createdAt,
          ]),
        ),
        filename: `returns-${range.from.slice(0, 10)}_${range.to.slice(0, 10)}.csv`,
      };
    }

    return payload;
  }
}

export type CsvExport = { csv: string; filename: string };

export function isCsvExport(value: unknown): value is CsvExport {
  return (
    typeof value === 'object' &&
    value !== null &&
    'csv' in value &&
    typeof (value as CsvExport).csv === 'string'
  );
}
