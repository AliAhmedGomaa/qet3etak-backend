import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user.enums';
import {
  InventoryReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
import { isCsvExport, ReportsService } from './reports.service';

@ApiTags('Admin — Reports')
@ApiBearerAuth('JWT')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard KPIs for a date range' })
  getSummary(@Query() query: ReportQueryDto) {
    return this.reportsService.getSummary(query.from, query.to);
  }

  @Get('sales')
  @ApiOperation({
    summary: 'Sales / orders report (by status, payment method, day)',
  })
  @ApiProduces('application/json', 'text/csv')
  async getSales(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getSales(
      query.from,
      query.to,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  @Get('shops')
  @ApiOperation({ summary: 'Shop performance ranking by revenue' })
  @ApiProduces('application/json', 'text/csv')
  async getShops(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getShops(
      query.from,
      query.to,
      query.page,
      query.limit,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  @Get('products')
  @ApiOperation({ summary: 'Top products by quantity and revenue' })
  @ApiProduces('application/json', 'text/csv')
  async getProducts(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getProducts(
      query.from,
      query.to,
      query.page,
      query.limit,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  @Get('credit')
  @ApiOperation({
    summary: 'Credit / wallet outstanding balances and movements summary',
  })
  @ApiProduces('application/json', 'text/csv')
  async getCredit(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getCredit(
      query.from,
      query.to,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  @Get('delivery')
  @ApiOperation({ summary: 'Delivery report by courier (fees & counts)' })
  @ApiProduces('application/json', 'text/csv')
  async getDelivery(
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getDelivery(
      query.from,
      query.to,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  @Get('inventory')
  @ApiOperation({
    summary: 'Inventory valuation and low-stock list (point-in-time)',
  })
  @ApiProduces('application/json', 'text/csv')
  @ApiOkResponse({ description: 'Inventory summary + low-stock page' })
  async getInventory(
    @Query() query: InventoryReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getInventory(
      query.page,
      query.limit,
      query.lowStockThreshold ?? 10,
      query.format ?? 'json',
    );
    return this.respond(result, res);
  }

  private respond(result: unknown, res: Response) {
    if (isCsvExport(result)) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      return new StreamableFile(Buffer.from(result.csv, 'utf-8'));
    }
    return result;
  }
}
