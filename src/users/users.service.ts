import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ADMIN_PANEL_ROLES,
  UserRole,
  UserStatus,
} from '../common/enums/user.enums';
import { withBranchFilter } from '../common/branch-scope';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { User, UserDocument } from './schemas/user.schema';

export type CreateUserInput = {
  fullName: string;
  shopName: string;
  phone: string;
  city: string;
  address: string;
  commercialRegPhotoUrl: string;
  passwordHash: string;
  role?: User['role'];
  status?: UserStatus;
  rejectionReason?: string;
  branchId?: string;
};

export type UpdateShopInput = {
  fullName?: string;
  shopName?: string;
  phone?: string;
  city?: string;
  address?: string;
  commercialRegPhotoUrl?: string;
  passwordHash?: string;
  status?: UserStatus;
  rejectionReason?: string;
  branchId?: string | null;
};

export type UpdateStaffInput = {
  fullName?: string;
  phone?: string;
  passwordHash?: string;
  role?: UserRole;
  status?: UserStatus;
};

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  create(data: CreateUserInput): Promise<UserDocument> {
    const { branchId, ...rest } = data;
    return this.userModel.create({
      ...rest,
      ...(branchId && Types.ObjectId.isValid(branchId)
        ? { branchId: new Types.ObjectId(branchId) }
        : {}),
    });
  }

  findByPhone(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone }).exec();
  }

  findByPhoneWithPassword(phone: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phone }).select('+passwordHash').exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByIdOrFail(id: string): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findShopByIdOrFail(
    id: string,
    opts?: { withPassword?: boolean },
  ): Promise<UserDocument> {
    let query = this.userModel.findOne({
      _id: id,
      role: UserRole.SHOP_OWNER,
    });
    if (opts?.withPassword) {
      query = query.select('+passwordHash');
    }
    const user = await query.exec();
    if (!user) throw new NotFoundException('Shop not found');
    return user;
  }

  async findShops(
    status?: UserStatus,
    page?: number,
    limit?: number,
    q?: string,
    branchScope?: string | null,
  ): Promise<PaginatedResult<UserDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = { role: UserRole.SHOP_OWNER };
    if (status) filter['status'] = status;
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [
        { fullName: rx },
        { shopName: rx },
        { phone: rx },
        { city: rx },
        { address: rx },
      ];
    }
    const scoped = withBranchFilter(filter, branchScope ?? null);
    const [items, total] = await Promise.all([
      this.userModel
        .find(scoped)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.userModel.countDocuments(scoped).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  /** Shop ids belonging to a branch (for wallet / credit scoping). */
  async findShopIdsByBranch(branchId: string): Promise<string[]> {
    if (!Types.ObjectId.isValid(branchId)) return [];
    const shops = await this.userModel
      .find({
        role: UserRole.SHOP_OWNER,
        branchId: new Types.ObjectId(branchId),
      })
      .select('_id')
      .exec();
    return shops.map((s) => String(s._id));
  }

  countApprovedShopOwners(): Promise<number> {
    return this.userModel
      .countDocuments({
        role: UserRole.SHOP_OWNER,
        status: UserStatus.APPROVED,
      })
      .exec();
  }

  findApprovedShopOwnersByIds(ids: string[]): Promise<UserDocument[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.userModel
      .find({
        _id: { $in: ids },
        role: UserRole.SHOP_OWNER,
        status: UserStatus.APPROVED,
      })
      .exec();
  }

  async updateShop(
    id: string,
    data: UpdateShopInput,
  ): Promise<UserDocument> {
    const user = await this.findShopByIdOrFail(id, {
      withPassword: data.passwordHash !== undefined,
    });

    if (data.phone && data.phone.trim() !== user.phone) {
      const phone = data.phone.trim();
      const exists = await this.userModel
        .exists({ phone, _id: { $ne: user._id } })
        .exec();
      if (exists) {
        throw new ConflictException('Phone number already registered');
      }
      user.phone = phone;
    }

    if (data.fullName !== undefined) user.fullName = data.fullName.trim();
    if (data.shopName !== undefined) user.shopName = data.shopName.trim();
    if (data.city !== undefined) user.city = data.city.trim();
    if (data.address !== undefined) user.address = data.address.trim();
    if (data.commercialRegPhotoUrl !== undefined) {
      user.commercialRegPhotoUrl = data.commercialRegPhotoUrl.trim();
    }
    if (data.passwordHash !== undefined) {
      user.passwordHash = data.passwordHash;
    }
    if (data.branchId !== undefined) {
      if (data.branchId === null || data.branchId === '') {
        user.branchId = undefined;
      } else if (Types.ObjectId.isValid(data.branchId)) {
        user.branchId = new Types.ObjectId(data.branchId);
      } else {
        throw new BadRequestException('Invalid branch id');
      }
    }
    if (data.status !== undefined) {
      user.status = data.status;
      if (data.status === UserStatus.REJECTED) {
        user.rejectionReason =
          data.rejectionReason?.trim() ||
          user.rejectionReason ||
          'Rejected by admin';
      } else {
        user.rejectionReason = undefined;
      }
    } else if (data.rejectionReason !== undefined) {
      user.rejectionReason = data.rejectionReason.trim() || undefined;
    }

    return user.save();
  }

  async removeShop(id: string): Promise<void> {
    const res = await this.userModel
      .deleteOne({ _id: id, role: UserRole.SHOP_OWNER })
      .exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Shop not found');
    }
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    rejectionReason?: string,
  ): Promise<UserDocument> {
    const user = await this.findShopByIdOrFail(id);
    user.status = status;
    if (status === UserStatus.REJECTED) {
      user.rejectionReason = rejectionReason?.trim() || 'Rejected by admin';
    } else {
      user.rejectionReason = undefined;
    }
    return user.save();
  }

  async findStaff(
    role?: UserRole,
    status?: UserStatus,
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<UserDocument>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {
      role: role ? role : { $in: ADMIN_PANEL_ROLES },
    };
    if (status) filter['status'] = status;
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [{ fullName: rx }, { phone: rx }];
    }
    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  async findStaffByIdOrFail(
    id: string,
    opts?: { withPassword?: boolean },
  ): Promise<UserDocument> {
    let query = this.userModel.findOne({
      _id: id,
      role: { $in: ADMIN_PANEL_ROLES },
    });
    if (opts?.withPassword) {
      query = query.select('+passwordHash');
    }
    const user = await query.exec();
    if (!user) throw new NotFoundException('Staff user not found');
    return user;
  }

  countActiveAdmins(): Promise<number> {
    return this.userModel
      .countDocuments({
        role: UserRole.ADMIN,
        status: UserStatus.APPROVED,
      })
      .exec();
  }

  async updateStaff(
    id: string,
    data: UpdateStaffInput,
  ): Promise<UserDocument> {
    const user = await this.findStaffByIdOrFail(id, {
      withPassword: data.passwordHash !== undefined,
    });

    if (data.phone && data.phone.trim() !== user.phone) {
      const phone = data.phone.trim();
      const exists = await this.userModel
        .exists({ phone, _id: { $ne: user._id } })
        .exec();
      if (exists) {
        throw new ConflictException('Phone number already registered');
      }
      user.phone = phone;
    }

    if (data.fullName !== undefined) user.fullName = data.fullName.trim();
    if (data.passwordHash !== undefined) user.passwordHash = data.passwordHash;
    if (data.role !== undefined) user.role = data.role;
    if (data.status !== undefined) {
      user.status = data.status;
      user.rejectionReason = undefined;
    }

    return user.save();
  }

  async removeStaff(id: string): Promise<void> {
    const res = await this.userModel
      .deleteOne({ _id: id, role: { $in: ADMIN_PANEL_ROLES } })
      .exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Staff user not found');
    }
  }
}
