import {
  Body,
  Controller,
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
import { UserRole } from '../common/enums/user.enums';
import { PaginationQueryDto } from '../common/pagination';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AttachPartDto,
  CreateRepairBookingDto,
  CreateRepairTicketDto,
  UpdateRepairStatusDto,
} from './dto/repair.dto';
import { RepairService } from './repair.service';

@ApiTags('Shop — Repair Tickets')
@ApiBearerAuth('JWT')
@Controller('repair-tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
@RequireApproved()
export class ShopRepairController {
  constructor(private readonly repairService: RepairService) {}

  @Post()
  @ApiOperation({ summary: 'Create a repair ticket for a customer' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRepairTicketDto) {
    return this.repairService.createByShop(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List repair tickets for the current shop' })
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.repairService.listForShop(
      user.userId,
      query.page,
      query.limit,
      query.q,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one repair ticket' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.repairService.getForShop(user.userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update repair ticket status' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRepairStatusDto,
  ) {
    return this.repairService.updateStatus(user.userId, id, dto);
  }

  @Patch(':id/attach-part')
  @ApiOperation({
    summary: 'Attach inventory part and create B2B order',
    description:
      'Selects a Product, runs shop checkout (COD), sets status WAITING_FOR_PARTS.',
  })
  attachPart(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AttachPartDto,
  ) {
    return this.repairService.attachPart(user.userId, id, dto);
  }
}

@ApiTags('C2B — Public Repair')
@Controller('c2b')
export class C2bRepairController {
  constructor(private readonly repairService: RepairService) {}

  @Get('issues')
  @ApiOperation({ summary: 'Repair issue catalog for estimator' })
  issues() {
    return this.repairService.listIssues();
  }

  @Get('brands')
  @ApiOperation({ summary: 'Active brands for booking form' })
  brands(@Query() query: PaginationQueryDto) {
    return this.repairService.listBrands(query.page, query.limit, query.q);
  }

  @Get('estimate')
  @ApiOperation({ summary: 'Estimated cost range for an issue' })
  estimate(
    @Query('issueCode') issueCode: string,
    @Query('brandId') brandId?: string,
    @Query('deviceModel') deviceModel?: string,
  ) {
    return this.repairService.estimate(issueCode, brandId, deviceModel);
  }

  @Get('shops')
  @ApiOperation({ summary: 'Partner repair shops (approved)' })
  shops(
    @Query('city') city?: string,
    @Query() query?: PaginationQueryDto,
  ) {
    return this.repairService.listPartnerShops(
      city,
      query?.page,
      query?.limit,
    );
  }

  @Get('track/:ticketNumber')
  @ApiOperation({ summary: 'Public live ticket status + timeline' })
  track(@Param('ticketNumber') ticketNumber: string) {
    return this.repairService.trackByNumber(ticketNumber);
  }

  @Post('bookings')
  @ApiOperation({
    summary: 'Submit a repair booking request',
    description:
      'If preferredShopId is set, also creates a RECEIVED repair ticket.',
  })
  book(@Body() dto: CreateRepairBookingDto) {
    return this.repairService.createBooking(dto);
  }
}
