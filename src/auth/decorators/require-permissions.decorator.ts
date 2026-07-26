import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissions_mode';

export type PermissionsMode = 'any' | 'all';

/** Require at least one of the listed permission keys (ADMIN always passes). */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Require every listed permission key. */
export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
