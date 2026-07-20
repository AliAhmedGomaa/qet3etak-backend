import { TieredPrice } from './schemas/product.schema';

export type UnitPriceResult = {
  unitPrice: number;
  lineTotal: number;
  appliedMinQty: number;
  isTiered: boolean;
};

/**
 * Evaluates quantity against sorted tieredPricing rules.
 * Highest matching minQty wins; otherwise basePrice.
 */
export function resolveUnitPrice(
  quantity: number,
  basePrice: number,
  tieredPricing: TieredPrice[] = [],
): UnitPriceResult {
  const qty = Math.max(0, Math.floor(quantity));
  const tiers = [...tieredPricing].sort((a, b) => a.minQty - b.minQty);

  let applied = { minQty: 1, price: basePrice };
  for (const tier of tiers) {
    if (qty >= tier.minQty) {
      applied = { minQty: tier.minQty, price: tier.price };
    }
  }

  const isTiered = tiers.some((t) => t.minQty === applied.minQty) && applied.price !== basePrice;

  return {
    unitPrice: applied.price,
    lineTotal: Number((applied.price * qty).toFixed(2)),
    appliedMinQty: applied.minQty,
    isTiered,
  };
}

/** Builds display rows for the bulk discount matrix (1–N, N+). */
export function buildDiscountMatrix(
  basePrice: number,
  tieredPricing: TieredPrice[] = [],
): Array<{ label: string; minQty: number; maxQty: number | null; price: number }> {
  const tiers = [...tieredPricing].sort((a, b) => a.minQty - b.minQty);
  if (!tiers.length) {
    return [{ label: '1+', minQty: 1, maxQty: null, price: basePrice }];
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
      price: basePrice,
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
      price: current.price,
    });
  }

  return rows;
}
