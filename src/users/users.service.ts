import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model, Types } from 'mongoose';
import {
  ADMIN_PANEL_ROLES,
  UserRole,
  UserStatus,
} from '../common/enums/user.enums';
import { withBranchFilter } from '../common/branch-scope';
import { absoluteMediaUrl } from '../common/media-url';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { RolesService } from '../roles/roles.service';
import { User, UserDocument } from './schemas/user.schema';

export type CreateUserInput = {
  fullName: string;
  shopName: string;
  phone: string;
  city: string;
  address: string;
  locationLat?: number;
  locationLng?: number;
  commercialRegPhotoUrl: string;
  passwordHash: string;
  role?: User['role'];
  roleId?: string;
  status?: UserStatus;
  rejectionReason?: string;
  branchId?: string;
  shopDiscountPercent?: number;
};

export type UpdateShopInput = {
  fullName?: string;
  shopName?: string;
  phone?: string;
  city?: string;
  address?: string;
  locationLat?: number | null;
  locationLng?: number | null;
  commercialRegPhotoUrl?: string;
  passwordHash?: string;
  status?: UserStatus;
  rejectionReason?: string;
  branchId?: string | null;
  shopDiscountPercent?: number;
};

export type UpdateStaffInput = {
  fullName?: string;
  phone?: string;
  passwordHash?: string;
  role?: UserRole | string;
  roleId?: string;
  status?: UserStatus;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly rolesService: RolesService,
  ) {}

  async create(data: CreateUserInput): Promise<UserDocument> {
    const { branchId, roleId, role, ...rest } = data;
    const resolved = await this.resolveRoleAssignment({ role, roleId });
    return this.userModel.create({
      ...rest,
      role: resolved.code,
      roleId: resolved.id,
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

  /**
   * System counter party used as shopId for walk-in (in-store) sales.
   * Idempotent — creates once with a reserved phone number.
   */
  async ensureWalkInCounterShop(): Promise<UserDocument> {
    const phone = '00000000000';
    const existing = await this.findByPhone(phone);
    if (existing) return existing;
    const passwordHash = await bcrypt.hash(`walk-in-${Date.now()}`, 10);
    return this.create({
      fullName: 'بيع مباشر',
      shopName: 'بيع مباشر — المحل',
      phone,
      city: '—',
      address: 'نقطة البيع بالمحل',
      commercialRegPhotoUrl: '/uploads/walk-in-placeholder.png',
      passwordHash,
      role: UserRole.SHOP_OWNER,
      status: UserStatus.APPROVED,
    });
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
    if (data.locationLat !== undefined) {
      user.locationLat =
        data.locationLat === null ? undefined : Number(data.locationLat);
    }
    if (data.locationLng !== undefined) {
      user.locationLng =
        data.locationLng === null ? undefined : Number(data.locationLng);
    }
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
    if (data.shopDiscountPercent !== undefined) {
      const n = Number(data.shopDiscountPercent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new BadRequestException(
          'shopDiscountPercent must be between 0 and 100',
        );
      }
      user.shopDiscountPercent = Math.round(n * 100) / 100;
    }

    return user.save();
  }

  /** Shop-only discount percent; 0 for non-shop / missing users. */
  async getShopDiscountPercent(userId: string): Promise<number> {
    if (!Types.ObjectId.isValid(userId)) return 0;
    const user = await this.userModel
      .findById(userId)
      .select('role shopDiscountPercent')
      .lean()
      .exec();
    if (!user || user.role !== UserRole.SHOP_OWNER) return 0;
    const n = Number(user.shopDiscountPercent ?? 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(100, Math.round(n * 100) / 100);
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
    role?: string,
    status?: UserStatus,
    page?: number,
    limit?: number,
    q?: string,
    roleId?: string,
  ): Promise<PaginatedResult<UserDocument>> {
    const p = normalizePagination(page, limit, 20);
    const adminCodes = await this.rolesService.getAdminPanelCodes();
    const codes =
      adminCodes.length > 0 ? adminCodes : (ADMIN_PANEL_ROLES as string[]);

    const filter: Record<string, unknown> = {};
    if (roleId && Types.ObjectId.isValid(roleId)) {
      filter['roleId'] = new Types.ObjectId(roleId);
    } else if (role) {
      filter['role'] = role;
    } else {
      filter['role'] = { $in: codes };
    }

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
    const adminCodes = await this.rolesService.getAdminPanelCodes();
    const codes =
      adminCodes.length > 0 ? adminCodes : (ADMIN_PANEL_ROLES as string[]);
    let query = this.userModel.findOne({
      _id: id,
      role: { $in: codes },
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
    if (data.roleId !== undefined || data.role !== undefined) {
      const resolved = await this.resolveRoleAssignment({
        role: data.role,
        roleId: data.roleId,
      });
      user.role = resolved.code;
      user.roleId = resolved.id;
    }
    if (data.status !== undefined) {
      user.status = data.status;
      user.rejectionReason = undefined;
    }

    return user.save();
  }

  async removeStaff(id: string): Promise<void> {
    const adminCodes = await this.rolesService.getAdminPanelCodes();
    const codes =
      adminCodes.length > 0 ? adminCodes : (ADMIN_PANEL_ROLES as string[]);
    const res = await this.userModel
      .deleteOne({ _id: id, role: { $in: codes } })
      .exec();
    if (!res.deletedCount) {
      throw new NotFoundException('Staff user not found');
    }
  }

  /**
   * Apply a known system role by code (e.g. branch manager assignment).
   * Syncs both role code and roleId.
   */
  async assignSystemRole(
    user: UserDocument,
    code: UserRole,
  ): Promise<UserDocument> {
    const role = await this.rolesService.findByCodeOrFail(code);
    user.role = role.code as UserRole;
    user.roleId = role._id as Types.ObjectId;
    return user.save();
  }

  private async resolveRoleAssignment(input: {
    role?: string;
    roleId?: string;
  }): Promise<{ code: string; id: Types.ObjectId }> {
    if (input.roleId) {
      if (!Types.ObjectId.isValid(input.roleId)) {
        throw new BadRequestException('Invalid roleId');
      }
      const role = await this.rolesService.findByIdOrFail(input.roleId);
      if (!role.isActive) {
        throw new BadRequestException('Role is inactive');
      }
      return { code: role.code, id: role._id as Types.ObjectId };
    }
    const code = (input.role ?? UserRole.SHOP_OWNER).toString().toUpperCase();
    const role = await this.rolesService.findByCode(code);
    if (!role) {
      throw new BadRequestException(`Unknown role: ${code}`);
    }
    if (!role.isActive) {
      throw new BadRequestException('Role is inactive');
    }
    return { code: role.code, id: role._id as Types.ObjectId };
  }

  /** Resolve approved shop by Mongo id or customerApp.slug. */
  async findApprovedShopByKey(shopKey: string): Promise<UserDocument> {
    const key = shopKey?.trim();
    if (!key) throw new NotFoundException('Shop not found');

    let shop: UserDocument | null = null;
    if (Types.ObjectId.isValid(key)) {
      shop = await this.userModel
        .findOne({
          _id: new Types.ObjectId(key),
          role: UserRole.SHOP_OWNER,
          status: UserStatus.APPROVED,
        })
        .exec();
    }
    if (!shop) {
      shop = await this.userModel
        .findOne({
          role: UserRole.SHOP_OWNER,
          status: UserStatus.APPROVED,
          'customerApp.slug': key.toLowerCase(),
        })
        .exec();
    }
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  getCustomerAppView(shop: UserDocument): Record<string, unknown> {
    const app = shop.customerApp ?? ({} as User['customerApp']);
    const enabled = app.enabled !== false;
    const displayName =
      (app.displayName || '').trim() || shop.shopName || shop.fullName;
    const logoUrl =
      typeof app.logoUrl === 'string' && app.logoUrl
        ? absoluteMediaUrl(app.logoUrl)
        : '';
    const faviconUrl =
      typeof app.faviconUrl === 'string' && app.faviconUrl
        ? absoluteMediaUrl(app.faviconUrl)
        : logoUrl;
    return {
      shopId: String(shop._id),
      shopName: shop.shopName,
      city: shop.city,
      address: shop.address,
      enabled,
      displayName,
      tagline: (app.tagline || '').trim() || 'تتبع وإصلاح الأجهزة',
      slug: (app.slug || '').trim(),
      accentColor: app.accentColor || '#10b880',
      accentStrongColor: app.accentStrongColor || '#0d9a6a',
      brandColor: app.brandColor || '#0f172a',
      logoUrl,
      faviconUrl,
      // Convenience aliases matching platform branding shape
      appName: displayName,
    };
  }

  async getOwnCustomerApp(shopId: string): Promise<Record<string, unknown>> {
    const shop = await this.findShopByIdOrFail(shopId);
    return this.getCustomerAppView(shop);
  }

  async getPublicCustomerApp(shopKey: string): Promise<Record<string, unknown>> {
    const shop = await this.findApprovedShopByKey(shopKey);
    const view = this.getCustomerAppView(shop);
    if (view.enabled === false) {
      throw new NotFoundException('Shop customer app is not enabled');
    }
    return view;
  }

  async updateOwnCustomerApp(
    shopId: string,
    data: {
      enabled?: boolean;
      displayName?: string;
      tagline?: string;
      slug?: string;
      accentColor?: string;
      accentStrongColor?: string;
      brandColor?: string;
    },
  ): Promise<Record<string, unknown>> {
    const shop = await this.findShopByIdOrFail(shopId);
    if (!shop.customerApp) {
      shop.customerApp = {
        enabled: true,
        displayName: '',
        tagline: '',
        slug: '',
        accentColor: '#10b880',
        accentStrongColor: '#0d9a6a',
        brandColor: '#0f172a',
        logoUrl: '',
        faviconUrl: '',
      };
    }
    const app = shop.customerApp;

    if (data.enabled !== undefined) app.enabled = data.enabled;
    if (data.displayName !== undefined) {
      app.displayName = data.displayName.trim();
    }
    if (data.tagline !== undefined) app.tagline = data.tagline.trim();
    if (data.accentColor !== undefined) {
      app.accentColor = data.accentColor.toLowerCase();
    }
    if (data.accentStrongColor !== undefined) {
      app.accentStrongColor = data.accentStrongColor.toLowerCase();
    }
    if (data.brandColor !== undefined) {
      app.brandColor = data.brandColor.toLowerCase();
    }
    if (data.slug !== undefined) {
      const slug = data.slug.trim().toLowerCase();
      if (slug) {
        const taken = await this.userModel
          .exists({
            'customerApp.slug': slug,
            _id: { $ne: shop._id },
          })
          .exec();
        if (taken) {
          throw new ConflictException('هذا الرابط القصير مستخدم بالفعل');
        }
      }
      app.slug = slug;
    }

    shop.markModified('customerApp');
    await shop.save();
    return this.getCustomerAppView(shop);
  }

  async setOwnCustomerAppLogo(
    shopId: string,
    relativePath: string,
  ): Promise<Record<string, unknown>> {
    const shop = await this.findShopByIdOrFail(shopId);
    if (!shop.customerApp) {
      shop.customerApp = {
        enabled: true,
        displayName: '',
        tagline: '',
        slug: '',
        accentColor: '#10b880',
        accentStrongColor: '#0d9a6a',
        brandColor: '#0f172a',
        logoUrl: '',
        faviconUrl: '',
      };
    }
    shop.customerApp.logoUrl = relativePath;
    if (!shop.customerApp.faviconUrl) {
      shop.customerApp.faviconUrl = relativePath;
    }
    shop.markModified('customerApp');
    await shop.save();
    return this.getCustomerAppView(shop);
  }
}
