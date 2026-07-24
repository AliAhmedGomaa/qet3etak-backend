import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import ExcelJS from 'exceljs';
import { Brand } from '../brands/schemas/brand.schema';
import { Category } from '../categories/schemas/category.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { inferPartFromTitle } from '../products/search.util';
import { parseImportFile } from './import-parser';
import { IMPORT_FIELD_DOCS, IMPORT_SAMPLE_JSON } from './import.template';
import {
  EMPTY_ENTITY_SUMMARY,
  type EntityImportSummary,
  type ImportBrandRow,
  type ImportCategoryRow,
  type ImportProductRow,
  type ImportResult,
  type ImportRowPlan,
  type NormalizedImportPayload,
} from './import.types';

const PLACEHOLDER_IMAGE = '/uploads/product-placeholder.png';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function productMatchKey(p: {
  sku?: string;
  brand: string;
  model: string;
  category: string;
  part: string;
  qualityGrade: string;
}): string {
  const sku = p.sku?.trim();
  if (sku) return `sku:${sku.toLowerCase()}`;
  return [
    'comp',
    nameKey(p.brand),
    nameKey(p.model),
    nameKey(p.category),
    nameKey(p.part),
    p.qualityGrade,
  ].join('|');
}

function bump(
  summary: EntityImportSummary,
  action: keyof EntityImportSummary,
): void {
  summary[action] += 1;
}

function normalizeTiers(
  tiers: Array<{ minQty: number; price: number }> | undefined,
): Array<{ minQty: number; price: number }> {
  if (!tiers?.length) return [];
  const sorted = [...tiers]
    .map((t) => ({ minQty: Number(t.minQty), price: Number(t.price) }))
    .filter((t) => t.minQty >= 1 && t.price >= 0)
    .sort((a, b) => a.minQty - b.minQty);
  const seen = new Set<number>();
  return sorted.filter((t) => {
    if (seen.has(t.minQty)) return false;
    seen.add(t.minQty);
    return true;
  });
}

@Injectable()
export class ImportService {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
    @InjectModel(Category.name)
    private readonly categoryModel: Model<Category>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  getTemplateDocs() {
    return IMPORT_FIELD_DOCS;
  }

  getSampleJson(): typeof IMPORT_SAMPLE_JSON {
    return IMPORT_SAMPLE_JSON;
  }

  async buildExcelTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Qet3etak';

    const brands = workbook.addWorksheet('Brands');
    brands.columns = [
      { header: 'name', key: 'name', width: 20 },
      { header: 'sortOrder', key: 'sortOrder', width: 12 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: 'iconUrl', key: 'iconUrl', width: 40 },
    ];
    for (const b of IMPORT_SAMPLE_JSON.brands) {
      brands.addRow(b);
    }

    const categories = workbook.addWorksheet('Categories');
    categories.columns = [
      { header: 'name', key: 'name', width: 20 },
      { header: 'sortOrder', key: 'sortOrder', width: 12 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: 'iconUrl', key: 'iconUrl', width: 40 },
    ];
    for (const c of IMPORT_SAMPLE_JSON.categories) {
      categories.addRow(c);
    }

    const products = workbook.addWorksheet('Products');
    products.columns = [
      { header: 'title', key: 'title', width: 32 },
      { header: 'brand', key: 'brand', width: 14 },
      { header: 'model', key: 'model', width: 16 },
      { header: 'category', key: 'category', width: 14 },
      { header: 'part', key: 'part', width: 16 },
      { header: 'qualityGrade', key: 'qualityGrade', width: 14 },
      { header: 'stockQuantity', key: 'stockQuantity', width: 14 },
      { header: 'basePrice', key: 'basePrice', width: 12 },
      { header: 'sku', key: 'sku', width: 18 },
      { header: 'isActive', key: 'isActive', width: 10 },
      { header: 'imageUrl', key: 'imageUrl', width: 28 },
      { header: 'tieredPricing', key: 'tieredPricing', width: 36 },
    ];
    for (const p of IMPORT_SAMPLE_JSON.products) {
      products.addRow({
        ...p,
        tieredPricing: p.tieredPricing
          ? JSON.stringify(p.tieredPricing)
          : '',
      });
    }

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async preview(file: Express.Multer.File): Promise<ImportResult> {
    const { payload, parseErrors } = await parseImportFile(file);
    return this.runImport(payload, true, parseErrors);
  }

