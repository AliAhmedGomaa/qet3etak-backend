import { UserRole } from '../common/enums/user.enums';
import {
  ADMIN_PERMISSIONS,
  BRANCH_MANAGER_PERMISSIONS,
  MANAGER_PERMISSIONS,
  OPS_PERMISSIONS,
} from '../common/permissions';

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
    permissions: ADMIN_PERMISSIONS,
  },
  {
    code: UserRole.MANAGER,
    name: 'مدير عمليات',
    description:
      'عمليات اللوحة + عرض/تعديل المستخدمين بدون إضافة أو حذف (قابل للتخصيص من الأدوار)',
    adminPanel: true,
    permissions: MANAGER_PERMISSIONS,
  },
  {
    code: UserRole.STAFF,
    name: 'موظف',
    description: 'عمليات يومية في اللوحة بدون إدارة المستخدمين/الأدوار/الفروع',
    adminPanel: true,
    permissions: OPS_PERMISSIONS,
  },
  {
    code: UserRole.BRANCH_MANAGER,
    name: 'مدير فرع',
    description:
      'عرض وإدارة بيانات فرعه فقط (متاجر، طلبات، تقارير، مالية، مرتجعات، فواتير)',
    adminPanel: true,
    permissions: BRANCH_MANAGER_PERMISSIONS,
  },
  {
    code: UserRole.SHOP_OWNER,
    name: 'صاحب متجر',
    description: 'وصول تطبيق المحلات فقط — لا يدخل لوحة الإدارة',
    adminPanel: false,
    permissions: ['shop.access'],
  },
];
