import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { UserRole } from '../common/enums/user.enums';
import { imageUploadOptions } from '../common/multer-image';
import { UsersService } from '../users/users.service';
import { UpdateShopCustomerAppDto } from './dto/shop-customer-app.dto';

@ApiTags('Wholesale — Customer app')
@Controller('wholesale/customer-app')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
@RequireApproved()
@ApiBearerAuth('JWT')
export class ShopCustomerAppController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get this shop’s customer-app branding' })
  getMine(@CurrentUser() user: AuthUser) {
    return this.usersService.getOwnCustomerApp(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update this shop’s customer-app branding' })
  updateMine(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateShopCustomerAppDto,
  ) {
    return this.usersService.updateOwnCustomerApp(user.userId, dto);
  }

  @Post('logo')
  @ApiOperation({ summary: 'Upload logo for this shop’s customer app' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        logo: { type: 'string', format: 'binary' },
      },
      required: ['logo'],
    },
  })
  @UseInterceptors(
    FileInterceptor('logo', imageUploadOptions('shop-app', { allowSvg: true })),
  )
  uploadLogo(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const path = file?.filename ? `/uploads/${file.filename}` : '';
    return this.usersService.setOwnCustomerAppLogo(user.userId, path);
  }
}