  async commit(file: Express.Multer.File): Promise<ImportResult> {
    const { payload, parseErrors } = await parseImportFile(file);
    return this.runImport(payload, false, parseErrors);
  }

  private async runImport(
    payload: NormalizedImportPayload,
    dryRun: boolean,
    parseErrors: Array<{ entity: string; row: number; message: string }>,
  ): Promise<ImportResult> {
    const rows: ImportRowPlan[] = [];
    const errors = [...parseErrors];
    const summary = {
      brands: EMPTY_ENTITY_SUMMARY(),
      categories: EMPTY_ENTITY_SUMMARY(),
      products: EMPTY_ENTITY_SUMMARY(),
    };

    for (const e of parseErrors) {
      rows.push({
        entity: e.entity as ImportRowPlan['entity'],
        row: e.row,
        action: 'error',
        key: '',
        message: e.message,
      });
      if (e.entity === 'brand') bump(summary.brands, 'error');
      else if (e.entity === 'category') bump(summary.categories, 'error');
      else bump(summary.products, 'error');
    }

    // Ensure brands/categories referenced by products are considered
    const brandByKey = new Map<string, ImportBrandRow>();
    for (const b of payload.brands) brandByKey.set(nameKey(b.name), b);
    const categoryByKey = new Map<string, ImportCategoryRow>();
    for (const c of payload.categories) categoryByKey.set(nameKey(c.name), c);

    for (const p of payload.products) {
      const bk = nameKey(p.brand);
      if (!brandByKey.has(bk)) {
        brandByKey.set(bk, { name: p.brand.trim(), isActive: true });
      }
      const ck = nameKey(p.category);
      if (!categoryByKey.has(ck)) {
        categoryByKey.set(ck, { name: p.category.trim(), isActive: true });
      }
    }

    const resolvedBrandNames = new Map<string, string>(); // key → canonical name
    const resolvedCategoryNames = new Map<string, string>();

    let brandRow = 0;
    for (const brand of brandByKey.values()) {
      brandRow += 1;
      await this.upsertBrand(
        brand,
        brandRow,
        dryRun,
        rows,
        errors,
        summary.brands,
        resolvedBrandNames,
      );
    }

    let categoryRow = 0;
    for (const category of categoryByKey.values()) {
      categoryRow += 1;
      await this.upsertCategory(
        category,
        categoryRow,
        dryRun,
        rows,
        errors,
        summary.categories,
        resolvedCategoryNames,
      );
    }

    let productRow = 0;
    for (const product of payload.products) {
      productRow += 1;
      await this.upsertProduct(
        product,
        productRow,
        dryRun,
        rows,
        errors,
        summary.products,
        resolvedBrandNames,
        resolvedCategoryNames,
      );
    }

    return { dryRun, summary, rows, errors };
  }

