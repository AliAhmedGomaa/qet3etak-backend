import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { QualityGrade } from '../common/enums/product.enums';
import {
  CalculateCartDto,
  CatalogQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { buildDiscountMatrix, resolveUnitPrice } from './pricing.util';
import { Product, ProductDocument } from './schemas/product.schema';

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
    if (count > 0) return;
    await this.productModel.insertMany(SEED_PRODUCTS);
  }

  create(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create({
      ...dto,
      tieredPricing: this.normalizeTiers(dto.tieredPricing ?? []),
      imageUrl: dto.imageUrl ?? '',
      sku: dto.sku ?? '',
      isActive: dto.isActive ?? true,
    });
  }

  async findAllAdmin(): Promise<ProductDocument[]> {
    return this.productModel.find().sort({ updatedAt: -1 }).exec();
  }

  async findById(id: string): Promise<ProductDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductDocument> {
    const product = await this.findById(id);
    if (dto.title != null) product.title = dto.title;
    if (dto.brand != null) product.brand = dto.brand;
    // `model` conflicts with Mongoose Document.model()
    if (dto.model != null) product.set('model', dto.model);
    if (dto.category != null) product.category = dto.category;
    if (dto.qualityGrade != null) product.qualityGrade = dto.qualityGrade;
    if (dto.stockQuantity != null) product.stockQuantity = dto.stockQuantity;
    if (dto.basePrice != null) product.basePrice = dto.basePrice;
    if (dto.imageUrl != null) product.imageUrl = dto.imageUrl;
    if (dto.sku != null) product.sku = dto.sku;
    if (dto.isActive != null) product.isActive = dto.isActive;
    if (dto.tieredPricing != null) {
      product.tieredPricing = this.normalizeTiers(dto.tieredPricing);
    }
    return product.save();
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.productModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Product not found');
    return { deleted: true };
  }

  /**
   * Aggregation: match filters + optional text search, facet for total + page.
   */
  async searchCatalog(query: CatalogQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 24, 100);
    const skip = (page - 1) * limit;

    const match: ProductFilter = { isActive: true };
    const brands = splitCsv(query.brand);
    const models = splitCsv(query.model);
    const categories = splitCsv(query.category);
    const grades = splitCsv(query.qualityGrade);

    if (brands.length) match['brand'] = { $in: brands };
    if (models.length) match['model'] = { $in: models };
    if (categories.length) match['category'] = { $in: categories };
    if (grades.length) match['qualityGrade'] = { $in: grades };

    const pipeline: PipelineStage[] = [];

    if (query.q?.trim()) {
      pipeline.push({
        $match: {
          ...match,
          $text: { $search: query.q.trim() },
        },
      });
      pipeline.push({
        $addFields: { score: { $meta: 'textScore' } },
      });
    } else {
      pipeline.push({ $match: match });
    }

    const itemsStages: PipelineStage.Facet['$facet'][string] = query.q?.trim()
      ? [
          { $sort: { score: { $meta: 'textScore' }, title: 1 } } as never,
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              title: 1,
              brand: 1,
              model: 1,
              category: 1,
              qualityGrade: 1,
              stockQuantity: 1,
              basePrice: 1,
              tieredPricing: 1,
              imageUrl: 1,
              sku: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ]
      : [
          { $sort: { brand: 1, title: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              title: 1,
              brand: 1,
              model: 1,
              category: 1,
              qualityGrade: 1,
              stockQuantity: 1,
              basePrice: 1,
              tieredPricing: 1,
              imageUrl: 1,
              sku: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
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
    };
  }

  /** Facet values for multi-select filter pills (respects current filters except own dimension). */
  async getFacets(query: CatalogQueryDto) {
    const base: ProductFilter = { isActive: true };

    const brands = splitCsv(query.brand);
    const models = splitCsv(query.model);
    const categories = splitCsv(query.category);
    const grades = splitCsv(query.qualityGrade);

    const withCommon = (extra: ProductFilter = {}) => {
      const m: ProductFilter = { ...base, ...extra };
      if (query.q?.trim()) {
        Object.assign(m, { $text: { $search: query.q.trim() } });
      }
      return m;
    };

    const distinct = async (
      field: string,
      exclude?: 'brand' | 'model' | 'category' | 'qualityGrade',
    ) => {
      const filter = withCommon();
      if (exclude !== 'brand' && brands.length) filter['brand'] = { $in: brands };
      if (exclude !== 'model' && models.length) filter['model'] = { $in: models };
      if (exclude !== 'category' && categories.length) {
        filter['category'] = { $in: categories };
      }
      if (exclude !== 'qualityGrade' && grades.length) {
        filter['qualityGrade'] = { $in: grades };
      }
      const values = await this.productModel.distinct(field, filter);
      return (values as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b));
    };

    const [brand, model, category, qualityGrade] = await Promise.all([
      distinct('brand', 'brand'),
      distinct('model', 'model'),
      distinct('category', 'category'),
      distinct('qualityGrade', 'qualityGrade'),
    ]);

    return { brand, model, category, qualityGrade };
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
    const product = await this.findById(productId);
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
    qualityGrade: QualityGrade.Original,
    stockQuantity: 42,
    basePrice: 85,
    tieredPricing: [
      { minQty: 5, price: 78 },
      { minQty: 20, price: 72 },
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=800&q=80',
    sku: 'SCR-IP14-ORG',
    isActive: true,
  },
  {
    title: 'iPhone 14 LCD Assembly',
    brand: 'Apple',
    model: 'iPhone 14',
    category: 'Screens',
    qualityGrade: QualityGrade.HighCopy,
    stockQuantity: 3,
    basePrice: 45,
    tieredPricing: [
      { minQty: 5, price: 40 },
      { minQty: 10, price: 36 },
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
    sku: 'SCR-IP14-HC',
    isActive: true,
  },
  {
    title: 'Samsung S23 Battery',
    brand: 'Samsung',
    model: 'Galaxy S23',
    category: 'Batteries',
    qualityGrade: QualityGrade.Original,
    stockQuantity: 120,
    basePrice: 28,
    tieredPricing: [
      { minQty: 10, price: 24 },
      { minQty: 50, price: 21 },
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=800&q=80',
    sku: 'BAT-S23-ORG',
    isActive: true,
  },
  {
    title: 'Xiaomi Redmi Note 12 Charging Port',
    brand: 'Xiaomi',
    model: 'Redmi Note 12',
    category: 'Charging Ports',
    qualityGrade: QualityGrade.Copy,
    stockQuantity: 8,
    basePrice: 6.5,
    tieredPricing: [{ minQty: 20, price: 5.2 }],
    imageUrl:
      'https://images.unsplash.com/photo-1580910051074-3eb694886505?w=800&q=80',
    sku: 'CHG-RN12-CPY',
    isActive: true,
  },
  {
    title: 'Huawei P30 Back Glass',
    brand: 'Huawei',
    model: 'P30',
    category: 'Back Covers',
    qualityGrade: QualityGrade.Used,
    stockQuantity: 0,
    basePrice: 12,
    tieredPricing: [],
    imageUrl:
      'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=800&q=80',
    sku: 'BCK-P30-USED',
    isActive: true,
  },
  {
    title: 'iPhone 13 Camera Lens',
    brand: 'Apple',
    model: 'iPhone 13',
    category: 'Cameras',
    qualityGrade: QualityGrade.HighCopy,
    stockQuantity: 55,
    basePrice: 9,
    tieredPricing: [
      { minQty: 5, price: 8 },
      { minQty: 25, price: 6.5 },
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80',
    sku: 'CAM-IP13-HC',
    isActive: true,
  },
];
