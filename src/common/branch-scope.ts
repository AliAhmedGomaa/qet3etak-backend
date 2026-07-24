import { Types } from 'mongoose';
import { UserRole } from './enums/user.enums';

export type BranchScopedUser = {
  role: UserRole;
  branchId?: string | null;
};

/**
 * Branch data scope for the current user.
 * - `null` → unrestricted (ADMIN / unscoped MANAGER|STAFF)
 * - ObjectId string → only that branch
 * - empty string → BRANCH_MANAGER with no assignment (match nothing)
 */
export function getBranchScope(user: BranchScopedUser): string | null {
  if (user.role === UserRole.ADMIN) return null;
  if (user.role === UserRole.BRANCH_MANAGER) {
    return user.branchId?.trim() || '';
  }
  // MANAGER / STAFF remain unscoped unless they carry a branchId.
  return user.branchId?.trim() || null;
}

/**
 * Effective scope for list/report endpoints.
 * BRANCH_MANAGER is always forced to their branch; ADMIN may pass `branchId` query.
 */
export function effectiveBranchScope(
  user: BranchScopedUser,
  requestedBranchId?: string,
): string | null {
  const forced = getBranchScope(user);
  if (forced !== null) return forced;
  const requested = requestedBranchId?.trim();
  if (requested && Types.ObjectId.isValid(requested)) return requested;
  return null;
}

/** Merge a Mongo filter with branch scope. Empty scope matches nothing. */
export function withBranchFilter(
  filter: Record<string, unknown>,
  scope: string | null,
): Record<string, unknown> {
  if (scope === null) return filter;
  if (!scope || !Types.ObjectId.isValid(scope)) {
    return { ...filter, _id: { $in: [] } };
  }
  return { ...filter, branchId: new Types.ObjectId(scope) };
}

export function branchObjectId(
  scope: string | null,
): Types.ObjectId | undefined {
  if (!scope || !Types.ObjectId.isValid(scope)) return undefined;
  return new Types.ObjectId(scope);
}
