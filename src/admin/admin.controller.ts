import {
  BadRequestException,
  Body,
  ConflictException,
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
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../common/enums/user.enums';
import { absoluteMediaUrl } from '../common/media-url';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import {
  CreateAdminShopDto,
  UpdateAdminShopDto,
} from './dto/admin-shop.dto';
import { UpdateShopStatusDto } from './dto/update-shop-status.dto';
import { examples } from '../swagger/examples';

@ApiTags('Admin — Shops')
@ApiBearerAuth('JWT')
@Controller('admin/shops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List shops (paginated, searchable, filterable by status)',
  })
  async listShops(@Query() query: PaginatedStatusQueryDto) {
    let parsed: UserStatus | undefined;
    if (query.status) {
      if (!Object.values(UserStatus).includes(query.status as UserStatus)) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(UserStatus).join(', ')}`,
        );
      }
      parsed = query.status as UserStatus;
    }
    const result = await this.usersService.findShops(
      parsed,
      query.page,
      query.limit,
      query.q,
    );
    return {
      ...result,
      items: result.items.map((shop) => this.toShopView(shop)),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a shop (owner account) as admin' })
  async createShop(@Body() dto: CreateAdminShopDto) {
    const phone = dto.phone.trim();
    const existing = await this.usersService.findByPhone(phone);
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const status = dto.status ?? UserStatus.APPROVED;
    if (
      status === UserStatus.REJECTED &&
      !(dto.rejectionReason && dto.rejectionReason.trim().length >= 3)
    ) {
      throw new BadRequestException('Rejection reason is required');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      fullName: dto.fullName.trim(),
      shopName: dto.shopName.trim(),
      phone,
      city: dto.city.trim(),
      address: dto.address.trim(),
      commercialRegPhotoUrl: dto.commercialRegPhotoUrl?.trim() || '',
      passwordHash,
      role: UserRole.SHOP_OWNER,
      status,
      rejectionReason:
        status === UserStatus.REJECTED
          ? dto.rejectionReason?.trim()
          : undefined,
    });

    if (status === UserStatus.APPROVED) {
      await this.walletsService.ensureForShop(String(user._id));
    }

    return this.toShopView(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a shop by id' })
  async getShop(@Param('id') id: string) {
    const shop = await this.usersService.findShopByIdOrFail(id);
    return this.toShopView(shop);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update shop profile / credentials / status' })
  async updateShop(@Param('id') id: string, @Body() dto: UpdateAdminShopDto) {
    if (
      dto.status === UserStatus.REJECTED &&
      !(dto.rejectionReason && dto.rejectionReason.trim().length >= 3)
    ) {
      const existing = await this.usersService.findShopByIdOrFail(id);
      if (
        existing.status !== UserStatus.REJECTED ||
        !existing.rejectionReason
      ) {
        throw new BadRequestException('Rejection reason is required');
      }
    }

    const passwordHash =
      dto.password !== undefined
        ? await bcrypt.hash(dto.password, 10)
        : undefined;

    const user = await this.usersService.updateShop(id, {
      fullName: dto.fullName,
      shopName: dto.shopName,
      phone: dto.phone,
      city: dto.city,
      address: dto.address,
      commercialRegPhotoUrl: dto.commercialRegPhotoUrl,
      passwordHash,
      status: dto.status,
      rejectionReason: dto.rejectionReason,
    });

    if (dto.status === UserStatus.APPROVED) {
      await this.walletsService.ensureForShop(id);
    }

    return this.toShopView(user);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Approve or reject a pending shop' })
  @ApiBody({
    schema: {},
    examples: examples('updateShopStatusApprove', 'updateShopStatusReject'),
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateShopStatusDto,
  ) {
    if (
      dto.status === UserStatus.REJECTED &&
      !(dto.reason || dto.rejectionReason)
    ) {
      throw new BadRequestException('Rejection reason is required');
    }
    const user = await this.usersService.updateStatus(
      id,
      dto.status,
      dto.reason ?? dto.rejectionReason,
    );
    if (dto.status === UserStatus.APPROVED) {
      await this.walletsService.ensureForShop(id);
    }
    return this.toShopView(user);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Hard-delete a shop with no orders (rejects if the shop has order history)',
  })
  async removeShop(@Param('id') id: string) {
    await this.usersService.findShopByIdOrFail(id);
    const orderCount = await this.ordersService.countForShop(id);
    if (orderCount > 0) {
      throw new ConflictException(
        'Cannot delete a shop that has orders. Reject or leave it inactive instead.',
      );
    }
    await this.walletsService.removeForShop(id);
    await this.usersService.removeShop(id);
    return { ok: true };
  }

  private toShopView(shop: { toJSON: () => unknown }) {
    const json = shop.toJSON() as Record<string, unknown>;
    return {
      ...json,
      commercialRegPhotoUrl: absoluteMediaUrl(
        typeof json.commercialRegPhotoUrl === 'string'
          ? json.commercialRegPhotoUrl
          : '',
      ),
    };
  }
}
