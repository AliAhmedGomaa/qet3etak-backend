import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QualityGrade } from '../common/enums/product.enums';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CreateQualityDto, UpdateQualityDto } from './dto/quality.dto';
import { Quality, QualityDocument } from './schemas/quality.schema';

const DEFAULT_QUALITIES: Array<{
  name: string;
  code: string;
  description: string;
  sortOrder: number;
}> = [
  {
    name: QualityGrade.Original,
    code: 'original',
    description: 'Genuine / original manufacturer quality',
    sortOrder: 1,
  },
  {
    name: QualityGrade.HighCopy,
    code: 'high-copy',
    description: 'High-quality aftermarket / high copy',
    sortOrder: 2,
  },
  {
    name: QualityGrade.Copy,
    code: 'copy',
    description: 'Standard aftermarket copy',
    sortOrder: 3,
  },
  {
    name: QualityGrade.Used,
    code: 'used',
    description: 'Used / refurbished',
    sortOrder: 4,
  },
];

/** Canonical names for common import aliases. */
const QUALITY_ALIASES: Record<string, string> = {
  original: QualityGrade.Original,
  org: QualityGrade.Original,
  oem: 'OEM',
  aftermarket: 'Aftermarket',
  highcopy: QualityGrade.HighCopy,
  'high copy': QualityGrade.HighCopy,
  'high-copy': QualityGrade.HighCopy,
  hc: QualityGrade.HighCopy,
  copy: QualityGrade.Copy,
  used: QualityGrade.Used,
};

@Injectable()
export class QualitiesService implements OnModuleInit {
  constructor(
    @InjectModel(Quality.name) private readonly qualityModel: Model<Quality>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
    await this.backfillFromProducts();
  }

  private async seedDefaults(): Promise<void> {
    for (const item of DEFAULT_QUALITIES) {
      const exists = await this.qualityModel
        .findOne({
          $or: [
            { name: item.name },
            { code: item.code },
          ],
        })
        .select('_id')
        .lean()
        .exec();
      if (exists) continue;
      try {
        await this.qualityModel.create({ ...item, isActive: true });
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        if (code !== 11000) throw err;
      }
    }
  }

  /** Ensure a Quality row exists for every distinct product.qualityGrade and link qualityId. */
  private async backfillFromProducts(): Promise<void> {
    const grades = await this.productModel.distinct('qualityGrade').exec();
    for (const raw of grades) {
      const name = typeof raw === 'string' ? raw.trim() : '';
      if (!name) continue;
      await this.findOrCreateByName(name);
    }

    const missing = await this.productModel
      .find({
        $or: [{ qualityId: { $exists: false } }, { qualityId: null }],
        qualityGrade: { $exists: true, $nin: [null, ''] },
      })
      .select('_id qualityGrade')
      .exec();

    for (const doc of missing as ProductDocument[]) {
      const quality = await this.findByName(doc.qualityGrade);
      if (!quality) continue;
      doc.qualityId = quality._id as Types.ObjectId;
      await doc.save();
    }
  }

