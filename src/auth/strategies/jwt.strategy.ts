import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  UserRole,
  isAdminPanelRole,
} from '../../common/enums/user.enums';
import { RolesService } from '../../roles/roles.service';
import { UsersService } from '../../users/users.service';
import { AuthUser } from '../guards/roles.guard';

type JwtPayload = {
  sub: string;
  phone: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'qet3etak-dev-secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
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
      status: user.status,
      shopName: user.shopName,
      fullName: user.fullName,
      branchId: user.branchId ? String(user.branchId) : undefined,
    };
  }
}
