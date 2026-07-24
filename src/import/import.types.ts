import { QualityGrade } from '../common/enums/product.enums';

/** Raw brand row from JSON / Excel. */
export interface ImportBrandRow {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  iconUrl?: string;
}

/** Raw category row from JSON / Excel. */
export interface ImportCategoryRow {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  iconUrl?: string;
}

/** Raw product row from JSON / Excel. */
export interface ImportProductRow {
  title: string;
  brand: string;
  model: string;
  category: string;
  part?: string;
  /** Free-text quality name (aliases normalized at parse time). */
  qualityGrade: string;
  stockQuantity: number;
  basePrice: number;
  sku?: string;
  isActive?: boolean;
  imageUrl?: string;
  tieredPricing?: Array<{ minQty: number; price: number }>;
}

export interface NormalizedImportPayload {
  brands: ImportBrandRow[];
  categories: ImportCategoryRow[];
  products: ImportProductRow[];
}

export type RowAction = 'create' | 'update' | 'reuse' | 'skip' | 'error';

export interface ImportRowPlan {
  entity: 'brand' | 'category' | 'product';
  row: number;
  action: RowAction;
  key: string;
  message?: string;
  /** Existing Mongo id when reuse/update. */
  existingId?: string;
}

export interface EntityImportSummary {
  create: number;
  update: number;
  reuse: number;
  skip: number;
  error: number;
}

export interface ImportResult {
  dryRun: boolean;
  summary: {
    brands: EntityImportSummary;
    categories: EntityImportSummary;
    products: EntityImportSummary;
  };
  rows: ImportRowPlan[];
  errors: Array<{ entity: string; row: number; message: string }>;
}

export const EMPTY_ENTITY_SUMMARY = (): EntityImportSummary => ({
  create: 0,
  update: 0,
  reuse: 0,
  skip: 0,
  error: 0,
});