  private async upsertBrand(
    row: ImportBrandRow,
    rowNum: number,
    dryRun: boolean,
    plans: ImportRowPlan[],
    errors: ImportResult['errors'],
    summary: EntityImportSummary,
    resolved: Map<string, string>,
  ): Promise<void> {
    const key = nameKey(row.name);
    try {
      const existing = await this.brandModel
        .findOne({ name: new RegExp(`^${escapeRegex(row.name.trim())}$`, 'i') })
        .exec();

      if (existing) {
        resolved.set(key, existing.name);
        const needsUpdate =
          (row.sortOrder != null && row.sortOrder !== existing.sortOrder) ||
          (row.isActive != null && row.isActive !== existing.isActive) ||
          (row.iconUrl != null &&
            row.iconUrl.trim() !== '' &&
            row.iconUrl.trim() !== existing.iconUrl);

        if (!needsUpdate) {
          plans.push({
            entity: 'brand',
            row: rowNum,
            action: 'reuse',
            key: existing.name,
            existingId: String(existing._id),
            message: 'موجود — سيتم الاستخدام',
          });
          bump(summary, 'reuse');
          return;
        }

        if (!dryRun) {
          if (row.sortOrder != null) existing.sortOrder = row.sortOrder;
          if (row.isActive != null) existing.isActive = row.isActive;
          if (row.iconUrl != null && row.iconUrl.trim()) {
            existing.iconUrl = row.iconUrl.trim();
          }
          await existing.save();
        }
        plans.push({
          entity: 'brand',
          row: rowNum,
          action: 'update',
          key: existing.name,
          existingId: String(existing._id),
          message: 'موجود — تحديث الحقول',
        });
        bump(summary, 'update');
        return;
      }

      if (!dryRun) {
        const created = await this.brandModel.create({
          name: row.name.trim(),
          iconUrl: row.iconUrl?.trim() || '',
          isActive: row.isActive ?? true,
          sortOrder: row.sortOrder ?? 0,
        });
        resolved.set(key, created.name);
        plans.push({
          entity: 'brand',
          row: rowNum,
          action: 'create',
          key: created.name,
          existingId: String(created._id),
          message: 'غير موجود — إنشاء',
        });
      } else {
        resolved.set(key, row.name.trim());
        plans.push({
          entity: 'brand',
          row: rowNum,
          action: 'create',
          key: row.name.trim(),
          message: 'غير موجود — إنشاء',
        });
      }
      bump(summary, 'create');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to upsert brand';
      plans.push({
        entity: 'brand',
        row: rowNum,
        action: 'error',
        key: row.name,
        message,
      });
      errors.push({ entity: 'brand', row: rowNum, message });
      bump(summary, 'error');
      // Still resolve name so products can proceed with string brand field
      resolved.set(key, row.name.trim());
    }
  }

  private async upsertCategory(
    row: ImportCategoryRow,
    rowNum: number,
    dryRun: boolean,
    plans: ImportRowPlan[],
    errors: ImportResult['errors'],
    summary: EntityImportSummary,
    resolved: Map<string, string>,
  ): Promise<void> {
    const key = nameKey(row.name);
    try {
      const existing = await this.categoryModel
        .findOne({ name: new RegExp(`^${escapeRegex(row.name.trim())}$`, 'i') })
        .exec();

      if (existing) {
        resolved.set(key, existing.name);
        const needsUpdate =
          (row.sortOrder != null && row.sortOrder !== existing.sortOrder) ||
          (row.isActive != null && row.isActive !== existing.isActive) ||
          (row.iconUrl != null &&
            row.iconUrl.trim() !== '' &&
            row.iconUrl.trim() !== existing.iconUrl);

        if (!needsUpdate) {
          plans.push({
            entity: 'category',
            row: rowNum,
            action: 'reuse',
            key: existing.name,
            existingId: String(existing._id),
            message: 'موجود — سيتم الاستخدام',
          });
          bump(summary, 'reuse');
          return;
        }

        if (!dryRun) {
          if (row.sortOrder != null) existing.sortOrder = row.sortOrder;
          if (row.isActive != null) existing.isActive = row.isActive;
          if (row.iconUrl != null && row.iconUrl.trim()) {
            existing.iconUrl = row.iconUrl.trim();
          }
          await existing.save();
        }
        plans.push({
          entity: 'category',
          row: rowNum,
          action: 'update',
          key: existing.name,
          existingId: String(existing._id),
          message: 'موجود — تحديث الحقول',
        });
        bump(summary, 'update');
        return;
      }

      if (!dryRun) {
        const created = await this.categoryModel.create({
          name: row.name.trim(),
          iconUrl: row.iconUrl?.trim() || '',
          isActive: row.isActive ?? true,
          sortOrder: row.sortOrder ?? 0,
        });
        resolved.set(key, created.name);
        plans.push({
          entity: 'category',
          row: rowNum,
          action: 'create',
          key: created.name,
          existingId: String(created._id),
          message: 'غير موجود — إنشاء',
        });
      } else {
        resolved.set(key, row.name.trim());
        plans.push({
          entity: 'category',
          row: rowNum,
          action: 'create',
          key: row.name.trim(),
          message: 'غير موجود — إنشاء',
        });
      }
      bump(summary, 'create');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to upsert category';
      plans.push({
        entity: 'category',
        row: rowNum,
        action: 'error',
        key: row.name,
        message,
      });
      errors.push({ entity: 'category', row: rowNum, message });
      bump(summary, 'error');
      resolved.set(key, row.name.trim());
    }
  }

