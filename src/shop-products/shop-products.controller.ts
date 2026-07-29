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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { imageUploadOptions } from '../common/multer-image';
import {
  CreateShopProductDto,
  UpdateShopProductDto,
} from './dto/shop-product.dto';
import { ShopProductsService } from './shop-products.service';

@ApiTags('Wholesale — Shop products (customer app)')
@Controller('wholesale/shop-products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
@RequireApproved()
@ApiBearerAuth('JWT')
export class ShopProductsController {
  constructor(private readonly productsService: ShopProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List this shop’s customer-app products' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.productsService.listForShop(
      user.userId,
      query.page,
      query.limit,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a customer-app product' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        price: { type: 'number' },
        sortOrder: { type: 'number' },
        isActive: { type: 'boolean' },
        image: { type: 'string', format: 'binary' },
      },
      required: ['title', 'price'],
    },
  })
  @UseInterceptors(
    FileInterceptor('image', imageUploadOptions('shop-product')),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateShopProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.productsService.create(user.userId, dto, file?.filename);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer-app product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', imageUploadOptions('shop-product')),
  )
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShopProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.productsService.update(
      user.userId,
      id,
      dto,
      file?.filename,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a customer-app product' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(user.userId, id);
  }
}
