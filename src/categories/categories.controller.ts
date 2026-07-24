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
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { imageUploadOptions } from '../common/multer-image';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { examples } from '../swagger/examples';

const iconUpload = FileInterceptor(
  'icon',
  imageUploadOptions('category', { allowSvg: true }),
);

@Controller()
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('wholesale/categories')
  @ApiTags('Wholesale — Categories')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List active categories for shop catalog / home' })
  @ApiOkResponse({
    description: 'Paginated categories',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SHOP_OWNER, UserRole.ADMIN)
  @RequireApproved()
  listWholesale(@Query() query: PaginationQueryDto) {
    return this.categoriesService.listActive(query.page, query.limit, query.q);
  }

  @Get('admin/categories')
  @ApiTags('Admin — Categories')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all categories (admin, paginated)' })
  @ApiOkResponse({
    description: 'Paginated categories',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listAdmin(@Query() query: PaginationQueryDto) {
    return this.categoriesService.listAll(query.page, query.limit, query.q);
  }

  @Post('admin/categories')
  @ApiTags('Admin — Categories')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Create a category (admin)',
    description: 'Multipart form: text fields + optional `icon` image (jpeg/png/webp/svg, max 3MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Microphones' },
        sortOrder: { type: 'number', example: 11 },
        isActive: { type: 'boolean', example: true },
        icon: {
          type: 'string',
          format: 'binary',
          description: 'Category icon',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Created category',
    schema: { example: examples('category').category.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(iconUpload)
  create(
    @Body() dto: CreateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.categoriesService.create(dto, file?.filename);
  }

  @Patch('admin/categories/:id')
  @ApiTags('Admin — Categories')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update a category (admin)',
    description: 'Multipart form: text fields + optional `icon` image (jpeg/png/webp/svg, max 4MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Microphones' },
        sortOrder: { type: 'number', example: 11 },
        isActive: { type: 'boolean', example: true },
        icon: {
          type: 'string',
          format: 'binary',
          description: 'Category icon (optional; keeps existing if omitted)',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Updated category',
    schema: { example: examples('category').category.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(iconUpload)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.categoriesService.update(id, dto, file?.filename);
  }

  @Delete('admin/categories/:id')
  @ApiTags('Admin — Categories')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a category (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
