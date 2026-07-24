import { QualityGrade } from '../common/enums/product.enums';

/**
 * Expected import field mapping
 * -----------------------------
 * Brands sheet / `brands[]`:
 *   name (required), sortOrder?, isActive?, iconUrl?
 *   Upsert key: name (case-insensitive)
 *
 * Categories sheet / `categories[]`:
 *   name (required), sortOrder?, isActive?, iconUrl?
 *   Upsert key: name (case-insensitive)
 *
 * Products sheet / `products[]`:
 *   title, brand, model, category, qualityGrade, stockQuantity, basePrice (required)
 *   part?, sku?, isActive?, imageUrl?, tieredPricing? (JSON array or Excel JSON string)
 *   Upsert key: sku if non-empty; else (brand + model + category + part + qualityGrade)
 *
 * Brands/categories referenced by products are auto-upserted if missing from
 * dedicated sheets. Products never get a duplicate for the same logical key.
 * costPrice is never overwritten (owned by purchasing receive flow).
 */

export const IMPORT_SAMPLE_JSON = {
  brands: [
    { name: 'Samsung', sortOrder: 1, isActive: true },
    { name: 'Apple', sortOrder: 2, isActive: true },
  ],
  categories: [
    { name: 'Batteries', sortOrder: 1, isActive: true },
    { name: 'Screens', sortOrder: 2, isActive: true },
  ],
  products: [
    {
      title: 'Samsung Galaxy S23 Battery',
      brand: 'Samsung',
      model: 'Galaxy S23',
      category: 'Batteries',
      part: 'Battery Pack',
      qualityGrade: QualityGrade.Original,
      stockQuantity: 50,
      basePrice: 28,
      sku: 'BAT-SAM-S23-ORG',
      isActive: true,
      tieredPricing: [
        { minQty: 5, price: 26 },
        { minQty: 20, price: 24 },
      ],
    },
    {
      title: 'iPhone 14 LCD Assembly',
      brand: 'Apple',
      model: 'iPhone 14',
      category: 'Screens',
      part: 'LCD Assembly',
      qualityGrade: QualityGrade.HighCopy,
      stockQuantity: 30,
      basePrice: 72,
      sku: 'SCR-IP14-HC',
      isActive: true,
    },
  ],
};

export const IMPORT_FIELD_DOCS = {
  formats: ['.xlsx', '.json'],
  maxFileBytes: 10 * 1024 * 1024,
  excelSheets: {
    Brands: ['name', 'sortOrder', 'isActive', 'iconUrl'],
    Categories: ['name', 'sortOrder', 'isActive', 'iconUrl'],
    Products: [
      'title',
      'brand',
      'model',
      'category',
      'part',
      'qualityGrade',
      'stockQuantity',
      'basePrice',
      'sku',
      'isActive',
      'imageUrl',
      'tieredPricing',
    ],
  },
  qualityGradeValues: Object.values(QualityGrade),
  upsertKeys: {
    brand: 'name (case-insensitive)',
    category: 'name (case-insensitive)',
    product:
      'sku if present; otherwise brand+model+category+part+qualityGrade (case-insensitive)',
  },
  notes: [
    'Existing brand/category → reuse (no duplicate). Missing → create.',
    'Existing product → update stock/price/title/tiers/flags. Missing → create with placeholder image if imageUrl omitted.',
    'costPrice is not imported (set via purchasing receive).',
    'JSON may be a full object { brands, categories, products } or a bare products array.',
  ],
  sample: IMPORT_SAMPLE_JSON,
};
