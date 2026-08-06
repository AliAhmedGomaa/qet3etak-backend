export enum PaymentMethod {
  CREDIT = 'CREDIT',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  /** Immediate cash at the physical counter (walk-in). */
  CASH = 'CASH',
}

export enum OrderStatus {
  RECEIVED = 'RECEIVED',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
}

/** How the order was placed. */
export enum OrderSource {
  WHOLESALE = 'WHOLESALE',
  WALK_IN = 'WALK_IN',
}

export enum WalletTxType {
  CREDIT_PURCHASE = 'CREDIT_PURCHASE',
  PAYMENT = 'PAYMENT',
  ADJUSTMENT = 'ADJUSTMENT',
  CREDIT_LIMIT_CHANGE = 'CREDIT_LIMIT_CHANGE',
}
