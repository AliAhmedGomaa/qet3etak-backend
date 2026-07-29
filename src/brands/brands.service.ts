import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { absoluteMediaUrl } from '../common/media-url';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { Brand, BrandDocument } from './schemas/brand.schema';

const DEFAULT_BRANDS: Array<{ name: string; iconUrl: string; sortOrder: number }> = [
  { name: 'Apple', iconUrl: 'https://cdn.simpleicons.org/apple/000000', sortOrder: 1 },
  { name: 'Samsung', iconUrl: 'https://cdn.simpleicons.org/samsung/1428A0', sortOrder: 2 },
  { name: 'Xiaomi', iconUrl: 'https://cdn.simpleicons.org/xiaomi/FF6900', sortOrder: 3 },
  { name: 'Huawei', iconUrl: 'https://cdn.simpleicons.org/huawei/CF0A2C', sortOrder: 4 },
  { name: 'Oppo', iconUrl: 'https://cdn.simpleicons.org/oppo/1BA784', sortOrder: 5 },
  { name: 'OnePlus', iconUrl: 'https://cdn.simpleicons.org/oneplus/F5010C', sortOrder: 6 },
  { name: 'Realme', iconUrl: 'https://cdn.simpleicons.org/realme/FFC915', sortOrder: 7 },
  { name: 'Google', iconUrl: 'https://cdn.simpleicons.org/google/4285F4', sortOrder: 8 },
  { name: 'Sony', iconUrl: 'https://cdn.simpleicons.org/sony/000000', sortOrder: 9 },
  { name: 'Nokia', iconUrl: 'https://cdn.simpleicons.org/nokia/124191', sortOrder: 10 },
];

@Injectable()
export class BrandsService implements OnModuleInit {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Seed defaults only on a fresh empty DB. Never re-create brands that an
    // admin deleted — Vercel cold starts must not resurrect them.
    const count = await this.brandModel.estimatedDocumentCount().exec();
    if (count > 0) return;

    for (const item of DEFAULT_BRANDS) {
      try {
        await this.brandModel.create({ ...item, isActive: true });
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        if (code !== 11000) throw err;
      }
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
      this.brandModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.brandModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toBrandView(item)),
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
      this.brandModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.brandModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toBrandView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async findByIdOrFail(id: string): Promise<BrandDocument> {
    const brand = await this.brandModel.findById(id).exec();
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async findByName(name: string): Promise<BrandDocument | null> {
    return this.brandModel
      .findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') })
      .exec();
  }

  async create(
    dto: CreateBrandDto,
    iconFilename?: string,
  ): Promise<Record<string, unknown>> {
    const name = dto.name.trim();
    const existing = await this.findByName(name);
    if (existing) {
      throw new ConflictException('Brand name already exists');
    }

    const iconUrl =
      iconFilename != null
        ? `/uploads/${iconFilename}`
        : dto.iconUrl?.trim() || '';

    const brand = await this.brandModel.create({
      name,
      iconUrl,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.toBrandView(brand);
  }

  async update(
    id: string,
    dto: UpdateBrandDto,
    iconFilename?: string,
  ): Promise<Record<string, unknown>> {
    const brand = await this.findByIdOrFail(id);

    if (dto.name != null) {
      const name = dto.name.trim();
      const clash = await this.findByName(name);
      if (clash && String(clash._id) !== String(brand._id)) {
        throw new ConflictException('Brand name already exists');
      }
      brand.name = name;
    }

    if (iconFilename != null) {
      brand.iconUrl = `/uploads/${iconFilename}`;
    } else if (dto.iconUrl != null) {
      brand.iconUrl = dto.iconUrl.trim();
    }

    if (dto.isActive != null) brand.isActive = dto.isActive;
    if (dto.sortOrder != null) brand.sortOrder = dto.sortOrder;

    await brand.save();
    return this.toBrandView(brand);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.brandModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Brand not found');
    return { deleted: true };
  }

  private toBrandView(brand: BrandDocument): Record<string, unknown> {
    const json = brand.toJSON() as unknown as Record<string, unknown>;
    return {
      ...json,
      iconUrl: absoluteMediaUrl(
        typeof json.iconUrl === 'string' ? json.iconUrl : '',
      ),
    };
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive partial name match filter (empty when no query). */
function buildNameFilter(q?: string): Record<string, unknown> {
  const term = q?.trim();
  if (!term) return {};
  return { name: new RegExp(escapeRegex(term), 'i') };
}
