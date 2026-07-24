import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { QualityGrade } from '../common/enums/product.enums';
import { inferPartFromTitle } from '../products/search.util';
import type {
  ImportBrandRow,
  ImportCategoryRow,
  ImportProductRow,
  NormalizedImportPayload,
} from './import.types';

const QUALITY_VALUES = new Set(Object.values(QualityGrade));

function asString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
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

function parseTieredPricing(value: unknown): Array<{ minQty: number; price: number }> | undefined {
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
    .filter((t) => Number.isFinite(t.minQty) && t.minQty >= 1 && Number.isFinite(t.price) && t.price >= 0);
  return tiers.length ? tiers : undefined;
}

function normalizeQualityGrade(value: unknown): QualityGrade | null {
  const raw = asString(value);
  if (!raw) return null;
  // Accept common aliases
  const aliases: Record<string, QualityGrade> = {
    original: QualityGrade.Original,
    org: QualityGrade.Original,
    highcopy: QualityGrade.HighCopy,
    'high copy': QualityGrade.HighCopy,
    'high-copy': QualityGrade.HighCopy,
    hc: QualityGrade.HighCopy,
    copy: QualityGrade.Copy,
    used: QualityGrade.Used,
  };
  const lower = raw.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  if (QUALITY_VALUES.has(raw as QualityGrade)) return raw as QualityGrade;
  return null;
}

function rowToObject(
  headers: string[],
  values: unknown[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    if (!h) return;
    obj[h] = values[i];
  });
  return obj;
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .toLowerCase();
}

