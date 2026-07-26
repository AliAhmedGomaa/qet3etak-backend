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
import { UnscopedAdminOnly } from '../auth/decorators/admin-only.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { imageUploadOptions } from '../common/multer-image';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/branding.dto';

@Controller()
export class BrandingController {
  constructor(private readonly brandingService: BrandingService) {}

  @Get('branding')
  @ApiTags('Branding')
  @ApiOperation({ summary: 'Public platform branding (colors, logo, name)' })
  getPublic() {
    return this.brandingService.getPublicView();
  }

  @Get('admin/branding')
  @ApiTags('Admin — Branding')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UnscopedAdminOnly()
  @ApiOperation({ summary: 'Get branding settings (admin)' })
  getAdmin() {
    return this.brandingService.getPublicView();
  }

  @Patch('admin/branding')
  @ApiTags('Admin — Branding')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UnscopedAdminOnly()
  @ApiOperation({ summary: 'Update branding settings' })
  update(@Body() dto: UpdateBrandingDto) {
    return this.brandingService.update(dto);
  }

  @Post('admin/branding/logo')
  @ApiTags('Admin — Branding')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UnscopedAdminOnly()
  @ApiOperation({ summary: 'Upload brand logo' })
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
    FileInterceptor('logo', imageUploadOptions('brand', { allowSvg: true })),
  )
  uploadLogo(@UploadedFile() file?: Express.Multer.File) {
    const path = file?.filename ? `/uploads/${file.filename}` : '';
    return this.brandingService.setLogoUrl(path);
  }
}
