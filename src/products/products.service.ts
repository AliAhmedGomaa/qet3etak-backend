import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { QualityGrade } from '../common/enums/product.enums';
import { absoluteMediaUrl } from '../common/media-url';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import {
  CalculateCartDto,
  CatalogQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { buildDiscountMatrix, resolveUnitPrice } from './pricing.util';
import { Product, ProductDocument } from './schemas/product.schema';
import {
  buildPartFilter,
  buildRelevanceScoreExpr,
  buildSmartSearchFilter,
  inferPartFromTitle,
} from './search.util';

type ProductFilter = Record<string, unknown>;

function splitCsv(value?: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.productModel.countDocuments();
    if (count === 0) {
      await this.productModel.insertMany(SEED_PRODUCTS);
    }
    // Backfill missing part names from title/model for older documents
    const missing = await this.productModel
      .find({
        $or: [{ part: { $exists: false } }, { part: null }, { part: '' }],
      })
      .select('title model part')
      .exec();
    for (const doc of missing) {
      doc.part = inferPartFromTitle(doc.title, doc.get('model'));
      await doc.save();
    }
  }

  async create(
    dto: CreateProductDto,
    imageFilename: string,
  ): Promise<Record<string, unknown>> {
    const part =
      dto.part?.trim() || inferPartFromTitle(dto.title, dto.model) || dto.title;
    const product = await this.productModel.create({
      title: dto.title.trim(),
      brand: dto.brand.trim(),
      model: dto.model.trim(),
      category: dto.category.trim(),
      part,
      qualityGrade: dto.qualityGrade,
      stockQuantity: dto.stockQuantity,
      basePrice: dto.basePrice,
      tieredPricing: this.normalizeTiers(dto.tieredPricing ?? []),
      imageUrl: `/uploads/${imageFilename}`,
      sku: dto.sku?.trim() ?? '',
      isActive: dto.isActive ?? true,
    });
    return this.toProductView(product);
  }

  async findAllAdmin(
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = buildSmartSearchFilter(q?.trim() ?? '') ?? {};
    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toProductView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async findById(id: string): Promise<Record<string, unknown>> {
    const product = await this.findDocumentById(id);
    return this.toProductView(product);
  }

  async findDocumentById(id: string): Promise<ProductDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    imageFilename?: string,
  ): Promise<Record<string, unknown>> {
    const product = await this.findDocumentById(id);
    if (dto.title != null) product.title = dto.title;
    if (dto.brand != null) product.brand = dto.brand;
    // `model` conflicts with Mongoose Document.model()
    if (dto.model != null) product.set('model', dto.model);
    if (dto.category != null) product.category = dto.category;
    if (dto.part != null) product.part = dto.part.trim();
    if (dto.qualityGrade != null) product.qualityGrade = dto.qualityGrade;
    if (dto.stockQuantity != null) product.stockQuantity = dto.stockQuantity;
    if (dto.basePrice != null) product.basePrice = dto.basePrice;
    if (imageFilename != null) {
      product.imageUrl = `/uploads/${imageFilename}`;
    }
    if (dto.sku != null) product.sku = dto.sku;
    if (dto.isActive != null) product.isActive = dto.isActive;
    if (dto.tieredPricing != null) {
      product.tieredPricing = this.normalizeTiers(dto.tieredPricing);
    }
    // Keep part in sync when title/model change and part was not explicitly set
    if (dto.part == null && (dto.title != null || dto.model != null)) {
      if (!product.part?.trim()) {
        product.part = inferPartFromTitle(product.title, product.get('model'));
      }
    }
    await product.save();
    return this.toProductView(product);
  }

  /**
   * Receive purchased stock into inventory and recalculate the product's
   * weighted-average landed cost:
   *   newCost = ((oldStock * oldCost) + (newQty * newLandedCost)) / (oldStock + newQty)
   */
  async applyReceivedStock(
    productId: string,
    newQty: number,
    newLandedCost: number,
  ): Promise<ProductDocument> {
    const product = await this.findDocumentById(productId);
    const oldStock = product.stockQuantity;
    const oldCost = product.costPrice ?? 0;
    const totalQty = oldStock + newQty;

    const newCost =
      totalQty > 0
        ? (oldStock * oldCost + newQty * newLandedCost) / totalQty
        : newLandedCost;

    product.stockQuantity = totalQty;
    product.costPrice = Number(newCost.toFixed(4));
    await product.save();
    return product;
  }

  /** Remove damaged/lost units from stock (never below zero). */
  async decrementStock(
    productId: string,
    quantity: number,
  ): Promise<ProductDocument> {
    const product = await this.findDocumentById(productId);
    if (quantity > product.stockQuantity) {
      throw new BadRequestException(
        `Cannot remove ${quantity} units of ${product.title}; only ${product.stockQuantity} in stock`,
      );
    }
    product.stockQuantity -= quantity;
    await product.save();
    return product;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.productModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Product not found');
    return { deleted: true };
  }

  /**
   * Aggregation: facet filters + smart free-text search (partial, synonyms, multi-token).
   */
  async searchCatalog(query: CatalogQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 24, 100);
    const skip = (page - 1) * limit;

    const match = this.buildCatalogMatch(query);
    const searchQ = query.q?.trim() ?? '';
    const pipeline: PipelineStage[] = [{ $match: match }];

    const projectFields = {
      title: 1,
      brand: 1,
      model: 1,
      category: 1,
      part: 1,
      qualityGrade: 1,
      stockQuantity: 1,
      basePrice: 1,
      tieredPricing: 1,
      imageUrl: 1,
      sku: 1,
      createdAt: 1,
      updatedAt: 1,
      score: 1,
    };

    const itemsStages: PipelineStage.Facet['$facet'][string] = searchQ
      ? [
          { $addFields: { score: buildRelevanceScoreExpr(searchQ) } },
          { $sort: { score: -1, brand: 1, title: 1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: projectFields },
        ]
      : [
          { $sort: { brand: 1, title: 1 } },
          { $skip: skip },
          { $limit: limit },
          { $project: projectFields },
        ];

    pipeline.push({
      $facet: {
        items: itemsStages,
        totalCount: [{ $count: 'count' }],
      },
    });

    const [result] = await this.productModel.aggregate(pipeline).exec();
    const items = (result?.items ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (doc: any) => ({
        ...doc,
        id: String(doc._id),
        _id: undefined,
        imageUrl: absoluteMediaUrl(
          typeof doc.imageUrl === 'string' ? doc.imageUrl : '',
        ),
        discountMatrix: buildDiscountMatrix(
          doc.basePrice,
          doc.tieredPricing ?? [],
        ),
        stockLabel: this.stockLabel(doc.stockQuantity),
      }),
    );

    const total = result?.totalCount?.[0]?.count ?? 0;

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      query: searchQ || undefined,
    };
  }

  /** Single active product for the wholesale catalog detail page. */
  async getCatalogProduct(id: string): Promise<Record<string, unknown>> {
    const product = await this.findDocumentById(id);
    if (!product.isActive) {
      throw new NotFoundException('Product not found');
    }
    return {
      ...this.toProductView(product),
      discountMatrix: buildDiscountMatrix(
        product.basePrice,
        product.tieredPricing ?? [],
      ),
      stockLabel: this.stockLabel(product.stockQuantity),
    };
  }

  /** Facet values for multi-select filter pills (respects current filters except own dimension). */
  async getFacets(query: CatalogQueryDto) {
    const brands = splitCsv(query.brand);
    const models = splitCsv(query.model);
    const categories = splitCsv(query.category);
    const parts = splitCsv(query.part);
    const grades = splitCsv(query.qualityGrade);

    type FacetDim = 'brand' | 'model' | 'category' | 'part' | 'qualityGrade';

    const withCommon = (exclude?: FacetDim) => {
      const match: ProductFilter = { isActive: true };
      const b = exclude === 'brand' ? [] : brands;
      const m = exclude === 'model' ? [] : models;
      const c = exclude === 'category' ? [] : categories;
      const p = exclude === 'part' ? [] : parts;
      const g = exclude === 'qualityGrade' ? [] : grades;
      if (b.length) match['brand'] = { $in: b };
      if (m.length) match['model'] = { $in: m };
      if (c.length) match['category'] = { $in: c };
      if (g.length) match['qualityGrade'] = { $in: g };

      const clauses: ProductFilter[] = [match];
      const search = buildSmartSearchFilter(query.q?.trim() ?? '');
      if (search) clauses.push(search);
      const partFilter = buildPartFilter(p);
      if (partFilter) clauses.push(partFilter);

      return clauses.length === 1 ? clauses[0]! : { $and: clauses };
    };

    const distinct = async (field: string, exclude?: FacetDim) => {
      const values = await this.productModel.distinct(field, withCommon(exclude));
      return (values as string[])
        .filter((v) => typeof v === 'string' && v.trim().length > 0)
        .sort((a, b) => a.localeCompare(b));
    };

    const [brand, model, category, part, qualityGrade] = await Promise.all([
      distinct('brand', 'brand'),
      distinct('model', 'model'),
      distinct('category', 'category'),
      distinct('part', 'part'),
      distinct('qualityGrade', 'qualityGrade'),
    ]);

    return { brand, model, category, part, qualityGrade };
  }

  /** Shared catalog match: active + facet filters + smart free-text search. */
  private buildCatalogMatch(query: CatalogQueryDto): ProductFilter {
    const match: ProductFilter = { isActive: true };
    const brands = splitCsv(query.brand);
    const models = splitCsv(query.model);
    const categories = splitCsv(query.category);
    const grades = splitCsv(query.qualityGrade);

    if (brands.length) match['brand'] = { $in: brands };
    if (models.length) match['model'] = { $in: models };
    if (categories.length) match['category'] = { $in: categories };
    if (grades.length) match['qualityGrade'] = { $in: grades };

    const clauses: ProductFilter[] = [match];
    const search = buildSmartSearchFilter(query.q?.trim() ?? '');
    if (search) clauses.push(search);
    const partFilter = buildPartFilter(splitCsv(query.part));
    if (partFilter) clauses.push(partFilter);

    return clauses.length === 1 ? clauses[0]! : { $and: clauses };
  }

  async calculateCart(dto: CalculateCartDto) {
    const ids = dto.items.map((i) => i.productId);
    const invalid = ids.filter((id) => !Types.ObjectId.isValid(id));
    if (invalid.length) {
      throw new BadRequestException(`Invalid product ids: ${invalid.join(', ')}`);
    }

    const products = await this.productModel
      .find({ _id: { $in: ids }, isActive: true })
      .exec();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const lines = dto.items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      if (item.quantity > product.stockQuantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.title} (available: ${product.stockQuantity})`,
        );
      }
      const pricing = resolveUnitPrice(
        item.quantity,
        product.basePrice,
        product.tieredPricing ?? [],
      );
      return {
        productId: item.productId,
        title: product.title,
        quantity: item.quantity,
        basePrice: product.basePrice,
        ...pricing,
        discountMatrix: buildDiscountMatrix(
          product.basePrice,
          product.tieredPricing ?? [],
        ),
      };
    });

    const subtotal = Number(
      lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2),
    );

    return { lines, subtotal, currency: 'EGP' };
  }

  /** Instant single-line price quote for card +/- controls */
  async quoteLine(productId: string, quantity: number) {
    const product = await this.findDocumentById(productId);
    const qty = Math.max(1, Math.floor(quantity));
    const pricing = resolveUnitPrice(
      qty,
      product.basePrice,
      product.tieredPricing ?? [],
    );
    return {
      productId,
      quantity: qty,
      basePrice: product.basePrice,
      stockQuantity: product.stockQuantity,
      ...pricing,
      discountMatrix: buildDiscountMatrix(
        product.basePrice,
        product.tieredPricing ?? [],
      ),
    };
  }

  private toProductView(product: ProductDocument): Record<string, unknown> {
    const json = product.toJSON() as unknown as Record<string, unknown>;
    return {
      ...json,
      imageUrl: absoluteMediaUrl(
        typeof json.imageUrl === 'string' ? json.imageUrl : '',
      ),
    };
  }

  private stockLabel(stock: number): string {
    if (stock <= 0) return 'Out of Stock';
    if (stock <= 5) return `Only ${stock} Left`;
    return 'In Stock';
  }

  private normalizeTiers(
    tiers: Array<{ minQty: number; price: number }>,
  ): Array<{ minQty: number; price: number }> {
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
}

const SEED_PRODUCTS = [
  {
    title: 'iPhone 14 LCD Assembly',
    brand: 'Apple',
    model: 'iPhone 14',
    category: 'Screens',
    part: 'LCD Assembly',
    qualityGrade: QualityGrade.Original,
    stockQuantity: 42,
    basePrice: 85,
    tieredPricing: [
      { minQty: 5, price: 78 },
      { minQty: 20, price: 72 },
    ],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'SCR-IP14-ORG',
    isActive: true,
  },
  {
    title: 'iPhone 14 LCD Assembly',
    brand: 'Apple',
    model: 'iPhone 14',
    category: 'Screens',
    part: 'LCD Assembly',
    qualityGrade: QualityGrade.HighCopy,
    stockQuantity: 3,
    basePrice: 45,
    tieredPricing: [
      { minQty: 5, price: 40 },
      { minQty: 10, price: 36 },
    ],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'SCR-IP14-HC',
    isActive: true,
  },
  {
    title: 'Samsung S23 Battery',
    brand: 'Samsung',
    model: 'Galaxy S23',
    category: 'Batteries',
    part: 'Battery Pack',
    qualityGrade: QualityGrade.Original,
    stockQuantity: 120,
    basePrice: 28,
    tieredPricing: [
      { minQty: 10, price: 24 },
      { minQty: 50, price: 21 },
    ],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'BAT-S23-ORG',
    isActive: true,
  },
  {
    title: 'Xiaomi Redmi Note 12 Charging Port',
    brand: 'Xiaomi',
    model: 'Redmi Note 12',
    category: 'Charging Ports',
    part: 'Charging Port Flex',
    qualityGrade: QualityGrade.Copy,
    stockQuantity: 8,
    basePrice: 6.5,
    tieredPricing: [{ minQty: 20, price: 5.2 }],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'CHG-RN12-CPY',
    isActive: true,
  },
  {
    title: 'Huawei P30 Back Glass',
    brand: 'Huawei',
    model: 'P30',
    category: 'Back Covers',
    part: 'Rear Glass Panel',
    qualityGrade: QualityGrade.Used,
    stockQuantity: 0,
    basePrice: 12,
    tieredPricing: [],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'BCK-P30-USED',
    isActive: true,
  },
  {
    title: 'iPhone 13 Camera Lens',
    brand: 'Apple',
    model: 'iPhone 13',
    category: 'Cameras',
    part: 'Back Camera Lens',
    qualityGrade: QualityGrade.HighCopy,
    stockQuantity: 55,
    basePrice: 9,
    tieredPricing: [
      { minQty: 5, price: 8 },
      { minQty: 25, price: 6.5 },
    ],
    imageUrl: '/uploads/product-placeholder.png',
    sku: 'CAM-IP13-HC',
    isActive: true,
  },
];
