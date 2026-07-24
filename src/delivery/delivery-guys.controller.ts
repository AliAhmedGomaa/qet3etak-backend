import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DeliveryGuyStatus } from '../common/enums/delivery.enums';
import { PaginationQueryDto } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import {
  CalculateDeliveryFeeDto,
  CreateDeliveryGuyDto,
  UpdateDeliveryGuyDto,
} from './dto/delivery-guy.dto';
import { DeliveryGuysService } from './delivery-guys.service';

@ApiTags('Admin — Delivery')
@ApiBearerAuth('JWT')
@Controller('admin/delivery-guys')
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
export class DeliveryGuysController {
  constructor(private readonly deliveryGuysService: DeliveryGuysService) {}

  @Get()
  @ApiOperation({ summary: 'List delivery guys (paginated)' })
  list(
    @Query() query: PaginationQueryDto,
    @Query('status') status?: DeliveryGuyStatus,
  ) {
    return this.deliveryGuysService.findAll(
      query.page,
      query.limit,
      query.q,
      status,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Register a delivery guy' })
  create(@Body() dto: CreateDeliveryGuyDto) {
    return this.deliveryGuysService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery guy' })
  get(@Param('id') id: string) {
    return this.deliveryGuysService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a delivery guy / fee settings' })
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryGuyDto) {
    return this.deliveryGuysService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a delivery guy' })
  async remove(@Param('id') id: string) {
    await this.deliveryGuysService.remove(id);
    return { ok: true };
  }

  @Post(':id/calculate-fee')
  @ApiOperation({
    summary: 'Preview delivery fee for an order using this courier’s settings',
  })
  calculateFee(
    @Param('id') id: string,
    @Body() dto: CalculateDeliveryFeeDto,
  ) {
    return this.deliveryGuysService.calculateFeeForGuy(id, dto);
  }
}
