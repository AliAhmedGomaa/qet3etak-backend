import { SetMetadata } from '@nestjs/common';

export const REQUIRE_APPROVED_KEY = 'requireApproved';
/** Marks wholesale endpoints that PENDING_VERIFICATION shops must not access. */
export const RequireApproved = () => SetMetadata(REQUIRE_APPROVED_KEY, true);
