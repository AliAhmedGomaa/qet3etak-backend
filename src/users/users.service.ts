import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserRole, UserStatus } from '../common/enums/user.enums';
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
};

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  create(data: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(data);
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

  async findShopByIdOrFail(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({ _id: id, role: UserRole.SHOP_OWNER })
      .exec();
    if (!user) throw new NotFoundException('Shop not found');
    return user;
  }

  async findShops(
    status?: UserStatus,
    page?: number,
    limit?: number,
    q?: string,
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
    const user = await this.findShopByIdOrFail(id);

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
}