  async listAll(
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = buildNameFilter(q);
    const [items, total] = await Promise.all([
      this.qualityModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.qualityModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toQualityView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async listActive(
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = { isActive: true, ...buildNameFilter(q) };
    const [items, total] = await Promise.all([
      this.qualityModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.qualityModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toQualityView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async findByIdOrFail(id: string): Promise<QualityDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Quality not found');
    }
    const quality = await this.qualityModel.findById(id).exec();
    if (!quality) throw new NotFoundException('Quality not found');
    return quality;
  }

  async findActiveByIdOrFail(id: string): Promise<QualityDocument> {
    const quality = await this.findByIdOrFail(id);
    if (!quality.isActive) {
      throw new BadRequestException('Quality is inactive');
    }
    return quality;
  }

  async findByName(name: string): Promise<QualityDocument | null> {
    return this.qualityModel
      .findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') })
      .exec();
  }

  async findByCode(code: string): Promise<QualityDocument | null> {
    return this.qualityModel
      .findOne({ code: slugify(code) })
      .exec();
  }

  /**
   * Resolve a quality string (name, code, or alias) to a Quality document,
   * creating one when missing (import / backfill).
   */
  async findOrCreateByName(raw: string): Promise<QualityDocument> {
    const canonical = canonicalizeQualityName(raw);
    if (!canonical) {
      throw new BadRequestException('Quality name is required');
    }

    const byName = await this.findByName(canonical);
    if (byName) return byName;

    const code = slugify(canonical);
    const byCode = await this.findByCode(code);
    if (byCode) return byCode;

    try {
      return await this.qualityModel.create({
        name: canonical,
        code,
        description: '',
        isActive: true,
        sortOrder: 100,
      });
    } catch (err: unknown) {
      const dup = (err as { code?: number })?.code;
      if (dup === 11000) {
        const again =
          (await this.findByName(canonical)) ?? (await this.findByCode(code));
        if (again) return again;
      }
      throw err;
    }
  }

  /**
   * Resolve product create/update quality fields.
   * Prefer qualityId when provided; otherwise resolve qualityGrade string.
   */
  async resolveForProduct(input: {
    qualityId?: string;
    qualityGrade?: string;
    /** When true, inactive qualities are rejected (admin create/update). */
    requireActive?: boolean;
  }): Promise<{ qualityId: Types.ObjectId; qualityGrade: string }> {
    const requireActive = input.requireActive ?? true;

    if (input.qualityId?.trim()) {
      const quality = requireActive
        ? await this.findActiveByIdOrFail(input.qualityId.trim())
        : await this.findByIdOrFail(input.qualityId.trim());
      return {
        qualityId: quality._id as Types.ObjectId,
        qualityGrade: quality.name,
      };
    }

    const grade = input.qualityGrade?.trim();
    if (!grade) {
      throw new BadRequestException('qualityId or qualityGrade is required');
    }

    const quality = await this.findOrCreateByName(grade);
    if (requireActive && !quality.isActive) {
      throw new BadRequestException('Quality is inactive');
    }
    return {
      qualityId: quality._id as Types.ObjectId,
      qualityGrade: quality.name,
    };
  }

  async create(dto: CreateQualityDto): Promise<Record<string, unknown>> {
    const name = dto.name.trim();
    const code = slugify(dto.code?.trim() || name);
    if (!code) {
      throw new BadRequestException('Quality code could not be derived');
    }

    const nameClash = await this.findByName(name);
    if (nameClash) {
      throw new ConflictException('Quality name already exists');
    }
    const codeClash = await this.findByCode(code);
    if (codeClash) {
      throw new ConflictException('Quality code already exists');
    }

    const quality = await this.qualityModel.create({
      name,
      code,
      description: dto.description?.trim() ?? '',
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.toQualityView(quality);
  }

  async update(
    id: string,
    dto: UpdateQualityDto,
  ): Promise<Record<string, unknown>> {
    const quality = await this.findByIdOrFail(id);
    const prevName = quality.name;

    if (dto.name != null) {
      const name = dto.name.trim();
      const clash = await this.findByName(name);
      if (clash && String(clash._id) !== String(quality._id)) {
        throw new ConflictException('Quality name already exists');
      }
      quality.name = name;
    }

    if (dto.code != null) {
      const code = slugify(dto.code);
      if (!code) {
        throw new BadRequestException('Quality code is invalid');
      }
      const clash = await this.findByCode(code);
      if (clash && String(clash._id) !== String(quality._id)) {
        throw new ConflictException('Quality code already exists');
      }
      quality.code = code;
    }

    if (dto.description != null) quality.description = dto.description.trim();
    if (dto.isActive != null) quality.isActive = dto.isActive;
    if (dto.sortOrder != null) quality.sortOrder = dto.sortOrder;

    await quality.save();

    // Keep denormalized product.qualityGrade in sync when the name changes
    if (quality.name !== prevName) {
      await this.productModel
        .updateMany(
          { qualityId: quality._id },
          { $set: { qualityGrade: quality.name } },
        )
        .exec();
    }

    return this.toQualityView(quality);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.qualityModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Quality not found');
    return { deleted: true };
  }

  private toQualityView(quality: QualityDocument): Record<string, unknown> {
    return quality.toJSON() as unknown as Record<string, unknown>;
  }
}

export function canonicalizeQualityName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const alias = QUALITY_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  return trimmed;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNameFilter(q?: string): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return {};
  const re = new RegExp(escapeRegex(term), 'i');
  return { $or: [{ name: re }, { code: re }, { description: re }] };
}
