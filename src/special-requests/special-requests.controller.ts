import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { SpecialRequestStatus } from '../common/enums/special-request.enums';
import { UserRole } from '../common/enums/user.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateSpecialRequestDto,
  QuoteSpecialRequestDto,
} from '../push/dto/push.dto';
import { SpecialRequestsService } from './special-requests.service';

const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialRequestsController {
  constructor(private readonly requestsService: SpecialRequestsService) {}

  @Post('wholesale/special-requests')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `rare-${unique}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|webp)$/)) {
          return cb(new Error('Only image uploads are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSpecialRequestDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.requestsService.create(user.userId, dto, file?.filename);
  }

  @Get('wholesale/special-requests')
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myRequests(@CurrentUser() user: AuthUser) {
    return this.requestsService.listForShop(user.userId);
  }

  @Get('admin/special-requests')
  @Roles(UserRole.ADMIN)
  list(@Query('status') status?: string) {
    if (status && !Object.values(SpecialRequestStatus).includes(status as SpecialRequestStatus)) {
      throw new BadRequestException('Invalid status filter');
    }
    return this.requestsService.listAll(status as SpecialRequestStatus | undefined);
  }

  @Patch('admin/special-requests/:id/quote')
  @Roles(UserRole.ADMIN)
  quote(@Param('id') id: string, @Body() dto: QuoteSpecialRequestDto) {
    return this.requestsService.quote(id, dto);
  }

  @Patch('admin/special-requests/:id/fulfill')
  @Roles(UserRole.ADMIN)
  fulfill(@Param('id') id: string) {
    return this.requestsService.fulfill(id);
  }
}
