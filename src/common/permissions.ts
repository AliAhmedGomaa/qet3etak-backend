/**
 * Canonical admin permission keys: resource.action
 * Stored on Role.permissions and enforced by PermissionsGuard + admin UI.
 */

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'approve';

export type PermissionDef = {
  key: string;
  labelAr: string;
  group: string;
  groupLabelAr: string;
};

/** Full catalog shown in the Roles matrix UI and validated on save. */
export const PERMISSION_CATALOG: PermissionDef[] = [
  { key: 'admin.panel', labelAr: 'دخول لوحة الإدارة', group: 'panel', groupLabelAr: 'اللوحة' },

  { key: 'users.read', labelAr: 'عرض المستخدمين', group: 'users', groupLabelAr: 'المستخدمون' },
  { key: 'users.create', labelAr: 'إضافة مستخدم', group: 'users', groupLabelAr: 'المستخدمون' },
  { key: 'users.update', labelAr: 'تعديل مستخدم', group: 'users', groupLabelAr: 'المستخدمون' },
  { key: 'users.delete', labelAr: 'حذف مستخدم', group: 'users', groupLabelAr: 'المستخدمون' },

  { key: 'roles.read', labelAr: 'عرض الأدوار', group: 'roles', groupLabelAr: 'الأدوار' },
  { key: 'roles.manage', labelAr: 'إدارة الأدوار', group: 'roles', groupLabelAr: 'الأدوار' },

  { key: 'branches.read', labelAr: 'عرض الفروع', group: 'branches', groupLabelAr: 'الفروع' },
  { key: 'branches.manage', labelAr: 'إدارة الفروع', group: 'branches', groupLabelAr: 'الفروع' },

  { key: 'branding.manage', labelAr: 'إدارة الهوية البصرية', group: 'branding', groupLabelAr: 'الهوية' },

  { key: 'shops.read', labelAr: 'عرض المتاجر', group: 'shops', groupLabelAr: 'المتاجر' },
  { key: 'shops.create', labelAr: 'إضافة متجر', group: 'shops', groupLabelAr: 'المتاجر' },
  { key: 'shops.update', labelAr: 'تعديل متجر', group: 'shops', groupLabelAr: 'المتاجر' },
  { key: 'shops.delete', labelAr: 'حذف متجر', group: 'shops', groupLabelAr: 'المتاجر' },
  { key: 'shops.approve', labelAr: 'اعتماد / رفض المتاجر', group: 'shops', groupLabelAr: 'المتاجر' },

  { key: 'products.read', labelAr: 'عرض المنتجات', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'products.manage', labelAr: 'إدارة المنتجات', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'brands.manage', labelAr: 'إدارة الماركات', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'categories.manage', labelAr: 'إدارة التصنيفات', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'qualities.manage', labelAr: 'إدارة الجودات', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'inventory.manage', labelAr: 'إدارة المخزون', group: 'catalog', groupLabelAr: 'الكتالوج' },
  { key: 'import.manage', labelAr: 'استيراد البيانات', group: 'catalog', groupLabelAr: 'الكتالوج' },

  { key: 'orders.read', labelAr: 'عرض الطلبات', group: 'orders', groupLabelAr: 'الطلبات' },
  { key: 'orders.update', labelAr: 'تحديث الطلبات / التوصيل', group: 'orders', groupLabelAr: 'الطلبات' },

  { key: 'invoices.read', labelAr: 'عرض الفواتير', group: 'invoices', groupLabelAr: 'الفواتير' },
  { key: 'invoices.manage', labelAr: 'إدارة الفواتير', group: 'invoices', groupLabelAr: 'الفواتير' },

  { key: 'credit.read', labelAr: 'عرض الائتمان', group: 'credit', groupLabelAr: 'الائتمان' },
  { key: 'credit.manage', labelAr: 'إدارة الائتمان', group: 'credit', groupLabelAr: 'الائتمان' },

  { key: 'financials.read', labelAr: 'عرض المالية', group: 'financials', groupLabelAr: 'المالية' },
  { key: 'financials.manage', labelAr: 'إدارة المالية', group: 'financials', groupLabelAr: 'المالية' },

  { key: 'reports.read', labelAr: 'عرض التقارير', group: 'reports', groupLabelAr: 'التقارير' },

  { key: 'delivery.read', labelAr: 'عرض مندوبي التوصيل', group: 'delivery', groupLabelAr: 'التوصيل' },
  { key: 'delivery.manage', labelAr: 'إدارة مندوبي التوصيل', group: 'delivery', groupLabelAr: 'التوصيل' },

  { key: 'hr.read', labelAr: 'عرض الموظفين', group: 'hr', groupLabelAr: 'الموارد البشرية' },
  { key: 'hr.manage', labelAr: 'إدارة الموظفين والرواتب', group: 'hr', groupLabelAr: 'الموارد البشرية' },
  { key: 'hr.vacations', labelAr: 'مراجعة الإجازات', group: 'hr', groupLabelAr: 'الموارد البشرية' },

  { key: 'returns.read', labelAr: 'عرض المرتجعات', group: 'returns', groupLabelAr: 'المرتجعات' },
  { key: 'returns.manage', labelAr: 'إدارة المرتجعات', group: 'returns', groupLabelAr: 'المرتجعات' },

  { key: 'special_requests.read', labelAr: 'عرض الطلبات الخاصة', group: 'special', groupLabelAr: 'طلبات خاصة' },
  { key: 'special_requests.manage', labelAr: 'إدارة الطلبات الخاصة', group: 'special', groupLabelAr: 'طلبات خاصة' },

  { key: 'chat.manage', labelAr: 'الدردشة مع المحلات والموظفين', group: 'comms', groupLabelAr: 'التواصل' },
  { key: 'broadcast.manage', labelAr: 'إرسال إشعارات جماعية', group: 'comms', groupLabelAr: 'التواصل' },

  { key: 'admin.branch_scoped', labelAr: 'تقييد البيانات بفرع المستخدم', group: 'scope', groupLabelAr: 'النطاق' },
];

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_CATALOG.map((p) => p.key);

