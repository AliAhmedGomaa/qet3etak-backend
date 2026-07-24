import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, UserStatus } from '../common/enums/user.enums';
import { absoluteMediaUrl } from '../common/media-url';
import { PaginatedStatusQueryDto } from '../common/pagination';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { UpdateShopStatusDto } from './dto/update-shop-status.dto';

@Controller('admin/shops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
  ) {}

  @Get()
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
    );
    return {
      ...result,
      items: result.items.map((shop) => this.toShopView(shop)),
    };
  }

  @Patch(':id/status')
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
