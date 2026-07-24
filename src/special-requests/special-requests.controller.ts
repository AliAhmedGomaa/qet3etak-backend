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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { SpecialRequestStatus } from '../common/enums/special-request.enums';
import { UserRole } from '../common/enums/user.enums';
import {
  PaginatedStatusQueryDto,
  PaginationQueryDto,
} from '../common/pagination';
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
import { examples } from '../swagger/examples';

const uploadsDir = join(process.cwd(), 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

@Controller()
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecialRequestsController {
  constructor(private readonly requestsService: SpecialRequestsService) {}

  @Post('wholesale/special-requests')
  @ApiTags('Wholesale — Special Requests')
  @ApiOperation({
    summary: 'Create a special/rare part request',
    description: 'Multipart form: text fields + optional `photo` image (jpeg/png/webp, max 10MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['deviceModel', 'partName', 'quantity', 'targetPrice'],
      properties: {
        deviceModel: { type: 'string', example: 'iPhone 13 Pro' },
        partName: { type: 'string', example: 'True Tone Flex' },
        quantity: { type: 'number', example: 3 },
        targetPrice: { type: 'number', example: 120 },
        photo: {
          type: 'string',
          format: 'binary',
          description: 'Reference photo of the part',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Created special request',
    schema: { example: examples('specialRequest').specialRequest.value },
  })
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
  @ApiTags('Wholesale — Special Requests')
  @ApiOperation({ summary: 'List my special requests (paginated)' })
  @ApiOkResponse({
    description: 'Paginated special requests',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @Roles(UserRole.SHOP_OWNER)
  @RequireApproved()
  myRequests(
    @CurrentUser() user: AuthUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.requestsService.listForShop(
      user.userId,
      query.page,
      query.limit,
    );
  }

  @Get('admin/special-requests')
  @ApiTags('Admin — Special Requests')
  @ApiOperation({
    summary: 'List all special requests (admin, filter by status)',
  })
  @ApiOkResponse({
    description: 'Paginated special requests',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @Roles(UserRole.ADMIN)
  list(@Query() query: PaginatedStatusQueryDto) {
    if (
      query.status &&
      !Object.values(SpecialRequestStatus).includes(
        query.status as SpecialRequestStatus,
      )
    ) {
      throw new BadRequestException('Invalid status filter');
    }
    return this.requestsService.listAll(
      query.status as SpecialRequestStatus | undefined,
      query.page,
      query.limit,
      query.q,
    );
  }

  @Patch('admin/special-requests/:id/quote')
  @ApiTags('Admin — Special Requests')
  @ApiOperation({ summary: 'Quote a special request (admin)' })
  @ApiBody({
    type: QuoteSpecialRequestDto,
    examples: examples('quoteSpecialRequest'),
  })
  @ApiOkResponse({
    description: 'Updated special request',
    schema: { example: examples('specialRequest').specialRequest.value },
  })
  @Roles(UserRole.ADMIN)
  quote(@Param('id') id: string, @Body() dto: QuoteSpecialRequestDto) {
    return this.requestsService.quote(id, dto);
  }

  @Patch('admin/special-requests/:id/fulfill')
  @ApiTags('Admin — Special Requests')
  @ApiOperation({ summary: 'Mark a special request as fulfilled (admin)' })
  @ApiOkResponse({
    description: 'Updated special request',
    schema: { example: examples('specialRequest').specialRequest.value },
  })
  @Roles(UserRole.ADMIN)
  fulfill(@Param('id') id: string) {
    return this.requestsService.fulfill(id);
  }
}
