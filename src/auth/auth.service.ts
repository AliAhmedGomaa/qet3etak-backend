import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import {
  UserRole,
  UserStatus,
  isAdminPanelRole,
} from '../common/enums/user.enums';
import { EMPLOYEE_ROLE } from '../common/enums/hr.enums';
import { DELIVERY_ROLE } from '../common/enums/delivery.enums';
import { absoluteMediaUrl } from '../common/media-url';
import { BranchesService } from '../branches/branches.service';
import { DeliveryGuy } from '../delivery/schemas/delivery-guy.schema';
import { Employee } from '../hr/schemas/employee.schema';
import { RolesService } from '../roles/roles.service';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { DeliveryLoginDto, LoginDto } from './dto/login.dto';
import { RegisterShopDto } from './dto/register-shop.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly jwtService: JwtService,
    private readonly branchesService: BranchesService,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
    @InjectModel(DeliveryGuy.name)
    private readonly deliveryGuyModel: Model<DeliveryGuy>,
  ) {}

  async registerShop(
    dto: RegisterShopDto,
    photoFilename?: string,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const existing = await this.usersService.findByPhone(dto.phone.trim());
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const photoUrl =
      photoFilename != null
        ? `/uploads/${photoFilename}`
        : dto.commercialRegPhotoUrl?.trim();

    if (!photoUrl) {
      throw new BadRequestException(
        'Business card / commercial registration photo is required',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const lat = dto.locationLat != null ? Number(dto.locationLat) : undefined;
    const lng = dto.locationLng != null ? Number(dto.locationLng) : undefined;
    const user = await this.usersService.create({
      fullName: dto.fullName.trim(),
      shopName: dto.shopName.trim(),
      phone: dto.phone.trim(),
      city: dto.city.trim(),
      address: dto.address.trim(),
      ...(Number.isFinite(lat) && Number.isFinite(lng)
        ? { locationLat: lat, locationLng: lng }
        : {}),
      commercialRegPhotoUrl: photoUrl,
      passwordHash,
      role: UserRole.SHOP_OWNER,
      status: UserStatus.PENDING_VERIFICATION,
    });

    return this.tokenResponse(user);
  }

  async updateShopProfile(
    shopUserId: string,
    dto: {
      city?: string;
      address?: string;
      locationLat?: number;
      locationLng?: number;
    },
  ): Promise<Record<string, unknown>> {
    const lat = dto.locationLat != null ? Number(dto.locationLat) : undefined;
    const lng = dto.locationLng != null ? Number(dto.locationLng) : undefined;
    if (
      (lat != null && !Number.isFinite(lat)) ||
      (lng != null && !Number.isFinite(lng))
    ) {
      throw new BadRequestException('Invalid location coordinates');
    }
    if ((lat != null) !== (lng != null)) {
      throw new BadRequestException('Both latitude and longitude are required');
    }
    const user = await this.usersService.updateShop(shopUserId, {
      city: dto.city,
      address: dto.address,
      ...(lat != null && lng != null
        ? { locationLat: lat, locationLng: lng }
        : {}),
    });
    return this.toUserView(user);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const user = await this.usersService.findByPhoneWithPassword(
      dto.phone.trim(),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    return this.tokenResponse(user);
  }

  async loginEmployee(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const emp = await this.employeeModel
      .findOne({ phone: dto.phone.trim() })
      .select('+passwordHash')
      .exec();
    if (!emp?.passwordHash) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const ok = await bcrypt.compare(dto.password, emp.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const payload = {
      sub: String(emp._id),
      phone: emp.phone,
      kind: 'employee' as const,
    };
    const accessToken = this.jwtService.sign(payload);
    const json = emp.toJSON() as unknown as Record<string, unknown>;
    return {
      accessToken,
      user: {
        ...json,
        role: EMPLOYEE_ROLE,
        kind: 'employee',
      },
    };
  }

  async employeeMe(employeeId: string): Promise<Record<string, unknown>> {
    const emp = await this.employeeModel.findById(employeeId).exec();
    if (!emp) throw new UnauthorizedException('Employee no longer exists');
    const json = emp.toJSON() as unknown as Record<string, unknown>;
    return { ...json, role: EMPLOYEE_ROLE, kind: 'employee' };
  }

  async loginDelivery(
    dto: DeliveryLoginDto,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const guy = await this.deliveryGuyModel
      .findOne({ phone: dto.phone.trim() })
      .select('+passwordHash')
      .exec();
    if (!guy?.passwordHash) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const ok = await bcrypt.compare(dto.password, guy.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    // Geofence: courier may only log in inside an admin workplace.
    const workplace = await this.branchesService.assertInsideWorkplace(
      Number(dto.lat),
      Number(dto.lng),
    );

    const payload = {
      sub: String(guy._id),
      phone: guy.phone,
      kind: 'delivery' as const,
    };
    const accessToken = this.jwtService.sign(payload);
    const json = guy.toJSON() as unknown as Record<string, unknown>;
    return {
      accessToken,
      user: {
        ...json,
        role: DELIVERY_ROLE,
        kind: 'delivery',
        workplaceBranchId: workplace.branchId,
        workplaceBranchName: workplace.branchName,
      },
    };
  }

  async deliveryMe(deliveryGuyId: string): Promise<Record<string, unknown>> {
    const guy = await this.deliveryGuyModel.findById(deliveryGuyId).exec();
    if (!guy) throw new UnauthorizedException('Delivery guy no longer exists');
    const json = guy.toJSON() as unknown as Record<string, unknown>;
    return { ...json, role: DELIVERY_ROLE, kind: 'delivery' };
  }

  async me(userId: string): Promise<Record<string, unknown>> {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.toUserView(user);
  }

  private async tokenResponse(user: UserDocument): Promise<{
    accessToken: string;
    user: Record<string, unknown>;
  }> {
    const payload = {
      sub: String(user._id),
      phone: user.phone,
      kind: 'user' as const,
    };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: await this.toUserView(user),
    };
  }

  private async toUserView(
    user: UserDocument,
  ): Promise<Record<string, unknown>> {
    const json = user.toJSON() as unknown as Record<string, unknown>;
    const roleDoc = await this.rolesService.resolveForUser(user);
    const roleCode = (roleDoc?.code ?? user.role ?? UserRole.SHOP_OWNER) as string;
    const adminPanel =
      roleDoc?.adminPanel ?? isAdminPanelRole(roleCode);
    return {
      ...json,
      role: roleCode,
      roleId: roleDoc ? String(roleDoc._id) : json.roleId ?? null,
      adminPanel,
      roleName: roleDoc?.name ?? roleCode,
      permissions: roleDoc?.permissions ?? [],
      commercialRegPhotoUrl: absoluteMediaUrl(
        typeof json.commercialRegPhotoUrl === 'string'
          ? json.commercialRegPhotoUrl
          : '',
      ),
    };
  }
}
