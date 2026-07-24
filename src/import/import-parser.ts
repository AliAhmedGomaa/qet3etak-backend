import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { canonicalizeQualityName } from '../qualities/qualities.service';
import { inferPartFromTitle } from '../products/search.util';
import type {
  ImportBrandRow,
  ImportCategoryRow,
  ImportProductRow,
  NormalizedImportPayload,
} from './import.types';

const MAX_BYTES = 10 * 1024 * 1024;

export interface ParseOutcome {
  payload: NormalizedImportPayload;
  /** Row-level parse failures (file still usable if other rows are valid). */
  parseErrors: Array<{ entity: string; row: number; message: string }>;
}

function asString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  // ExcelJS rich text / formula results
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return asString((value as { text: unknown }).text);
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return asString((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function asOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(asString(value));
  return Number.isFinite(n) ? n : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value == null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  const s = asString(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return undefined;
}

function parseTieredPricing(
  value: unknown,
): Array<{ minQty: number; price: number }> | undefined {
  if (value == null || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  const tiers = parsed
    .map((t: { minQty?: unknown; price?: unknown }) => ({
      minQty: Number(t?.minQty),
      price: Number(t?.price),
    }))
    .filter(
      (t) =>
        Number.isFinite(t.minQty) &&
        t.minQty >= 1 &&
        Number.isFinite(t.price) &&
        t.price >= 0,
    );
  return tiers.length ? tiers : undefined;
}

function normalizeQualityGrade(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  return canonicalizeQualityName(raw) || null;
}

function normalizeHeader(h: string): string {
  return h.trim().replace(/\s+/g, '').replace(/_/g, '').toLowerCase();
}

const BRAND_HEADER_MAP: Record<string, string> = {
  name: 'name',
  brand: 'name',
  brandname: 'name',
  sortorder: 'sortOrder',
  sort: 'sortOrder',
  isactive: 'isActive',
  active: 'isActive',
  iconurl: 'iconUrl',
  icon: 'iconUrl',
};

const CATEGORY_HEADER_MAP: Record<string, string> = {
  name: 'name',
  category: 'name',
  categoryname: 'name',
  sortorder: 'sortOrder',
  sort: 'sortOrder',
  isactive: 'isActive',
  active: 'isActive',
  iconurl: 'iconUrl',
  icon: 'iconUrl',
};

const PRODUCT_HEADER_MAP: Record<string, string> = {
  title: 'title',
  name: 'title',
  product: 'title',
  productname: 'title',
  brand: 'brand',
  model: 'model',
  category: 'category',
  part: 'part',
  qualitygrade: 'qualityGrade',
  quality: 'qualityGrade',
  grade: 'qualityGrade',
  stockquantity: 'stockQuantity',
  stock: 'stockQuantity',
  qty: 'stockQuantity',
  quantity: 'stockQuantity',
  baseprice: 'basePrice',
  price: 'basePrice',
  sku: 'sku',
  code: 'sku',
  isactive: 'isActive',
  active: 'isActive',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  tieredpricing: 'tieredPricing',
  tiers: 'tieredPricing',
};

function mapRow(
  raw: Record<string, unknown>,
  headerMap: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const canon = headerMap[normalizeHeader(key)];
    if (canon) out[canon] = value;
  }
  return out;
}

export function parseBrandRow(
  raw: Record<string, unknown>,
  rowIndex: number,
): ImportBrandRow {
  const mapped = mapRow(raw, BRAND_HEADER_MAP);
  const name = asString(mapped.name);
  if (!name) {
    throw new Error(`Brand row ${rowIndex}: name is required`);
  }
  return {
    name,
    sortOrder: asOptionalNumber(mapped.sortOrder),
    isActive: asOptionalBoolean(mapped.isActive),
    iconUrl: asString(mapped.iconUrl) || undefined,
  };
}

export function parseCategoryRow(
  raw: Record<string, unknown>,
  rowIndex: number,
): ImportCategoryRow {
  const mapped = mapRow(raw, CATEGORY_HEADER_MAP);
  const name = asString(mapped.name);
  if (!name) {
    throw new Error(`Category row ${rowIndex}: name is required`);
  }
  return {
    name,
    sortOrder: asOptionalNumber(mapped.sortOrder),
    isActive: asOptionalBoolean(mapped.isActive),
    iconUrl: asString(mapped.iconUrl) || undefined,
  };
}

export function parseProductRow(
  raw: Record<string, unknown>,
  rowIndex: number,
): ImportProductRow {
  const mapped = mapRow(raw, PRODUCT_HEADER_MAP);
  const title = asString(mapped.title);
  const brand = asString(mapped.brand);
  const model = asString(mapped.model);
  const category = asString(mapped.category);
  const qualityGrade = normalizeQualityGrade(mapped.qualityGrade);
  const stockQuantity = asOptionalNumber(mapped.stockQuantity);
  const basePrice = asOptionalNumber(mapped.basePrice);

  const missing: string[] = [];
  if (!title) missing.push('title');
  if (!brand) missing.push('brand');
  if (!model) missing.push('model');
  if (!category) missing.push('category');
  if (!qualityGrade) missing.push('qualityGrade');
  if (stockQuantity == null || stockQuantity < 0) missing.push('stockQuantity');
  if (basePrice == null || basePrice < 0) missing.push('basePrice');
  if (missing.length) {
    throw new Error(
      `Product row ${rowIndex}: missing/invalid fields: ${missing.join(', ')}`,
    );
  }

  const part =
    asString(mapped.part) || inferPartFromTitle(title, model) || title;

  return {
    title,
    brand,
    model,
    category,
    part,
    qualityGrade: qualityGrade!,
    stockQuantity: stockQuantity!,
    basePrice: basePrice!,
    sku: asString(mapped.sku) || undefined,
    isActive: asOptionalBoolean(mapped.isActive),
    imageUrl: asString(mapped.imageUrl) || undefined,
    tieredPricing: parseTieredPricing(mapped.tieredPricing),
  };
}

function parseJsonPayload(buffer: Buffer): ParseOutcome {
  let data: unknown;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid JSON file');
  }

  const parseErrors: ParseOutcome['parseErrors'] = [];
  const brands: ImportBrandRow[] = [];
  const categories: ImportCategoryRow[] = [];
  const products: ImportProductRow[] = [];

  const pushBrand = (row: unknown, i: number) => {
    try {
      brands.push(parseBrandRow((row ?? {}) as Record<string, unknown>, i));
    } catch (err) {
      parseErrors.push({
        entity: 'brand',
        row: i,
        message: err instanceof Error ? err.message : 'Invalid brand row',
      });
    }
  };
  const pushCategory = (row: unknown, i: number) => {
    try {
      categories.push(
        parseCategoryRow((row ?? {}) as Record<string, unknown>, i),
      );
    } catch (err) {
      parseErrors.push({
        entity: 'category',
        row: i,
        message: err instanceof Error ? err.message : 'Invalid category row',
      });
    }
  };
  const pushProduct = (row: unknown, i: number) => {
    try {
      products.push(
        parseProductRow((row ?? {}) as Record<string, unknown>, i),
      );
    } catch (err) {
      parseErrors.push({
        entity: 'product',
        row: i,
        message: err instanceof Error ? err.message : 'Invalid product row',
      });
    }
  };

  if (Array.isArray(data)) {
    data.forEach((row, i) => pushProduct(row, i + 1));
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const brandsRaw = Array.isArray(obj.brands) ? obj.brands : [];
    const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
    const productsRaw = Array.isArray(obj.products) ? obj.products : [];
    brandsRaw.forEach((row, i) => pushBrand(row, i + 1));
    categoriesRaw.forEach((row, i) => pushCategory(row, i + 1));
    productsRaw.forEach((row, i) => pushProduct(row, i + 1));
  } else {
    throw new BadRequestException(
      'JSON must be an object { brands?, categories?, products? } or a products array',
    );
  }

  if (!brands.length && !categories.length && !products.length) {
    throw new BadRequestException(
      parseErrors.length
        ? `No valid rows. ${parseErrors[0]?.message ?? ''}`
        : 'Import file has no brands, categories, or products',
    );
  }

  return { payload: { brands, categories, products }, parseErrors };
}

function detectSheetKind(
  sheetName: string,
  headers: string[],
): 'brand' | 'category' | 'product' | null {
  const name = sheetName.trim().toLowerCase();
  if (name.includes('brand')) return 'brand';
  if (name.includes('categor')) return 'category';
  if (name.includes('product') || name.includes('inventory')) return 'product';

  const norms = headers.map(normalizeHeader).filter(Boolean);
  const has = (k: string) => norms.includes(k);
  if (
    has('title') ||
    has('sku') ||
    has('baseprice') ||
    has('model') ||
    (has('brand') && has('category'))
  ) {
    return 'product';
  }
  if (has('name')) return 'brand';
  return null;
}

async function parseExcelPayload(buffer: Buffer): Promise<ParseOutcome> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const brands: ImportBrandRow[] = [];
  const categories: ImportCategoryRow[] = [];
  const products: ImportProductRow[] = [];
  const parseErrors: ParseOutcome['parseErrors'] = [];

  for (const sheet of workbook.worksheets) {
    let headers: string[] = [];
    let kind: 'brand' | 'category' | 'product' | null = null;

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values as unknown[];
      // values[0] is unused (1-based)
      const cells = values.slice(1);

      if (rowNumber === 1) {
        headers = cells.map((c) => asString(c));
        kind = detectSheetKind(sheet.name || '', headers);
        return;
      }
      if (!kind || !headers.length) return;
      if (cells.every((c) => c == null || asString(c) === '')) return;

      const labeled: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (!h) return;
        labeled[h] = cells[i];
      });

      try {
        if (kind === 'brand') brands.push(parseBrandRow(labeled, rowNumber));
        else if (kind === 'category') {
          categories.push(parseCategoryRow(labeled, rowNumber));
        } else {
          products.push(parseProductRow(labeled, rowNumber));
        }
      } catch (err) {
        parseErrors.push({
          entity: kind,
          row: rowNumber,
          message: err instanceof Error ? err.message : 'Invalid row',
        });
      }
    });
  }

  if (!brands.length && !categories.length && !products.length) {
    throw new BadRequestException(
      parseErrors.length
        ? `No valid rows. ${parseErrors[0]?.message ?? ''}`
        : 'Excel file has no recognizable Brands / Categories / Products sheets',
    );
  }

  return { payload: { brands, categories, products }, parseErrors };
}

export async function parseImportFile(
  file: Express.Multer.File,
): Promise<ParseOutcome> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Empty import file');
  }
  if (file.buffer.byteLength > MAX_BYTES) {
    throw new BadRequestException('Import file must be 10MB or smaller');
  }

  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.json') || file.mimetype?.includes('json')) {
    return parseJsonPayload(file.buffer);
  }
  if (name.endsWith('.xlsx')) {
    return parseExcelPayload(file.buffer);
  }
  throw new BadRequestException('Only .xlsx or .json files are supported');
}
