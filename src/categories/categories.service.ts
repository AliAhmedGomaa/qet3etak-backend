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
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  async listAll(
    page?: number,
    limit?: number,
    q?: string,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 20);
    const filter = buildNameFilter(q);
    const [items, total] = await Promise.all([
      this.categoryModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.categoryModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toCategoryView(item)),
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
      this.categoryModel
        .find(filter)
        .sort({ sortOrder: 1, name: 1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.categoryModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toCategoryView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async findByIdOrFail(id: string): Promise<CategoryDocument> {
    const category = await this.categoryModel.findById(id).exec();
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async findByName(name: string): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findOne({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i') })
      .exec();
  }

  async create(
    dto: CreateCategoryDto,
    iconFilename?: string,
  ): Promise<Record<string, unknown>> {
    const name = dto.name.trim();
    const existing = await this.findByName(name);
    if (existing) {
      throw new ConflictException('Category name already exists');
    }

    const iconUrl =
      iconFilename != null
        ? `/uploads/${iconFilename}`
        : dto.iconUrl?.trim() || '';

    const category = await this.categoryModel.create({
      name,
      iconUrl,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.toCategoryView(category);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    iconFilename?: string,
  ): Promise<Record<string, unknown>> {
    const category = await this.findByIdOrFail(id);

    if (dto.name != null) {
      const name = dto.name.trim();
      const clash = await this.findByName(name);
      if (clash && String(clash._id) !== String(category._id)) {
        throw new ConflictException('Category name already exists');
      }
      category.name = name;
    }

    if (iconFilename != null) {
      category.iconUrl = `/uploads/${iconFilename}`;
    } else if (dto.iconUrl != null) {
      category.iconUrl = dto.iconUrl.trim();
    }

    if (dto.isActive != null) category.isActive = dto.isActive;
    if (dto.sortOrder != null) category.sortOrder = dto.sortOrder;

    await category.save();
    return this.toCategoryView(category);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const res = await this.categoryModel.findByIdAndDelete(id).exec();
    if (!res) throw new NotFoundException('Category not found');
    return { deleted: true };
  }

  private toCategoryView(category: CategoryDocument): Record<string, unknown> {
    const json = category.toJSON() as unknown as Record<string, unknown>;
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
