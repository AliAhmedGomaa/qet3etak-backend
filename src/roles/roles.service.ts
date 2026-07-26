import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../common/enums/user.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { User, UserDocument } from '../users/schemas/user.schema';
import { SYSTEM_ROLE_SEEDS } from './role.definitions';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { Role, RoleDocument } from './schemas/role.schema';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  isLegacyPermissionSet,
} from '../common/permissions';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);
  private codeCache: Map<string, RoleDocument> = new Map();
  private idCache: Map<string, RoleDocument> = new Map();

  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemRoles();
    await this.migrateUsersToRoleIds();
    await this.refreshCache();
  }

  async ensureSystemRoles(): Promise<void> {
    for (const seed of SYSTEM_ROLE_SEEDS) {
      const existing = await this.roleModel.findOne({ code: seed.code }).exec();
      if (!existing) {
        await this.roleModel.create({
          code: seed.code,
          name: seed.name,
          description: seed.description,
          adminPanel: seed.adminPanel,
          permissions: seed.permissions,
          isSystem: true,
          isActive: true,
        });
        continue;
      }
      // Keep admin-customized permissions; only upgrade legacy minimal sets.
      const nextPerms = isLegacyPermissionSet(existing.permissions)
        ? seed.permissions
        : existing.permissions;
      existing.name = seed.name;
      existing.description = seed.description;
      existing.adminPanel = seed.adminPanel;
      existing.permissions = nextPerms;
      existing.isSystem = true;
      existing.isActive = true;
      await existing.save();
    }
    this.logger.log(`Ensured ${SYSTEM_ROLE_SEEDS.length} system roles`);
  }

  permissionCatalog() {
    return {
      items: PERMISSION_CATALOG,
      keys: ALL_PERMISSION_KEYS,
    };
  }

  /**
   * Backfill roleId on users that only have a role code string.
   * Also syncs role code from Role when roleId is set but code drifted.
   */
  async migrateUsersToRoleIds(): Promise<void> {
    const roles = await this.roleModel.find().exec();
    const byCode = new Map(roles.map((r) => [r.code, r]));

    const missingRoleId = await this.userModel
      .find({
        $or: [{ roleId: { $exists: false } }, { roleId: null }],
      })
      .exec();

    let linked = 0;
    for (const user of missingRoleId) {
      const code = (user.role as string) || UserRole.SHOP_OWNER;
      const role = byCode.get(code) ?? byCode.get(UserRole.SHOP_OWNER);
      if (!role) continue;
      user.roleId = role._id as Types.ObjectId;
      user.role = role.code as UserRole;
      await user.save();
      linked += 1;
    }

    // Sync denormalized code from roleId when present
    const withRoleId = await this.userModel
      .find({ roleId: { $exists: true, $ne: null } })
      .exec();
    let synced = 0;
    for (const user of withRoleId) {
      if (!user.roleId) continue;
      const role =
        byCode.get(String(user.role)) ??
        roles.find((r) => String(r._id) === String(user.roleId));
      if (!role) continue;
      if (String(user.roleId) !== String(role._id) && byCode.has(String(user.role))) {
        // Prefer matching by current code if roleId points elsewhere inconsistently
        const byCurrent = byCode.get(String(user.role));
        if (byCurrent && String(user.roleId) !== String(byCurrent._id)) {
          user.roleId = byCurrent._id as Types.ObjectId;
          synced += 1;
          await user.save();
          continue;
        }
      }
      if (user.role !== (role.code as UserRole)) {
        user.role = role.code as UserRole;
        synced += 1;
        await user.save();
      }
    }

    if (linked || synced) {
      this.logger.log(
        `Migrated users → roleId: linked=${linked}, synced=${synced}`,
      );
    }
  }

  async refreshCache(): Promise<void> {
    const roles = await this.roleModel.find().exec();
    this.codeCache = new Map(roles.map((r) => [r.code, r]));
    this.idCache = new Map(roles.map((r) => [String(r._id), r]));
  }

  findByCode(code: string): Promise<RoleDocument | null> {
    const cached = this.codeCache.get(code.toUpperCase());
    if (cached) return Promise.resolve(cached);
    return this.roleModel.findOne({ code: code.toUpperCase() }).exec();
  }

  async findByCodeOrFail(code: string): Promise<RoleDocument> {
    const role = await this.findByCode(code);
    if (!role) throw new NotFoundException(`Role ${code} not found`);
    return role;
  }

  findById(id: string): Promise<RoleDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    const cached = this.idCache.get(id);
    if (cached) return Promise.resolve(cached);
    return this.roleModel.findById(id).exec();
  }

  async findByIdOrFail(id: string): Promise<RoleDocument> {
    const role = await this.findById(id);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  /** Codes that may access the admin panel (active roles). */
  async getAdminPanelCodes(): Promise<string[]> {
    const roles = await this.roleModel
      .find({ adminPanel: true, isActive: true })
      .select('code')
      .exec();
    return roles.map((r) => r.code);
  }

  async list(
    page?: number,
    limit?: number,
    q?: string,
    opts?: { adminPanelOnly?: boolean; includeInactive?: boolean },
  ): Promise<PaginatedResult<RoleDocument>> {
    const p = normalizePagination(page, limit, 50);
    const filter: Record<string, unknown> = {};
    if (!opts?.includeInactive) filter['isActive'] = true;
    if (opts?.adminPanelOnly) filter['adminPanel'] = true;
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [{ name: rx }, { code: rx }, { description: rx }];
    }
    const [items, total] = await Promise.all([
      this.roleModel
        .find(filter)
        .sort({ isSystem: -1, code: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.roleModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(items, total, p.page, p.limit);
  }

  /** Flat list for dropdowns (all active roles, or admin-panel only). */
  async listAll(opts?: {
    adminPanelOnly?: boolean;
    includeInactive?: boolean;
  }): Promise<RoleDocument[]> {
    const filter: Record<string, unknown> = {};
    if (!opts?.includeInactive) filter['isActive'] = true;
    if (opts?.adminPanelOnly) filter['adminPanel'] = true;
    return this.roleModel.find(filter).sort({ isSystem: -1, code: 1 }).exec();
  }

  async create(dto: CreateRoleDto): Promise<RoleDocument> {
    const code = dto.code.trim().toUpperCase();
    if (Object.values(UserRole).includes(code as UserRole)) {
      throw new BadRequestException(
        `Code ${code} is reserved for a system role`,
      );
    }
    const exists = await this.roleModel.exists({ code }).exec();
    if (exists) {
      throw new ConflictException(`Role code ${code} already exists`);
    }

    const role = await this.roleModel.create({
      name: dto.name.trim(),
      code,
      description: dto.description?.trim() ?? '',
      permissions: dto.permissions ?? ['admin.panel'],
      adminPanel: dto.adminPanel ?? true,
      isSystem: false,
      isActive: dto.isActive ?? true,
    });
    await this.refreshCache();
    return role;
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.findByIdOrFail(id);

    if (dto.code !== undefined) {
      const nextCode = dto.code.trim().toUpperCase();
      if (role.isSystem) {
        throw new BadRequestException('Cannot change code of a system role');
      }
      if (nextCode !== role.code) {
        if (Object.values(UserRole).includes(nextCode as UserRole)) {
          throw new BadRequestException(
            `Code ${nextCode} is reserved for a system role`,
          );
        }
        const exists = await this.roleModel
          .exists({ code: nextCode, _id: { $ne: role._id } })
          .exec();
        if (exists) {
          throw new ConflictException(`Role code ${nextCode} already exists`);
        }
        const oldCode = role.code;
        role.code = nextCode;
        // Keep denormalized user.role in sync
        await this.userModel
          .updateMany({ roleId: role._id }, { $set: { role: nextCode } })
          .exec();
        this.logger.log(`Renamed role ${oldCode} → ${nextCode}`);
      }
    }

    if (dto.name !== undefined) role.name = dto.name.trim();
    if (dto.description !== undefined) {
      role.description = dto.description.trim();
    }
    if (dto.permissions !== undefined) role.permissions = dto.permissions;
    if (dto.adminPanel !== undefined) {
      if (role.code === UserRole.SHOP_OWNER && dto.adminPanel) {
        throw new BadRequestException(
          'SHOP_OWNER cannot be granted admin panel access',
        );
      }
      if (
        role.isSystem &&
        role.adminPanel &&
        dto.adminPanel === false &&
        role.code !== UserRole.SHOP_OWNER
      ) {
        throw new BadRequestException(
          'Cannot disable admin panel on a system admin role',
        );
      }
      role.adminPanel = dto.adminPanel;
    }
    if (dto.isActive !== undefined) {
      if (role.isSystem && dto.isActive === false) {
        throw new BadRequestException('Cannot deactivate a system role');
      }
      role.isActive = dto.isActive;
    }

    await role.save();
    await this.refreshCache();
    return role;
  }

  async remove(id: string): Promise<void> {
    const role = await this.findByIdOrFail(id);
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete a system role');
    }
    const inUse = await this.userModel.countDocuments({ roleId: role._id }).exec();
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete role in use by ${inUse} user(s)`,
      );
    }
    await this.roleModel.deleteOne({ _id: role._id }).exec();
    await this.refreshCache();
  }

  toView(role: RoleDocument) {
    const json = role.toJSON() as unknown as Record<string, unknown>;
    return {
      id: json.id,
      name: json.name,
      code: json.code,
      description: json.description ?? '',
      permissions: json.permissions ?? [],
      adminPanel: !!json.adminPanel,
      isSystem: !!json.isSystem,
      isActive: json.isActive !== false,
      createdAt: json.createdAt,
      updatedAt: json.updatedAt,
      // Back-compat aliases for older admin UI
      role: json.code,
      labelAr: json.name,
      labelEn: json.code,
      descriptionAr: json.description ?? '',
      canAccessAdmin: !!json.adminPanel,
    };
  }

  /**
   * Resolve role document for a user (by roleId, then by role code).
   */
  async resolveForUser(
    user: Pick<UserDocument, 'role' | 'roleId'>,
  ): Promise<RoleDocument | null> {
    if (user.roleId) {
      const byId = await this.findById(String(user.roleId));
      if (byId) return byId;
    }
    if (user.role) {
      return this.findByCode(String(user.role));
    }
    return null;
  }
}
