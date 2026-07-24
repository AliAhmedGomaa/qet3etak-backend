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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { imageUploadOptions } from '../common/multer-image';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { AdminOnly, ShopOrAdmin } from '../auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CalculateCartDto,
  CatalogQueryDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { ProductsService } from './products.service';
import { examples } from '../swagger/examples';

const productImageUpload = FileInterceptor(
  'image',
  imageUploadOptions('product'),
);

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('wholesale/catalog')
  @ApiTags('Wholesale — Catalog')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Browse wholesale catalog (paginated + filtered)' })
  @ApiOkResponse({
    description: 'Paginated catalog',
    schema: { example: examples('catalogResponse').catalogResponse.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  catalog(@Query() query: CatalogQueryDto) {
    return this.productsService.searchCatalog(query);
  }

  @Get('wholesale/catalog/facets')
  @ApiTags('Wholesale — Catalog')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get available filter facets for the catalog' })
  @ApiOkResponse({
    description: 'Facet values',
    schema: { example: examples('catalogFacets').catalogFacets.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  facets(@Query() query: CatalogQueryDto) {
    return this.productsService.getFacets(query);
  }

  @Post('wholesale/cart/calculate')
  @ApiTags('Wholesale — Catalog')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Calculate cart totals with tiered pricing' })
  @ApiBody({ type: CalculateCartDto, examples: examples('calculateCartRequest') })
  @ApiOkResponse({
    description: 'Priced cart',
    schema: {
      example: examples('calculateCartResponse').calculateCartResponse.value,
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  calculateCart(@Body() dto: CalculateCartDto) {
    return this.productsService.calculateCart(dto);
  }

  @Get('wholesale/products/:id/quote')
  @ApiTags('Wholesale — Catalog')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a price quote for a single product line' })
  @ApiOkResponse({
    description: 'Single-line quote',
    schema: { example: examples('quoteResponse').quoteResponse.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  quote(@Param('id') id: string, @Query('quantity') quantity = '1') {
    return this.productsService.quoteLine(id, Number(quantity) || 1);
  }

  @Get('wholesale/products/:id')
  @ApiTags('Wholesale — Catalog')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get catalog product details' })
  @ApiOkResponse({
    description: 'Catalog product card',
    schema: { example: examples('catalogProduct').catalogProduct.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  catalogProduct(@Param('id') id: string) {
    return this.productsService.getCatalogProduct(id);
  }

  @Get('admin/products')
  @ApiTags('Admin — Products')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all products (admin, paginated + search)' })
  @ApiOkResponse({
    description: 'Paginated products',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  listAdmin(@Query() query: PaginationQueryDto) {
    return this.productsService.findAllAdmin(query.page, query.limit, query.q);
  }

  @Post('admin/products')
  @ApiTags('Admin — Products')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Create a product (admin)',
    description: 'Multipart form: text fields + required `image` (jpeg/png/webp, max 8MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'title',
        'brand',
        'model',
        'category',
        'stockQuantity',
        'basePrice',
        'image',
      ],
      properties: {
        title: { type: 'string', example: 'Samsung S23 Battery' },
        brand: { type: 'string', example: 'Samsung' },
        model: { type: 'string', example: 'Galaxy S23' },
        category: { type: 'string', example: 'Batteries' },
        part: { type: 'string', example: 'Battery Pack' },
        qualityId: {
          type: 'string',
          example: '6a5e04e311d9cd2142b060e1',
          description: 'Preferred: Quality document id',
        },
        qualityGrade: {
          type: 'string',
          example: 'Original',
          description: 'Quality name when qualityId is omitted',
        },
        stockQuantity: { type: 'number', example: 100 },
        basePrice: { type: 'number', example: 28 },
        tieredPricing: {
          type: 'string',
          description: 'JSON-encoded array of { minQty, price }',
          example: JSON.stringify([
            { minQty: 10, price: 24 },
            { minQty: 50, price: 21 },
          ]),
        },
        sku: { type: 'string', example: 'BAT-S23-ORG' },
        isActive: { type: 'boolean', example: true },
        image: {
          type: 'string',
          format: 'binary',
          description: 'Product image',
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
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
  @ApiTags('Admin — Products')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get a product by ID (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  getOne(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Patch('admin/products/:id')
  @ApiTags('Admin — Products')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update a product (admin)',
    description: 'Multipart form: text fields + optional `image` (jpeg/png/webp, max 8MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', example: 'Samsung S23 Battery' },
        brand: { type: 'string', example: 'Samsung' },
        model: { type: 'string', example: 'Galaxy S23' },
        category: { type: 'string', example: 'Batteries' },
        part: { type: 'string', example: 'Battery Pack' },
        qualityId: {
          type: 'string',
          example: '6a5e04e311d9cd2142b060e1',
          description: 'Preferred: Quality document id',
        },
        qualityGrade: {
          type: 'string',
          example: 'Original',
          description: 'Quality name when qualityId is omitted',
        },
        stockQuantity: { type: 'number', example: 100 },
        basePrice: { type: 'number', example: 28 },
        tieredPricing: {
          type: 'string',
          description: 'JSON-encoded array of { minQty, price }',
          example: JSON.stringify([
            { minQty: 10, price: 24 },
            { minQty: 50, price: 21 },
          ]),
        },
        sku: { type: 'string', example: 'BAT-S23-ORG' },
        isActive: { type: 'boolean', example: true },
        image: {
          type: 'string',
          format: 'binary',
          description: 'Product image (optional; keeps existing if omitted)',
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  @UseInterceptors(productImageUpload)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.productsService.update(id, dto, file?.filename);
  }

  @Delete('admin/products/:id')
  @ApiTags('Admin — Products')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a product (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }
}
