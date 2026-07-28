import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  UserRole,
  UserStatus,
  effectiveGuardRole,
} from '../../common/enums/user.enums';
import { EMPLOYEE_ROLE, EmployeeStatus } from '../../common/enums/hr.enums';
import {
  DELIVERY_ROLE,
  DeliveryGuyStatus,
} from '../../common/enums/delivery.enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { REQUIRE_APPROVED_KEY } from '../decorators/require-approved.decorator';

export type AuthUser = {
  userId: string;
  phone: string;
  /** Role code (system, custom, or EMPLOYEE for portal). */
  role: UserRole | string;
  roleId?: string;
  /** From Role.adminPanel — custom roles can access admin when true. */
  adminPanel?: boolean;
  status: UserStatus | string;
  shopName?: string;
  fullName?: string;
  /** Set for BRANCH_MANAGER (and optionally other staff). */
  branchId?: string;
  /** Distinguishes admin/shop User JWT from employee / delivery portal JWTs. */
  kind?: 'user' | 'employee' | 'delivery';
  /** Fine-grained permission keys from the user's Role document. */
  permissions?: string[];
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      Array<UserRole | string>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const requireApproved = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_APPROVED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated user');
    }

    if (requiredRoles?.length) {
      const effective = effectiveGuardRole(
        String(user.role),
        user.adminPanel,
      );
      const allowed =
        requiredRoles.includes(user.role) ||
        requiredRoles.includes(effective as UserRole) ||
        requiredRoles.includes(String(effective));
      if (!allowed) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    // Portal accounts must be ACTIVE to use business APIs (/auth/me still works).
    if (
      (user.kind === 'employee' || user.role === EMPLOYEE_ROLE) &&
      user.status !== EmployeeStatus.ACTIVE
    ) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'الحساب غير نشط — تواصل مع الإدارة',
      });
    }
    if (
      (user.kind === 'delivery' || user.role === DELIVERY_ROLE) &&
      user.status !== DeliveryGuyStatus.ACTIVE
    ) {
      throw new ForbiddenException({
        code: 'ACCOUNT_INACTIVE',
        message: 'الحساب غير نشط — تواصل مع الإدارة',
      });
    }

    // Block PENDING / REJECTED / SUSPENDED shop owners from wholesale (and any @RequireApproved) routes
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
      if (user.status === UserStatus.SUSPENDED) {
        throw new ForbiddenException({
          code: 'SUSPENDED',
          message:
            'Account suspended / الحساب موقوف — تواصل مع الإدارة لإعادة التفعيل',
        });
      }
      if (user.status !== UserStatus.APPROVED) {
        throw new ForbiddenException(
          'Shop is not approved for wholesale access',
        );
      }
    }

    return true;
  }
}
