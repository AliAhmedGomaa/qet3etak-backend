import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { ShopProductsService } from './shop-products.service';

@ApiTags('C2B — Shop products')
@Controller('c2b')
export class C2bShopProductsController {
  constructor(private readonly productsService: ShopProductsService) {}

  @Get('shops/:shopKey/products')
  @ApiOperation({
    summary: 'Public list of active products for a shop (id or slug)',
  })
  list(
    @Param('shopKey') shopKey: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.productsService.listPublicByShopKey(
      shopKey,
      query.page,
      query.limit,
    );
  }
}
