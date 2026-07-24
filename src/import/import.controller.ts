import {
  Controller,
  Get,
  Post,
  Res,
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
import type { Response } from 'express';
import { UserRole } from '../common/enums/user.enums';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ImportService } from './import.service';
import { importUploadOptions, MAX_IMPORT_FILE_BYTES } from './multer-import';

const importUpload = FileInterceptor('file', importUploadOptions());

@ApiTags('Admin — Import')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Get('template')
  @ApiOperation({
    summary: 'Describe import field mapping + sample JSON',
    description:
      'Documents expected Excel sheets / JSON fields and upsert keys for brands, categories, and products.',
  })
  @ApiOkResponse({ description: 'Field docs and sample payload' })
  getTemplate() {
    return this.importService.getTemplateDocs();
  }

  @Get('template.json')
  @ApiOperation({ summary: 'Download sample JSON import file' })
  async downloadSampleJson(@Res() res: Response): Promise<void> {
    const sample = this.importService.getSampleJson();
    const body = JSON.stringify(sample, null, 2);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="qet3etak-import-sample.json"',
    );
    res.send(body);
  }

  @Get('template.xlsx')
  @ApiOperation({ summary: 'Download Excel (.xlsx) import template with sample rows' })
  async downloadSampleExcel(@Res() res: Response): Promise<void> {
    const buffer = await this.importService.buildExcelTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="qet3etak-import-template.xlsx"',
    );
    res.send(buffer);
  }

  @Post('preview')
  @ApiOperation({
    summary: 'Preview bulk import (dry-run)',
    description:
      'Parse .xlsx / .json and return a row-level plan (create / update / reuse) without writing. ' +
      `Max file size ${MAX_IMPORT_FILE_BYTES / (1024 * 1024)}MB.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel (.xlsx) or JSON (.json) import file',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Import plan summary (dryRun: true)' })
  @UseInterceptors(importUpload)
  preview(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.importService.preview(file);
  }

  @Post('commit')
  @ApiOperation({
    summary: 'Commit bulk import (upsert)',
    description:
      'Apply upserts for brands (by name), categories (by name), and products ' +
      '(by sku, else brand+model+category+part+qualityGrade). Soft-fails per row.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Excel (.xlsx) or JSON (.json) import file',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Import result summary (dryRun: false)' })
  @UseInterceptors(importUpload)
  commit(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    return this.importService.commit(file);
  }
}
