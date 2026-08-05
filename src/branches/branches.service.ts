import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BranchStatus } from '../common/enums/branch.enums';
import {
  ADMIN_PANEL_ROLES,
  UserRole,
  UserStatus,
} from '../common/enums/user.enums';
import { distanceMeters, isWithinRadius } from '../common/geo';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { RolesService } from '../roles/roles.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AssignBranchManagerDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './dto/branch.dto';
import { Branch, BranchDocument } from './schemas/branch.schema';

export type GeofenceMatch = {
  branchId: string;
  branchName: string;
  distanceMeters: number;
};

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly rolesService: RolesService,
  ) {}

  async create(dto: CreateBranchDto): Promise<Record<string, unknown>> {
    const code = this.normalizeCode(dto.code);
    await this.assertCodeUnique(code);
    this.assertGeofenceFields(dto);
    const branch = await this.branchModel.create({
      name: dto.name.trim(),
      code,
      city: dto.city.trim(),
      address: dto.address.trim(),
      phone: dto.phone?.trim() || '',
      notes: dto.notes?.trim() || '',
      status: dto.status ?? BranchStatus.ACTIVE,
      ...this.geofencePayload(dto),
    });
    return this.toView(branch);
  }

  async list(
    page?: number,
    limit?: number,
    q?: string,
    status?: BranchStatus,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter: Record<string, unknown> = {};
    if (status) filter['status'] = status;
    if (q?.trim()) {
      const rx = new RegExp(
        q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter['$or'] = [
        { name: rx },
        { code: rx },
        { city: rx },
        { address: rx },
        { phone: rx },
      ];
    }
    const [items, total] = await Promise.all([
      this.branchModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.branchModel.countDocuments(filter).exec(),
    ]);
    const views = await Promise.all(items.map((b) => this.toView(b)));
    return paginatedResult(views, total, p.page, p.limit);
  }

  async listActiveOptions(): Promise<
    Array<{ id: string; name: string; code: string; city: string }>
  > {
    const items = await this.branchModel
      .find({ status: BranchStatus.ACTIVE })
      .sort({ name: 1 })
      .select('name code city')
      .exec();
    return items.map((b) => ({
      id: String(b._id),
      name: b.name,
      code: b.code,
      city: b.city,
    }));
  }

  async getById(id: string): Promise<Record<string, unknown>> {
    const branch = await this.findByIdOrFail(id);
    return this.toView(branch);
  }

  async update(
    id: string,
    dto: UpdateBranchDto,
  ): Promise<Record<string, unknown>> {
    const branch = await this.findByIdOrFail(id);
    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      if (code !== branch.code) {
        await this.assertCodeUnique(code, id);
        branch.code = code;
      }
    }
    if (dto.name !== undefined) branch.name = dto.name.trim();
    if (dto.city !== undefined) branch.city = dto.city.trim();
    if (dto.address !== undefined) branch.address = dto.address.trim();
    if (dto.phone !== undefined) branch.phone = dto.phone.trim();
    if (dto.notes !== undefined) branch.notes = dto.notes.trim();
    if (dto.status !== undefined) branch.status = dto.status;
    this.applyGeofenceUpdate(branch, dto);
    await branch.save();
    return this.toView(branch);
  }

  /**
   * Assert the given GPS point is inside at least one active branch geofence.
   * Throws ForbiddenException with an Arabic message when not allowed.
   */
  async assertInsideWorkplace(lat: number, lng: number): Promise<GeofenceMatch> {
    const branches = await this.branchModel
      .find({
        status: BranchStatus.ACTIVE,
        geofenceLat: { $type: 'number' },
        geofenceLng: { $type: 'number' },
        geofenceRadiusMeters: { $gt: 0 },
      } as Record<string, unknown>)
      .exec();

    if (branches.length === 0) {
      throw new ForbiddenException(
        'لم يتم ضبط نطاق موقع العمل بعد. تواصل مع الإدارة.',
      );
    }

    let best: GeofenceMatch | null = null;
    for (const branch of branches) {
      const center = {
        lat: Number(branch.geofenceLat),
        lng: Number(branch.geofenceLng),
      };
      const radius = Number(branch.geofenceRadiusMeters);
      if (!isWithinRadius({ lat, lng }, center, radius)) {
        continue;
      }
      const match: GeofenceMatch = {
        branchId: String(branch._id),
        branchName: branch.name,
        distanceMeters: distanceMeters(lat, lng, center.lat, center.lng),
      };
      if (!best || match.distanceMeters < best.distanceMeters) {
        best = match;
      }
    }

    if (!best) {
      throw new ForbiddenException(
        'يجب أن تكون داخل نطاق موقع العمل لتسجيل الدخول',
      );
    }
    return best;
  }

  private assertGeofenceFields(
    dto: Pick<
      CreateBranchDto,
      'geofenceLat' | 'geofenceLng' | 'geofenceRadiusMeters'
    >,
  ): void {
    const hasAny =
      dto.geofenceLat !== undefined ||
      dto.geofenceLng !== undefined ||
      dto.geofenceRadiusMeters !== undefined;
    if (!hasAny) return;
    if (
      dto.geofenceLat === undefined ||
      dto.geofenceLng === undefined ||
      dto.geofenceRadiusMeters === undefined
    ) {
      throw new BadRequestException(
        'Geofence requires geofenceLat, geofenceLng, and geofenceRadiusMeters together',
      );
    }
  }

  private geofencePayload(
    dto: Pick<
      CreateBranchDto,
      'geofenceLat' | 'geofenceLng' | 'geofenceRadiusMeters'
    >,
  ): Partial<Branch> {
    if (
      dto.geofenceLat === undefined ||
      dto.geofenceLng === undefined ||
      dto.geofenceRadiusMeters === undefined
    ) {
      return {};
    }
    return {
      geofenceLat: dto.geofenceLat,
      geofenceLng: dto.geofenceLng,
      geofenceRadiusMeters: dto.geofenceRadiusMeters,
    };
  }

  private applyGeofenceUpdate(branch: BranchDocument, dto: UpdateBranchDto): void {
    const touching =
      dto.geofenceLat !== undefined ||
      dto.geofenceLng !== undefined ||
      dto.geofenceRadiusMeters !== undefined;
    if (!touching) return;

    const nextLat =
      dto.geofenceLat !== undefined ? dto.geofenceLat : branch.geofenceLat;
    const nextLng =
      dto.geofenceLng !== undefined ? dto.geofenceLng : branch.geofenceLng;
    const nextRadius =
      dto.geofenceRadiusMeters !== undefined
        ? dto.geofenceRadiusMeters
        : branch.geofenceRadiusMeters;

    if (
      nextLat === undefined ||
      nextLng === undefined ||
      nextRadius === undefined
    ) {
      throw new BadRequestException(
        'Geofence requires geofenceLat, geofenceLng, and geofenceRadiusMeters together',
      );
    }
    branch.geofenceLat = nextLat;
    branch.geofenceLng = nextLng;
    branch.geofenceRadiusMeters = nextRadius;
  }

  async assignManager(
    id: string,
    dto: AssignBranchManagerDto,
  ): Promise<Record<string, unknown>> {
    const branch = await this.findByIdOrFail(id);
    const nextUserId =
      dto.userId === undefined || dto.userId === null || dto.userId === ''
        ? null
        : dto.userId;

    const previousManagerId = branch.managerUserId
      ? String(branch.managerUserId)
      : null;

    if (nextUserId === previousManagerId) {
      return this.toView(branch);
    }

    if (nextUserId) {
      const staff = await this.findAssignableStaffOrFail(nextUserId);
      // Clear this user from any other branch they manage
      await this.branchModel
        .updateMany(
          {
            managerUserId: staff._id,
            _id: { $ne: branch._id },
          },
          { $unset: { managerUserId: 1 } },
        )
        .exec();

      branch.managerUserId = staff._id as Types.ObjectId;
      await branch.save();

      staff.branchId = branch._id as Types.ObjectId;
      if (staff.role !== UserRole.ADMIN) {
        const bmRole = await this.rolesService.findByCodeOrFail(
          UserRole.BRANCH_MANAGER,
        );
        staff.role = bmRole.code as UserRole;
        staff.roleId = bmRole._id as Types.ObjectId;
      }
      await staff.save();
    } else {
      branch.managerUserId = undefined;
      await branch.save();
    }

    if (previousManagerId && previousManagerId !== nextUserId) {
      await this.clearManagerAssignment(previousManagerId, String(branch._id));
    }

    return this.toView(branch);
  }

  async findByIdOrFail(id: string): Promise<BranchDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Branch not found');
    }
    const branch = await this.branchModel.findById(id).exec();
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  private async clearManagerAssignment(
    userId: string,
    branchId: string,
  ): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) return;
    if (user.branchId && String(user.branchId) === branchId) {
      user.branchId = undefined;
    }
    if (user.role === UserRole.BRANCH_MANAGER) {
      const staffRole = await this.rolesService.findByCodeOrFail(UserRole.STAFF);
      user.role = staffRole.code as UserRole;
      user.roleId = staffRole._id as Types.ObjectId;
    }
    await user.save();
  }

  private async findAssignableStaffOrFail(
    userId: string,
  ): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userModel
      .findOne({
        _id: userId,
        role: { $in: ADMIN_PANEL_ROLES },
      })
      .exec();
    if (!user) {
      throw new BadRequestException(
        'Manager must be an admin-panel staff user (not a shop owner)',
      );
    }
    if (user.status !== UserStatus.APPROVED) {
      throw new BadRequestException('Manager must be an active staff user');
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Cannot assign a super ADMIN as a branch manager',
      );
    }
    return user;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private async assertCodeUnique(code: string, excludeId?: string) {
    const filter: Record<string, unknown> = { code };
    if (excludeId) filter['_id'] = { $ne: excludeId };
    const exists = await this.branchModel.exists(filter).exec();
    if (exists) {
      throw new ConflictException(`Branch code "${code}" already exists`);
    }
  }

  private async toView(branch: BranchDocument): Promise<Record<string, unknown>> {
    const json = branch.toJSON() as unknown as Record<string, unknown>;
    let manager: Record<string, unknown> | null = null;
    if (branch.managerUserId) {
      const user = await this.userModel
        .findById(branch.managerUserId)
        .select('fullName phone role status')
        .exec();
      if (user) {
        manager = {
          id: String(user._id),
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          status: user.status,
        };
      }
    }
    return {
      ...json,
      managerUserId: branch.managerUserId
        ? String(branch.managerUserId)
        : null,
      manager,
    };
  }
}
