import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '../../common/enums/user.enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { REQUIRE_APPROVED_KEY } from '../decorators/require-approved.decorator';

export type AuthUser = {
  userId: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  shopName?: string;
  fullName?: string;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requireApproved = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_APPROVED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    // Block PENDING / REJECTED shop owners from wholesale (and any @RequireApproved) routes
    if (requireApproved && user.role === UserRole.SHOP_OWNER) {
      if (user.status === UserStatus.PENDING_VERIFICATION) {
        throw new ForbiddenException({
          code: 'PENDING_VERIFICATION',
          message: 'Account is pending management review',
        });
      }
      if (user.status === UserStatus.REJECTED) {
        throw new ForbiddenException({
          code: 'REJECTED',
          message: 'Account registration was rejected',
        });
      }
      if (user.status !== UserStatus.APPROVED) {
        throw new ForbiddenException('Shop is not approved for wholesale access');
      }
    }

    return true;
  }
}
