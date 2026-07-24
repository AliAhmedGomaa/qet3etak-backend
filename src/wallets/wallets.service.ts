import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WalletTxType } from '../common/enums/order.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { Wallet, WalletDocument } from './schemas/wallet.schema';

const DEFAULT_CREDIT_LIMIT = 5000;

@Injectable()
export class WalletsService {
  constructor(
    @InjectModel(Wallet.name) private readonly walletModel: Model<Wallet>,
  ) {}

  async ensureForShop(
    shopId: string,
    creditLimit = DEFAULT_CREDIT_LIMIT,
  ): Promise<WalletDocument> {
    const oid = new Types.ObjectId(shopId);
    const existing = await this.walletModel.findOne({ shopId: oid }).exec();
    if (existing) return existing;

    try {
      return await this.walletModel.create({
        shopId: oid,
        creditLimit,
        currentDebt: 0,
        transactions: [
          {
            type: WalletTxType.CREDIT_LIMIT_CHANGE,
            amount: creditLimit,
            balanceAfter: 0,
            note: `Initial credit limit set to ${creditLimit}`,
          },
        ],
      });
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 11000) {
        return this.getByShopIdOrFail(shopId);
      }
      throw err;
    }
  }

  async getByShopId(shopId: string): Promise<WalletDocument> {
    const wallet = await this.walletModel
      .findOne({ shopId: new Types.ObjectId(shopId) })
      .exec();
    if (!wallet) {
      return this.ensureForShop(shopId);
    }
    return wallet;
  }

  async getByShopIdOrFail(shopId: string): Promise<WalletDocument> {
    const wallet = await this.walletModel
      .findOne({ shopId: new Types.ObjectId(shopId) })
      .exec();
    if (!wallet) throw new NotFoundException('Wallet not found for shop');
    return wallet;
  }

  assertCreditAvailable(wallet: WalletDocument, orderTotal: number): void {
    const projected = Number((wallet.currentDebt + orderTotal).toFixed(2));
    if (projected > wallet.creditLimit) {
      const available = Number(
        Math.max(0, wallet.creditLimit - wallet.currentDebt).toFixed(2),
      );
      throw new ForbiddenException({
        code: 'CREDIT_LIMIT_EXCEEDED',
        message: 'Order total plus current debt exceeds credit limit',
        creditLimit: wallet.creditLimit,
        currentDebt: wallet.currentDebt,
        orderTotal,
        availableCredit: available,
      });
    }
  }

  async chargeCredit(
    shopId: string,
    amount: number,
    orderId: Types.ObjectId,
    note: string,
  ): Promise<WalletDocument> {
    const wallet = await this.getByShopIdOrFail(shopId);
    this.assertCreditAvailable(wallet, amount);
    wallet.currentDebt = Number((wallet.currentDebt + amount).toFixed(2));
    wallet.transactions.unshift({
      type: WalletTxType.CREDIT_PURCHASE,
      amount,
      balanceAfter: wallet.currentDebt,
      note,
      orderId,
    } as Wallet['transactions'][number]);
    return wallet.save();
  }

  async setCreditLimit(
    shopId: string,
    creditLimit: number,
    adminId: string,
    note?: string,
  ): Promise<WalletDocument> {
    if (creditLimit < 0) {
      throw new BadRequestException('creditLimit must be >= 0');
    }
    const wallet = await this.ensureForShop(shopId);
    if (creditLimit < wallet.currentDebt) {
      throw new BadRequestException(
        `creditLimit cannot be below current debt (${wallet.currentDebt})`,
      );
    }
    const prev = wallet.creditLimit;
    wallet.creditLimit = creditLimit;
    wallet.transactions.unshift({
      type: WalletTxType.CREDIT_LIMIT_CHANGE,
      amount: creditLimit - prev,
      balanceAfter: wallet.currentDebt,
      note: note?.trim() || `Credit limit changed from ${prev} to ${creditLimit}`,
      createdBy: new Types.ObjectId(adminId),
    } as Wallet['transactions'][number]);
    return wallet.save();
  }

  async recordPayment(
    shopId: string,
    amount: number,
    adminId: string,
    note?: string,
  ): Promise<WalletDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const wallet = await this.getByShopIdOrFail(shopId);
    if (amount > wallet.currentDebt) {
      throw new BadRequestException(
        `Payment exceeds current debt (${wallet.currentDebt})`,
      );
    }
    wallet.currentDebt = Number((wallet.currentDebt - amount).toFixed(2));
    wallet.transactions.unshift({
      type: WalletTxType.PAYMENT,
      amount: -amount,
      balanceAfter: wallet.currentDebt,
      note: note?.trim() || 'Manual cash payment received',
      createdBy: new Types.ObjectId(adminId),
    } as Wallet['transactions'][number]);
    return wallet.save();
  }

  /**
   * Credit adjustment for approved returns on CREDIT orders.
   * Reduces currentDebt (clamped at 0) and logs WalletTxType.ADJUSTMENT.
   */
  async applyReturnCredit(
    shopId: string,
    amount: number,
    orderId: Types.ObjectId,
    adminId: string,
    note?: string,
  ): Promise<WalletDocument> {
    if (amount <= 0) {
      throw new BadRequestException('Return credit amount must be positive');
    }
    const wallet = await this.ensureForShop(shopId);
    const applied = Number(
      Math.min(amount, wallet.currentDebt).toFixed(2),
    );
    wallet.currentDebt = Number((wallet.currentDebt - applied).toFixed(2));
    wallet.transactions.unshift({
      type: WalletTxType.ADJUSTMENT,
      amount: -applied,
      balanceAfter: wallet.currentDebt,
      note:
        note?.trim() ||
        `Return credit ${applied}${applied < amount ? ` (requested ${amount})` : ''}`,
      orderId,
      createdBy: new Types.ObjectId(adminId),
    } as Wallet['transactions'][number]);
    return wallet.save();
  }

  async removeForShop(shopId: string): Promise<void> {
    await this.walletModel
      .deleteOne({ shopId: new Types.ObjectId(shopId) })
      .exec();
  }

  async listShopWallets(
    page?: number,
    limit?: number,
  ): Promise<
    PaginatedResult<
      Record<string, unknown> & { availableCredit: number; utilization: number }
    >
  > {
    const p = normalizePagination(page, limit, 20);
    const [wallets, total] = await Promise.all([
      this.walletModel
        .find()
        .populate('shopId', 'shopName fullName phone status city')
        .sort({ updatedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .select('-transactions')
        .exec(),
      this.walletModel.countDocuments().exec(),
    ]);

    const items = wallets.map((w) => {
      const json = w.toJSON() as unknown as Record<string, unknown>;
      const creditLimit = w.creditLimit || 0;
      const debt = w.currentDebt || 0;
      return {
        ...json,
        transactions: [],
        availableCredit: Number(Math.max(0, creditLimit - debt).toFixed(2)),
        utilization:
          creditLimit > 0
            ? Number(((debt / creditLimit) * 100).toFixed(1))
            : 0,
      };
    });

    return paginatedResult(items, total, p.page, p.limit);
  }

  toView(
    wallet: WalletDocument,
    page?: number,
    limit?: number,
  ) {
    const p = normalizePagination(page, limit, 20);
    const json = wallet.toJSON() as unknown as Record<string, unknown>;
    const creditLimit = wallet.creditLimit || 0;
    const debt = wallet.currentDebt || 0;
    const allTx = Array.isArray(wallet.transactions)
      ? wallet.transactions
      : [];
    const total = allTx.length;
    const sliced = allTx.slice(p.skip, p.skip + p.limit);
    const txPage = paginatedResult(sliced, total, p.page, p.limit);

    return {
      ...json,
      transactions: txPage.items,
      transactionsMeta: {
        page: txPage.page,
        limit: txPage.limit,
        total: txPage.total,
        totalPages: txPage.totalPages,
      },
      availableCredit: Number(Math.max(0, creditLimit - debt).toFixed(2)),
      utilization:
        creditLimit > 0 ? Number(((debt / creditLimit) * 100).toFixed(1)) : 0,
    };
  }
}
