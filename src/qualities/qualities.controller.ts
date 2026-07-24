import {
  Body,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/pagination';
import { RequireApproved } from '../auth/decorators/require-approved.decorator';
import { AdminOnly, ShopOrAdmin } from '../auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QualitiesService } from './qualities.service';
import { CreateQualityDto, UpdateQualityDto } from './dto/quality.dto';
import { examples } from '../swagger/examples';

@Controller()
export class QualitiesController {
  constructor(private readonly qualitiesService: QualitiesService) {}

  /** Active qualities for shop catalog filters / dropdowns. */
  @Get('wholesale/qualities')
  @ApiTags('Wholesale — Qualities')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List active qualities for shop catalog / filters' })
  @ApiOkResponse({
    description: 'Paginated qualities',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ShopOrAdmin()
  @RequireApproved()
  listWholesale(@Query() query: PaginationQueryDto) {
    return this.qualitiesService.listActive(query.page, query.limit, query.q);
  }

  @Get('admin/qualities')
  @ApiTags('Admin — Qualities')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all qualities (admin, paginated)' })
  @ApiOkResponse({
    description: 'Paginated qualities',
    schema: { example: examples('paginatedEmpty').paginatedEmpty.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  listAdmin(@Query() query: PaginationQueryDto) {
    return this.qualitiesService.listAll(query.page, query.limit, query.q);
  }

  @Post('admin/qualities')
  @ApiTags('Admin — Qualities')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a quality grade (admin)' })
  @ApiOkResponse({
    description: 'Created quality',
    schema: { example: examples('quality').quality.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  create(@Body() dto: CreateQualityDto) {
    return this.qualitiesService.create(dto);
  }

  @Patch('admin/qualities/:id')
  @ApiTags('Admin — Qualities')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Update a quality grade (admin)' })
  @ApiOkResponse({
    description: 'Updated quality',
    schema: { example: examples('quality').quality.value },
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  update(@Param('id') id: string, @Body() dto: UpdateQualityDto) {
    return this.qualitiesService.update(id, dto);
  }

  @Delete('admin/qualities/:id')
  @ApiTags('Admin — Qualities')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Delete a quality grade (admin)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @AdminOnly()
  remove(@Param('id') id: string) {
    return this.qualitiesService.remove(id);
  }
}
