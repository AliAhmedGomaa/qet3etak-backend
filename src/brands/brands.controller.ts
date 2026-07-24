import {
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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { ensureUploadsDir } from '../common/uploads';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BrandsService } from './brands.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';
import { examples } from '../swagger/examples';

const iconUpload = FileInterceptor('icon', {
  storage: diskStorage({
    destination: (_req, _file, cb) => cb(null, ensureUploadsDir()),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `brand-${unique}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp|svg\+xml)$/)) {
      return cb(new Error('Only image uploads are allowed'), false);
    }
    cb(null, true);
  },
});

@Controller()
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  /** Active brands for shop catalog / home (name + icon). */
  @Get('wholesale/brands')
  @ApiTags('Wholesale — Brands')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List active brands for shop catalog / home' })
  @ApiOkResponse({
    description: 'Paginated brands',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  listWholesale(@Query() query: PaginationQueryDto) {
    return this.brandsService.listActive(query.page, query.limit, query.q);
  }

  @Get('admin/brands')
  @ApiTags('Admin — Brands')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all brands (admin, paginated)' })
  @ApiOkResponse({
    description: 'Paginated brands',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAdmin(@Query() query: PaginationQueryDto) {
    return this.brandsService.listAll(query.page, query.limit, query.q);
  }

  @Post('admin/brands')
  @ApiTags('Admin — Brands')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Create a brand (admin)',
    description: 'Multipart form: text fields + optional `icon` image (jpeg/png/webp/svg, max 4MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Nothing' },
        sortOrder: { type: 'number', example: 11 },
        isActive: { type: 'boolean', example: true },
        icon: {
          type: 'string',
          format: 'binary',
          description: 'Brand icon',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Created brand',
    schema: { example: examples('brand').brand.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(iconUpload)
  create(
    @Body() dto: CreateBrandDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.brandsService.create(dto, file?.filename);
  }

  @Patch('admin/brands/:id')
  @ApiTags('Admin — Brands')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update a brand (admin)',
    description: 'Multipart form: text fields + optional `icon` image (jpeg/png/webp/svg, max 4MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Nothing' },
        sortOrder: { type: 'number', example: 11 },
        isActive: { type: 'boolean', example: true },
        icon: {
          type: 'string',
          format: 'binary',
          description: 'Brand icon (optional; keeps existing if omitted)',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated brand',
    schema: { example: examples('brand').brand.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(iconUpload)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.brandsService.update(id, dto, file?.filename);
  }

  @Delete('admin/brands/:id')
  @ApiTags('Admin — Brands')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a brand (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.brandsService.remove(id);
  }
}