/** Map flexible column names → canonical field. */
const BRAND_HEADER_MAP: Record<string, keyof ImportBrandRow | 'name'> = {
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

const CATEGORY_HEADER_MAP: Record<string, keyof ImportCategoryRow | 'name'> = {
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

function parseBrandRow(raw: Record<string, unknown>, rowIndex: number): ImportBrandRow {
  const mapped = mapRow(raw, BRAND_HEADER_MAP as Record<string, string>);
  const name = asString(mapped.name);
  if (!name) {
    throw new BadRequestException(`Brand row ${rowIndex}: name is required`);
  }
  return {
    name,
    sortOrder: asOptionalNumber(mapped.sortOrder),
    isActive: asOptionalBoolean(mapped.isActive),
    iconUrl: asString(mapped.iconUrl) || undefined,
  };
}

function parseCategoryRow(
  raw: Record<string, unknown>,
  rowIndex: number,
): ImportCategoryRow {
  const mapped = mapRow(raw, CATEGORY_HEADER_MAP as Record<string, string>);
  const name = asString(mapped.name);
  if (!name) {
    throw new BadRequestException(`Category row ${rowIndex}: name is required`);
  }
  return {
    name,
    sortOrder: asOptionalNumber(mapped.sortOrder),
    isActive: asOptionalBoolean(mapped.isActive),
    iconUrl: asString(mapped.iconUrl) || undefined,
  };
}

function parseProductRow(
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
    throw new BadRequestException(
      `Product row ${rowIndex}: missing/invalid fields: ${missing.join(', ')}`,
    );
  }

  const part =
    asString(mapped.part) ||
    inferPartFromTitle(title, model) ||
    title;

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

function parseJsonPayload(buffer: Buffer): NormalizedImportPayload {
  let data: unknown;
  try {
    data = JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid JSON file');
  }

  // Bare products array
  if (Array.isArray(data)) {
    return {
      brands: [],
      categories: [],
      products: data.map((row, i) =>
        parseProductRow((row ?? {}) as Record<string, unknown>, i + 1),
      ),
    };
  }

  if (!data || typeof data !== 'object') {
    throw new BadRequestException(
      'JSON must be an object { brands?, categories?, products? } or a products array',
    );
  }

  const obj = data as Record<string, unknown>;
  const brandsRaw = Array.isArray(obj.brands) ? obj.brands : [];
  const categoriesRaw = Array.isArray(obj.categories) ? obj.categories : [];
  const productsRaw = Array.isArray(obj.products) ? obj.products : [];

  if (!brandsRaw.length && !categoriesRaw.length && !productsRaw.length) {
    throw new BadRequestException(
      'Import file has no brands, categories, or products',
    );
  }

  return {
    brands: brandsRaw.map((row, i) =>
      parseBrandRow((row ?? {}) as Record<string, unknown>, i + 1),
    ),
    categories: categoriesRaw.map((row, i) =>
      parseCategoryRow((row ?? {}) as Record<string, unknown>, i + 1),
    ),
    products: productsRaw.map((row, i) =>
      parseProductRow((row ?? {}) as Record<string, unknown>, i + 1),
    ),
  };
}

async function parseExcelPayload(buffer: Buffer): Promise<NormalizedImportPayload> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings accept Buffer via ArrayBuffer-like; cast for Node Buffer
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const brands: ImportBrandRow[] = [];
  const categories: ImportCategoryRow[] = [];
  const products: ImportProductRow[] = [];

  const softErrors: string[] = [];

  for (const sheet of workbook.worksheets) {
    const sheetName = (sheet.name || '').trim().toLowerCase();
    const rows = sheet.getSheetValues() as unknown[][];
    if (!rows || rows.length < 2) continue;

    // ExcelJS getSheetValues is 1-indexed; row[0] is undefined
    const headerRow = (rows[1] ?? []).map((c) => asString(c));
    const headers = headerRow.map((h) => h);

    const kind: 'brand' | 'category' | 'product' | null =
      sheetName.includes('brand')
        ? 'brand'
        : sheetName.includes('categor')
          ? 'category'
          : sheetName.includes('product') || sheetName.includes('inventory')
            ? 'product'
            : detectSheetKind(headers);

    if (!kind) continue;

    for (let r = 2; r < rows.length; r++) {
      const values = (rows[r] ?? []) as unknown[];
      // Skip empty rows
      const cells = values.slice(1);
      if (cells.every((c) => c == null || asString(c) === '')) continue;

      const raw = rowToObject(
        headers.slice(1).length ? headers.slice(1) : headers,
        // Align with header indices (ExcelJS may keep index 0 empty)
        headers[0] === '' ? cells : values.slice(0),
      );

      // Prefer mapping by header labels at columns 1..n
      const labeled: Record<string, unknown> = {};
      for (let c = 1; c < headerRow.length; c++) {
        const h = headerRow[c];
        if (!h) continue;
        labeled[h] = values[c];
      }

      try {
        if (kind === 'brand') brands.push(parseBrandRow(labeled, r));
        else if (kind === 'category') categories.push(parseCategoryRow(labeled, r));
        else products.push(parseProductRow(labeled, r));
      } catch (err) {
        softErrors.push(
          err instanceof Error ? err.message : `Row ${r} on sheet ${sheet.name} failed`,
        );
      }
    }
  }

  if (softErrors.length && !brands.length && !categories.length && !products.length) {
    throw new BadRequestException(softErrors.slice(0, 5).join('; '));
  }

  if (!brands.length && !categories.length && !products.length) {
    throw new BadRequestException(
      'Excel file has no recognizable Brands / Categories / Products sheets or columns',
    );
  }

  // Surface parse errors as a BadRequest if any — caller can still proceed if we
  // collected valid rows; attach via exception only when all failed above.
  if (softErrors.length) {
    // Keep valid rows; service will report row-level errors separately if needed.
    // For hard invalid cells we already skipped those rows — rethrow summary only
    // when user would otherwise get a silent partial with no feedback:
    // We'll attach them by throwing a compound message only if too many?
    // Better: throw BadRequest listing first errors so user fixes the file.
    throw new BadRequestException(
      `Some rows failed validation: ${softErrors.slice(0, 8).join('; ')}${
        softErrors.length > 8 ? ` (+${softErrors.length - 8} more)` : ''
      }`,
    );
  }

  return { brands, categories, products };
}

function detectSheetKind(
  headers: string[],
): 'brand' | 'category' | 'product' | null {
  const norms = headers.map((h) => normalizeHeader(h)).filter(Boolean);
  const has = (k: string) => norms.includes(k);
  if (has('title') || has('sku') || has('baseprice') || has('model')) {
    return 'product';
  }
  if (has('brand') && has('category') && has('qualitygrade')) return 'product';
  if (has('name') && !has('title')) {
    // Ambiguous brand vs category — treat as brand unless sheet says otherwise
    return 'brand';
  }
  return null;
}

export async function parseImportFile(
  file: Express.Multer.File,
): Promise<NormalizedImportPayload> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('Empty import file');
  }
  if (file.buffer.byteLength > 10 * 1024 * 1024) {
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
