import {
  ConflictException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class BrandsService {
  constructor(
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
  ) {}

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
