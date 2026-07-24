export enum UserStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export enum UserRole {
  SHOP_OWNER = 'SHOP_OWNER',
  /** Full platform access (super admin). */
  ADMIN = 'ADMIN',
  /** Operations / management staff for the admin panel. */
  MANAGER = 'MANAGER',
  /** General admin-panel staff. */
  STAFF = 'STAFF',
  /** Branch-scoped manager — sees only their branch’s ops data. */
  BRANCH_MANAGER = 'BRANCH_MANAGER',
}

/** Roles that may log into and use the admin dashboard. */
export const ADMIN_PANEL_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
  UserRole.BRANCH_MANAGER,
];

/** Roles that can manage global/HQ resources (not branch-scoped). */
export const UNSCOPED_ADMIN_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.STAFF,
];

export function isAdminPanelRole(role: UserRole): boolean {
  return ADMIN_PANEL_ROLES.includes(role);
}

export function isUnscopedAdminRole(role: UserRole): boolean {
  return UNSCOPED_ADMIN_ROLES.includes(role);
}

/** Human-readable role definitions for the admin UI. */
export const ADMIN_ROLE_DEFINITIONS = [
  {
    role: UserRole.ADMIN,
    labelAr: 'مدير النظام',
    labelEn: 'Admin',
    descriptionAr: 'صلاحيات كاملة بما في ذلك إدارة المستخدمين والأدوار',
  },
  {
    role: UserRole.MANAGER,
    labelAr: 'مدير عمليات',
    labelEn: 'Manager',
    descriptionAr: 'وصول كامل للوحة الإدارة (إدارة المستخدمين لاحقاً قد تُقيَّد)',
  },
  {
    role: UserRole.STAFF,
    labelAr: 'موظف',
    labelEn: 'Staff',
    descriptionAr: 'وصول كامل للوحة الإدارة للعمليات اليومية',
  },
  {
    role: UserRole.BRANCH_MANAGER,
    labelAr: 'مدير فرع',
    labelEn: 'Branch manager',
    descriptionAr:
      'عرض وإدارة بيانات فرعه فقط (متاجر، طلبات، تقارير، مالية، مرتجعات، فواتير)',
  },
] as const;
