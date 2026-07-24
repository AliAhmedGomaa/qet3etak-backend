export enum ReturnRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/** How the refund was applied when a return is approved. */
export enum ReturnRefundMethod {
  /** Reduce shop credit debt (CREDIT orders). */
  WALLET_CREDIT = 'WALLET_CREDIT',
  /** No wallet change (typically CASH_ON_DELIVERY). */
  NONE = 'NONE',
}