/** Ops panel defaults (MANAGER / STAFF) — full ops, no HQ admin. */
export const OPS_PERMISSIONS: string[] = [
  'admin.panel',
  'shops.read',
  'shops.create',
  'shops.update',
  'shops.delete',
  'shops.approve',
  'products.read',
  'products.manage',
  'brands.manage',
  'categories.manage',
  'qualities.manage',
  'inventory.manage',
  'import.manage',
  'orders.read',
  'orders.update',
  'invoices.read',
  'invoices.manage',
  'credit.read',
  'credit.manage',
  'financials.read',
  'financials.manage',
  'reports.read',
  'delivery.read',
  'delivery.manage',
  'hr.read',
  'hr.manage',
  'hr.vacations',
  'returns.read',
  'returns.manage',
  'special_requests.read',
  'special_requests.manage',
  'chat.manage',
  'broadcast.manage',
];

/** Branch manager — branch-scoped ops subset. */
export const BRANCH_MANAGER_PERMISSIONS: string[] = [
  'admin.panel',
  'admin.branch_scoped',
  'shops.read',
  'shops.update',
  'orders.read',
  'orders.update',
  'invoices.read',
  'credit.read',
  'financials.read',
  'reports.read',
  'returns.read',
  'returns.manage',
];

/** Example: manager can see users but not create — extend OPS with read-only users. */
export const MANAGER_PERMISSIONS: string[] = [
  ...OPS_PERMISSIONS,
  'users.read',
  'users.update',
  // intentionally no users.create / users.delete
  'roles.read',
  'branches.read',
];

export const ADMIN_PERMISSIONS: string[] = [...ALL_PERMISSION_KEYS];

export function hasPermission(
  permissions: string[] | undefined | null,
  required: string | string[],
  opts?: { requireAll?: boolean; isAdmin?: boolean },
): boolean {
  if (opts?.isAdmin) return true;
  const held = new Set(permissions ?? []);
  if (held.has('*')) return true;
  const need = Array.isArray(required) ? required : [required];
  if (!need.length) return true;
  if (opts?.requireAll) return need.every((k) => held.has(k) || held.has(manageKey(k)));
  return need.some((k) => held.has(k) || held.has(manageKey(k)));
}

/** users.create is also satisfied by users.manage if we add it later. */
function manageKey(key: string): string {
  const i = key.lastIndexOf('.');
  if (i < 0) return key;
  return `${key.slice(0, i)}.manage`;
}

export function isLegacyPermissionSet(permissions: string[] | undefined): boolean {
  const perms = permissions ?? [];
  if (!perms.length) return true;
  return !perms.some(
    (p) =>
      p.endsWith('.read') ||
      p.endsWith('.create') ||
      p.endsWith('.update') ||
      p.endsWith('.delete') ||
      p.endsWith('.manage') ||
      p.endsWith('.approve'),
  );
}
