import {
  ADMIN_PANEL_ROLES,
  UNSCOPED_ADMIN_ROLES,
  UserRole,
} from '../../common/enums/user.enums';
import { Roles } from './roles.decorator';

/** Allow any role that can use the admin dashboard. */
export const AdminOnly = () => Roles(...ADMIN_PANEL_ROLES);

/** Allow shop owners or any admin-panel role. */
export const ShopOrAdmin = () =>
  Roles(UserRole.SHOP_OWNER, ...ADMIN_PANEL_ROLES);

/** Restrict to super-admins only (e.g. branches CRUD). */
export const SuperAdminOnly = () => Roles(UserRole.ADMIN);

/**
 * Admin-panel roles that are not branch-scoped
 * (excludes BRANCH_MANAGER — users, catalog mutations, HQ tools).
 */
export const UnscopedAdminOnly = () => Roles(...UNSCOPED_ADMIN_ROLES);
