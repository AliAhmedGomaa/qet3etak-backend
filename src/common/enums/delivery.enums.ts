export enum DeliveryGuyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * How delivery fees are calculated for a courier.
 * - FLAT: fixed amount per delivery
 * - PERCENT: percentage of order total
 * - BASE_PLUS_ITEMS: base fee + (item count × per-item fee)
 */
export enum DeliveryFeeModel {
  FLAT = 'FLAT',
  PERCENT = 'PERCENT',
  BASE_PLUS_ITEMS = 'BASE_PLUS_ITEMS',
}
