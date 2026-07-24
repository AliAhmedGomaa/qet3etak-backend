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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { effectiveBranchScope } from '../common/branch-scope';
import {
  InventoryReportQueryDto,
  ReportQueryDto,
} from './dto/report-query.dto';
import { isCsvExport, ReportsService } from './reports.service';

@ApiTags('Admin — Reports')
@ApiBearerAuth('JWT')
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private scope(user: AuthUser, query: { branchId?: string }) {
    return effectiveBranchScope(user, query.branchId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard KPIs for a date range' })
  getSummary(@CurrentUser() user: AuthUser, @Query() query: ReportQueryDto) {
    return this.reportsService.getSummary(
      query.from,
      query.to,
      this.scope(user, query),
    );
  }

  @Get('sales')
  @ApiOperation({
    summary: 'Sales / orders report (by status, payment method, day)',
  })
  @ApiProduces('application/json', 'text/csv')
  async getSales(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getSales(
      query.from,
      query.to,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('shops')
  @ApiOperation({ summary: 'Shop performance ranking by revenue' })
  @ApiProduces('application/json', 'text/csv')
  async getShops(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getShops(
      query.from,
      query.to,
      query.page,
      query.limit,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('products')
  @ApiOperation({ summary: 'Top products by quantity and revenue' })
  @ApiProduces('application/json', 'text/csv')
  async getProducts(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getProducts(
      query.from,
      query.to,
      query.page,
      query.limit,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('credit')
  @ApiOperation({
    summary: 'Credit / wallet outstanding balances and movements summary',
  })
  @ApiProduces('application/json', 'text/csv')
  async getCredit(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getCredit(
      query.from,
      query.to,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('delivery')
  @ApiOperation({ summary: 'Delivery report by courier (fees & counts)' })
  @ApiProduces('application/json', 'text/csv')
  async getDelivery(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getDelivery(
      query.from,
      query.to,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('returns')
  @ApiOperation({ summary: 'Returns report by status and refund method' })
  @ApiProduces('application/json', 'text/csv')
  async getReturns(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportsService.getReturns(
      query.from,
      query.to,
      query.format ?? 'json',
      this.scope(user, query),
    );
    return this.respond(result, res);
  }

  @Get('inventory')
  @ApiOperation({
    summary: 'Inventory valuation and low-stock list (point-in-time, global HQ)',
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
