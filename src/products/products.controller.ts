import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CalculateCartDto,
  CatalogQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';

const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

const productImageUpload = FileInterceptor('image', {
  storage: diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `product-${unique}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
      return cb(new Error('Only JPEG, PNG, or WebP images are allowed'), false);
    }
    cb(null, true);
  },
});

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('wholesale/catalog')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  catalog(@Query() query: CatalogQueryDto) {
    return this.productsService.searchCatalog(query);
  }

  @Get('wholesale/catalog/facets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  facets(@Query() query: CatalogQueryDto) {
    return this.productsService.getFacets(query);
  }

  @Post('wholesale/cart/calculate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  calculateCart(@Body() dto: CalculateCartDto) {
    return this.productsService.calculateCart(dto);
  }

  @Get('wholesale/products/:id/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  quote(@Param('id') id: string, @Query('quantity') quantity = '1') {
    return this.productsService.quoteLine(id, Number(quantity) || 1);
  }

  @Get('wholesale/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  catalogProduct(@Param('id') id: string) {
    return this.productsService.getCatalogProduct(id);
  }

  @Get('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAdmin(@Query() query: PaginationQueryDto) {
    return this.productsService.findAllAdmin(query.page, query.limit, query.q);
  }

  @Post('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(productImageUpload)
  create(
    @Body() dto: CreateProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.filename) {
      throw new BadRequestException('Product image upload is required');
    }
    return this.productsService.create(dto, file.filename);
  }

  @Get('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Patch('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(productImageUpload)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.productsService.update(id, dto, file?.filename);
  }

  @Delete('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
