import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { absoluteMediaUrl } from '../common/media-url';
import {
  normalizePagination,
  paginatedResult,
  type PaginatedResult,
} from '../common/pagination';
import { UsersService } from '../users/users.service';
import {
  CreateShopProductDto,
  UpdateShopProductDto,
} from './dto/shop-product.dto';
import { ShopProduct, ShopProductDocument } from './schemas/shop-product.schema';

@Injectable()
export class ShopProductsService {
  constructor(
    @InjectModel(ShopProduct.name)
    private readonly productModel: Model<ShopProduct>,
    private readonly usersService: UsersService,
  ) {}

  async listForShop(
    shopId: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const p = normalizePagination(page, limit, 50);
    const filter = { shopId: new Types.ObjectId(shopId) };
    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async listPublicByShopKey(
    shopKey: string,
    page?: number,
    limit?: number,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const shop = await this.usersService.findApprovedShopByKey(shopKey);
    const branding = this.usersService.getCustomerAppView(shop);
    if (branding.enabled === false) {
      throw new NotFoundException('Shop customer app is not enabled');
    }
    const p = normalizePagination(page, limit, 50);
    const filter = {
      shopId: shop._id,
      isActive: true,
    };
    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .skip(p.skip)
        .limit(p.limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);
    return paginatedResult(
      items.map((item) => this.toView(item)),
      total,
      p.page,
      p.limit,
    );
  }

  async create(
    shopId: string,
    dto: CreateShopProductDto,
    imageFilename?: string,
  ): Promise<Record<string, unknown>> {
    const created = await this.productModel.create({
      shopId: new Types.ObjectId(shopId),
      title: dto.title.trim(),
      description: dto.description?.trim() || '',
      price: Number(dto.price) || 0,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive !== false,
      imageUrl: imageFilename ? `/uploads/${imageFilename}` : '',
    });
    return this.toView(created);
  }

  async update(
    shopId: string,
    id: string,
    dto: UpdateShopProductDto,
    imageFilename?: string,
  ): Promise<Record<string, unknown>> {
    const product = await this.findOwnedOrFail(shopId, id);
    if (dto.title !== undefined) product.title = dto.title.trim();
    if (dto.description !== undefined) {
      product.description = dto.description.trim();
    }
    if (dto.price !== undefined) product.price = Number(dto.price) || 0;
    if (dto.sortOrder !== undefined) product.sortOrder = Number(dto.sortOrder) || 0;
    if (dto.isActive !== undefined) product.isActive = dto.isActive;
    if (imageFilename) product.imageUrl = `/uploads/${imageFilename}`;
    await product.save();
    return this.toView(product);
  }

  async remove(shopId: string, id: string): Promise<{ deleted: true }> {
    const product = await this.findOwnedOrFail(shopId, id);
    await product.deleteOne();
    return { deleted: true };
  }

  private async findOwnedOrFail(
    shopId: string,
    id: string,
  ): Promise<ShopProductDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Product not found');
    }
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    if (String(product.shopId) !== shopId) {
      throw new ForbiddenException('Product does not belong to this shop');
    }
    return product;
  }

  private toView(doc: ShopProductDocument): Record<string, unknown> {
    const json = doc.toJSON() as unknown as Record<string, unknown>;
    const imageUrl =
      typeof json.imageUrl === 'string' && json.imageUrl
        ? absoluteMediaUrl(json.imageUrl)
        : '';
    return { ...json, imageUrl };
  }
}
