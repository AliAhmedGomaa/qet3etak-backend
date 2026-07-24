import { UserRole } from '../common/enums/user.enums';

export type SystemRoleSeed = {
  code: UserRole;
  name: string;
  description: string;
  adminPanel: boolean;
  permissions: string[];
};

/** Idempotent seed definitions for built-in roles. */
export const SYSTEM_ROLE_SEEDS: SystemRoleSeed[] = [
  {
    code: UserRole.ADMIN,
    name: 'مدير النظام',
    description: 'صلاحيات كاملة بما في ذلك إدارة المستخدمين والأدوار',
    adminPanel: true,
    permissions: ['admin.panel', 'admin.users', 'admin.roles', 'admin.branches'],
  },
  {
    code: UserRole.MANAGER,
    name: 'مدير عمليات',
    description: 'وصول كامل للوحة الإدارة',
    adminPanel: true,
    permissions: ['admin.panel'],
  },
  {
    code: UserRole.STAFF,
    name: 'موظف',
    description: 'وصول كامل للوحة الإدارة للعمليات اليومية',
    adminPanel: true,
    permissions: ['admin.panel'],
  },
  {
    code: UserRole.BRANCH_MANAGER,
    name: 'مدير فرع',
    description:
      'عرض وإدارة بيانات فرعه فقط (متاجر، طلبات، تقارير، مالية، مرتجعات، فواتير)',
    adminPanel: true,
    permissions: ['admin.panel', 'admin.branch_scoped'],
  },
  {
    code: UserRole.SHOP_OWNER,
    name: 'صاحب متجر',
    description: 'وصول تطبيق المحلات فقط — لا يدخل لوحة الإدارة',
    adminPanel: false,
    permissions: ['shop.access'],
  },
];
