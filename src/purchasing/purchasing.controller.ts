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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PurchaseOrderStatus } from '../common/enums/purchasing.enums';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import {
  CreateSupplierDto,
  SupplierPaymentDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
} from './dto/purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { SuppliersService } from './suppliers.service';
import { examples } from '../swagger/examples';

@ApiTags('Admin — Purchasing')
@ApiBearerAuth('JWT')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
export class PurchasingController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  // ---- Suppliers ----
  @Get('suppliers')
  @ApiOperation({ summary: 'List suppliers (paginated)' })
  listSuppliers(@Query() query: PaginatedStatusQueryDto) {
    return this.suppliersService.findAll(query.page, query.limit);
  }

  @Post('suppliers')
  @ApiOperation({ summary: 'Create a supplier' })
  @ApiBody({ schema: {}, examples: examples('createSupplierRequest') })
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get('suppliers/:id')
  @ApiOperation({ summary: 'Get a supplier by id' })
  getSupplier(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }

  @Patch('suppliers/:id')
  @ApiOperation({ summary: 'Update a supplier' })
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete('suppliers/:id')
  @ApiOperation({ summary: 'Delete a supplier' })
  removeSupplier(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }

  @Post('suppliers/:id/payments')
  @ApiOperation({ summary: 'Record a payment made to a supplier' })
  @ApiBody({ schema: {}, examples: examples('supplierPaymentRequest') })
  paySupplier(@Param('id') id: string, @Body() dto: SupplierPaymentDto) {
    return this.suppliersService.recordPayment(id, dto.amount);
  }

  // ---- Purchase Orders ----
  @Get('purchase-orders')
  @ApiOperation({ summary: 'List purchase orders (paginated, filter by status)' })
  listPurchaseOrders(@Query() query: PaginatedStatusQueryDto) {
    let status: PurchaseOrderStatus | undefined;
    if (query.status) {
      if (
        !Object.values(PurchaseOrderStatus).includes(
          query.status as PurchaseOrderStatus,
        )
      ) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(PurchaseOrderStatus).join(', ')}`,
        );
      }
      status = query.status as PurchaseOrderStatus;
    }
    return this.purchaseOrdersService.findAll(query.page, query.limit, status);
  }

  @Post('purchase-orders')
  @ApiOperation({ summary: 'Create a purchase order' })
  @ApiBody({ schema: {}, examples: examples('createPurchaseOrderRequest') })
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Get('purchase-orders/:id')
  @ApiOperation({ summary: 'Get a purchase order by id' })
  getPurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrdersService.findById(id);
  }

  @Patch('purchase-orders/:id')
  @ApiOperation({ summary: 'Update a purchase order' })
  updatePurchaseOrder(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(id, dto);
  }

  @Patch('purchase-orders/:id/status')
  @ApiOperation({
    summary: 'Update purchase order status (RECEIVED increments stock)',
  })
  @ApiBody({
    schema: {},
    examples: examples('updatePurchaseOrderStatusRequest'),
  })
  updatePurchaseOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchaseOrdersService.updateStatus(id, dto.status);
  }

  @Delete('purchase-orders/:id')
  @ApiOperation({ summary: 'Delete a purchase order' })
  removePurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrdersService.remove(id);
  }
}
