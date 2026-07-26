import { TieredPrice } from './schemas/product.schema';

export type UnitPriceResult = {
  unitPrice: number;
  lineTotal: number;
  appliedMinQty: number;
  isTiered: boolean;
};

/** Clamp to 0–100 with at most 2 decimal places. */
export function clampShopDiscountPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** Apply a shop-level percent discount to a money amount. */
export function applyShopDiscount(amount: number, percent: number): number {
  const p = clampShopDiscountPercent(percent);
  if (p <= 0) return Number(Number(amount).toFixed(2));
  return Number((Number(amount) * (1 - p / 100)).toFixed(2));
}

/**
 * Evaluates quantity against sorted tieredPricing rules.
 * Highest matching minQty wins; otherwise basePrice.
 * Optional shopDiscountPercent is applied after the tier is chosen.
 */
export function resolveUnitPrice(
  quantity: number,
  basePrice: number,
  tieredPricing: TieredPrice[] = [],
  shopDiscountPercent = 0,
): UnitPriceResult {
  const qty = Math.max(0, Math.floor(quantity));
  const tiers = [...tieredPricing].sort((a, b) => a.minQty - b.minQty);

  let applied = { minQty: 1, price: basePrice };
  for (const tier of tiers) {
    if (qty >= tier.minQty) {
      applied = { minQty: tier.minQty, price: tier.price };
    }
  }

  const isTiered =
    tiers.some((t) => t.minQty === applied.minQty) &&
    applied.price !== basePrice;
  const unitPrice = applyShopDiscount(applied.price, shopDiscountPercent);

  return {
    unitPrice,
    lineTotal: Number((unitPrice * qty).toFixed(2)),
    appliedMinQty: applied.minQty,
    isTiered,
  };
}

/** Builds display rows for the bulk discount matrix (1–N, N+). */
export function buildDiscountMatrix(
  basePrice: number,
  tieredPricing: TieredPrice[] = [],
  shopDiscountPercent = 0,
): Array<{ label: string; minQty: number; maxQty: number | null; price: number }> {
  const tiers = [...tieredPricing].sort((a, b) => a.minQty - b.minQty);
  if (!tiers.length) {
    return [
      {
        label: '1+',
        minQty: 1,
        maxQty: null,
        price: applyShopDiscount(basePrice, shopDiscountPercent),
      },
    ];
  }

  const rows: Array<{
    label: string;
    minQty: number;
    maxQty: number | null;
    price: number;
  }> = [];

  const firstMin = tiers[0].minQty;
  if (firstMin > 1) {
    rows.push({
      label: `1–${firstMin - 1}`,
      minQty: 1,
      maxQty: firstMin - 1,
      price: applyShopDiscount(basePrice, shopDiscountPercent),
    });
  }

  for (let i = 0; i < tiers.length; i++) {
    const current = tiers[i];
    const next = tiers[i + 1];
    const maxQty = next ? next.minQty - 1 : null;
    const label =
      maxQty == null
        ? `${current.minQty}+`
        : current.minQty === maxQty
          ? `${current.minQty}`
          : `${current.minQty}–${maxQty}`;
    rows.push({
      label,
      minQty: current.minQty,
      maxQty,
      price: applyShopDiscount(current.price, shopDiscountPercent),
    });
  }

  return rows;
}

/** Discounted catalog prices for a specific shop (keeps listPrice = original). */
export function withShopCatalogPrices(
  basePrice: number,
  tieredPricing: TieredPrice[] = [],
  shopDiscountPercent = 0,
) {
  const percent = clampShopDiscountPercent(shopDiscountPercent);
  const discountedTiers = (tieredPricing ?? []).map((t) => ({
    minQty: t.minQty,
    price: applyShopDiscount(t.price, percent),
  }));
  return {
    listPrice: basePrice,
    basePrice: applyShopDiscount(basePrice, percent),
    tieredPricing: discountedTiers,
    shopDiscountPercent: percent,
    discountMatrix: buildDiscountMatrix(basePrice, tieredPricing, percent),
  };
}
