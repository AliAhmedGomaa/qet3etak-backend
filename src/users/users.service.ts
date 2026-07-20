import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserStatus } from '../common/enums/user.enums';
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

  findShops(status?: UserStatus): Promise<UserDocument[]> {
    const filter: Record<string, unknown> = { role: 'SHOP_OWNER' };
    if (status) filter['status'] = status;
    return this.userModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateStatus(
    id: string,
    status: UserStatus,
    rejectionReason?: string,
  ): Promise<UserDocument> {
    const user = await this.findByIdOrFail(id);
    user.status = status;
    if (status === UserStatus.REJECTED) {
      user.rejectionReason = rejectionReason?.trim() || 'Rejected by admin';
    } else {
      user.rejectionReason = undefined;
    }
    return user.save();
  }
}
