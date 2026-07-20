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
  listShops(@Query('status') status?: string) {
    let parsed: UserStatus | undefined;
    if (status) {
      if (!Object.values(UserStatus).includes(status as UserStatus)) {
        throw new BadRequestException(
          `status must be one of: ${Object.values(UserStatus).join(', ')}`,
        );
      }
      parsed = status as UserStatus;
    }
    return this.usersService.findShops(parsed);
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
    return user;
  }
}