  private async findProduct(
    row: ImportProductRow,
  ): Promise<ProductDocument | null> {
    const sku = row.sku?.trim();
    if (sku) {
      const bySku = await this.productModel
        .findOne({ sku: new RegExp(`^${escapeRegex(sku)}$`, 'i') })
        .exec();
      if (bySku) return bySku;
    }

    const part =
      row.part?.trim() ||
      inferPartFromTitle(row.title, row.model) ||
      row.title;

    return this.productModel
      .findOne({
        brand: new RegExp(`^${escapeRegex(row.brand.trim())}$`, 'i'),
        model: new RegExp(`^${escapeRegex(row.model.trim())}$`, 'i'),
        category: new RegExp(`^${escapeRegex(row.category.trim())}$`, 'i'),
        part: new RegExp(`^${escapeRegex(part)}$`, 'i'),
        qualityGrade: row.qualityGrade,
      })
      .exec();
  }

  private async upsertProduct(
    row: ImportProductRow,
    rowNum: number,
    dryRun: boolean,
    plans: ImportRowPlan[],
    errors: ImportResult['errors'],
    summary: EntityImportSummary,
    brandNames: Map<string, string>,
    categoryNames: Map<string, string>,
  ): Promise<void> {
    const brand =
      brandNames.get(nameKey(row.brand)) ?? row.brand.trim();
    const category =
      categoryNames.get(nameKey(row.category)) ?? row.category.trim();
    const part =
      row.part?.trim() ||
      inferPartFromTitle(row.title, row.model) ||
      row.title;
    const key = productMatchKey({ ...row, brand, category, part });

    try {
      const existing = await this.findProduct({ ...row, brand, category, part });

      if (existing) {
        if (!dryRun) {
          existing.title = row.title.trim();
          existing.brand = brand;
          existing.set('model', row.model.trim());
          existing.category = category;
          existing.part = part;
          existing.qualityGrade = row.qualityGrade;
          existing.stockQuantity = row.stockQuantity;
          existing.basePrice = row.basePrice;
          if (row.sku != null) existing.sku = row.sku.trim();
          if (row.isActive != null) existing.isActive = row.isActive;
          if (row.tieredPricing != null) {
            existing.tieredPricing = normalizeTiers(row.tieredPricing);
          }
          if (row.imageUrl?.trim()) {
            existing.imageUrl = row.imageUrl.trim();
          }
          // costPrice intentionally not touched
          await existing.save();
        }
        plans.push({
          entity: 'product',
          row: rowNum,
          action: 'update',
          key,
          existingId: String(existing._id),
          message: 'موجود — تحديث',
        });
        bump(summary, 'update');
        return;
      }

      if (!dryRun) {
        const created = await this.productModel.create({
          title: row.title.trim(),
          brand,
          model: row.model.trim(),
          category,
          part,
          qualityGrade: row.qualityGrade,
          stockQuantity: row.stockQuantity,
          basePrice: row.basePrice,
          costPrice: 0,
          tieredPricing: normalizeTiers(row.tieredPricing),
          imageUrl: row.imageUrl?.trim() || PLACEHOLDER_IMAGE,
          sku: row.sku?.trim() || '',
          isActive: row.isActive ?? true,
        });
        plans.push({
          entity: 'product',
          row: rowNum,
          action: 'create',
          key,
          existingId: String(created._id),
          message: 'غير موجود — إنشاء',
        });
      } else {
        plans.push({
          entity: 'product',
          row: rowNum,
          action: 'create',
          key,
          message: 'غير موجود — إنشاء',
        });
      }
      bump(summary, 'create');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to upsert product';
      plans.push({
        entity: 'product',
        row: rowNum,
        action: 'error',
        key,
        message,
      });
      errors.push({ entity: 'product', row: rowNum, message });
      bump(summary, 'error');
    }
  }
}
