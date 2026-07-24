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
import { UserRole } from '../common/enums/user.enums';
import { PurchaseOrderStatus } from '../common/enums/purchasing.enums';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class PurchasingController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  // ---- Suppliers ----
  @Get('suppliers')
  listSuppliers(@Query() query: PaginatedStatusQueryDto) {
    return this.suppliersService.findAll(query.page, query.limit);
  }

  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Get('suppliers/:id')
  getSupplier(@Param('id') id: string) {
    return this.suppliersService.findById(id);
  }

  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete('suppliers/:id')
  removeSupplier(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }

  @Post('suppliers/:id/payments')
  paySupplier(@Param('id') id: string, @Body() dto: SupplierPaymentDto) {
    return this.suppliersService.recordPayment(id, dto.amount);
  }

  // ---- Purchase Orders ----
  @Get('purchase-orders')
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
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(dto);
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrdersService.findById(id);
  }

  @Patch('purchase-orders/:id')
  updatePurchaseOrder(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(id, dto);
  }

  @Patch('purchase-orders/:id/status')
  updatePurchaseOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchaseOrdersService.updateStatus(id, dto.status);
  }

  @Delete('purchase-orders/:id')
  removePurchaseOrder(@Param('id') id: string) {
    return this.purchaseOrdersService.remove(id);
  }
}
