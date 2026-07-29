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
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';

const DEFAULT_CATEGORIES: Array<{
  name: string;
  iconUrl: string;
  sortOrder: number;
}> = [
  { name: 'Screens', iconUrl: '', sortOrder: 1 },
  { name: 'Batteries', iconUrl: '', sortOrder: 2 },
  { name: 'Charging Ports', iconUrl: '', sortOrder: 3 },
  { name: 'Back Covers', iconUrl: '', sortOrder: 4 },
  { name: 'Cameras', iconUrl: '', sortOrder: 5 },
  { name: 'Speakers', iconUrl: '', sortOrder: 6 },
  { name: 'Flex Cables', iconUrl: '', sortOrder: 7 },
  { name: 'Buttons', iconUrl: '', sortOrder: 8 },
  { name: 'Adhesives', iconUrl: '', sortOrder: 9 },
  { name: 'Tools', iconUrl: '', sortOrder: 10 },
];

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Seed defaults only when the collection is empty — do not resurrect
    // categories an admin intentionally deleted (serverless cold starts).
    const count = await this.categoryModel.estimatedDocumentCount().exec();
    if (count > 0) return;

    for (const item of DEFAULT_CATEGORIES) {
      try {
        await this.categoryModel.create({ ...item, isActive: true });
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
