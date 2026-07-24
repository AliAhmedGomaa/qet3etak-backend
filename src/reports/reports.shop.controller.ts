import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user.enums';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('Wholesale — Reports')
@ApiBearerAuth('JWT')
@Controller('wholesale/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
export class ShopReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('my-orders')
  @ApiOperation({
    summary: 'My shop orders summary for a date range',
  })
  @ApiOkResponse({ description: 'Shop-scoped sales summary' })
  @RequireApproved()
  myOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getMyOrdersSummary(
      user.userId,
      query.from,
      query.to,
    );
  }
}
