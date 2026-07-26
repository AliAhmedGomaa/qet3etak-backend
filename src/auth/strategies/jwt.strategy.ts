import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  UserRole,
  UserStatus,
  isAdminPanelRole,
} from '../../common/enums/user.enums';
import { EMPLOYEE_ROLE, EmployeeStatus } from '../../common/enums/hr.enums';
import {
  DELIVERY_ROLE,
  DeliveryGuyStatus,
} from '../../common/enums/delivery.enums';
import { DeliveryGuy } from '../../delivery/schemas/delivery-guy.schema';
import { Employee } from '../../hr/schemas/employee.schema';
import { RolesService } from '../../roles/roles.service';
import { UsersService } from '../../users/users.service';
import { AuthUser } from '../guards/roles.guard';

type JwtPayload = {
  sub: string;
  phone: string;
  kind?: 'user' | 'employee' | 'delivery';
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
    @InjectModel(DeliveryGuy.name)
    private readonly deliveryGuyModel: Model<DeliveryGuy>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'qet3etak-dev-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.kind === 'employee') {
      const emp = await this.employeeModel.findById(payload.sub).exec();
      if (!emp) {
        throw new UnauthorizedException('Employee no longer exists');
      }
      if (emp.status === EmployeeStatus.TERMINATED) {
        throw new UnauthorizedException('Employee account is terminated');
      }
      return {
        userId: String(emp._id),
        phone: emp.phone,
        role: EMPLOYEE_ROLE,
        status: emp.status,
        fullName: emp.fullName,
        kind: 'employee',
      };
    }

    if (payload.kind === 'delivery') {
      const guy = await this.deliveryGuyModel.findById(payload.sub).exec();
      if (!guy) {
        throw new UnauthorizedException('Delivery guy no longer exists');
      }
      if (guy.status !== DeliveryGuyStatus.ACTIVE) {
        throw new UnauthorizedException('Delivery account is inactive');
      }
      return {
        userId: String(guy._id),
        phone: guy.phone,
        role: DELIVERY_ROLE,
        status: guy.status,
        fullName: guy.fullName,
        kind: 'delivery',
      };
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const roleDoc = await this.rolesService.resolveForUser(user);
    const roleCode = (roleDoc?.code ?? user.role ?? UserRole.SHOP_OWNER) as string;
    const adminPanel =
      roleDoc?.adminPanel ?? isAdminPanelRole(roleCode);

    return {
      userId: String(user._id),
      phone: user.phone,
      role: roleCode as UserRole,
      roleId: roleDoc ? String(roleDoc._id) : user.roleId ? String(user.roleId) : undefined,
      adminPanel,
      status: user.status as UserStatus,
      shopName: user.shopName,
      fullName: user.fullName,
      branchId: user.branchId ? String(user.branchId) : undefined,
      kind: 'user',
      permissions: roleDoc?.permissions ?? [],
    };
  }
}
