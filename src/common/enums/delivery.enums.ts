export enum DeliveryGuyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** JWT / guard role for the delivery portal (not an admin UserRole). */
export const DELIVERY_ROLE = 'DELIVERY' as const;

/**
 * How delivery fees are calculated for a courier.
 * Delivery pay is hourly only (clock-in / clock-out).
 * Legacy values kept for existing documents.
 */
export enum DeliveryFeeModel {
  /** @deprecated Use HOURLY */
  FLAT = 'FLAT',
  /** @deprecated Use HOURLY */
  PERCENT = 'PERCENT',
  /** @deprecated Use HOURLY */
  BASE_PLUS_ITEMS = 'BASE_PLUS_ITEMS',
  HOURLY = 'HOURLY',
}
