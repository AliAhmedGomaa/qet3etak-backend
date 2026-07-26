import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../common/enums/user.enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Array<UserRole | string>) =>
  SetMetadata(ROLES_KEY, roles);
