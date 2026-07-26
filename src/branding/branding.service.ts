import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { absoluteMediaUrl } from '../common/media-url';
import { UpdateBrandingDto } from './dto/branding.dto';
import { Branding, BrandingDocument } from './schemas/branding.schema';

const DEFAULTS = {
  key: 'default',
  appName: 'قطع غيار',
  tagline: 'منصة الجملة لقطع غيار الموبايل',
  accentColor: '#10b880',
  accentStrongColor: '#0d9a6a',
  brandColor: '#0f172a',
  logoUrl: '',
  faviconUrl: '',
};

@Injectable()
export class BrandingService {
  constructor(
    @InjectModel(Branding.name)
    private readonly brandingModel: Model<Branding>,
  ) {}

  async getOrCreate(): Promise<BrandingDocument> {
    let doc = await this.brandingModel.findOne({ key: 'default' }).exec();
    if (!doc) {
      doc = await this.brandingModel.create(DEFAULTS);
    }
    return doc;
  }

  async getPublicView(): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    return this.toView(doc);
  }

  async update(dto: UpdateBrandingDto): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    if (dto.appName !== undefined) doc.appName = dto.appName.trim();
    if (dto.tagline !== undefined) doc.tagline = dto.tagline.trim();
    if (dto.accentColor !== undefined) {
      doc.accentColor = dto.accentColor.toLowerCase();
    }
    if (dto.accentStrongColor !== undefined) {
      doc.accentStrongColor = dto.accentStrongColor.toLowerCase();
    }
    if (dto.brandColor !== undefined) {
      doc.brandColor = dto.brandColor.toLowerCase();
    }
    if (dto.logoUrl !== undefined) doc.logoUrl = dto.logoUrl.trim();
    if (dto.faviconUrl !== undefined) doc.faviconUrl = dto.faviconUrl.trim();
    await doc.save();
    return this.toView(doc);
  }

  async setLogoUrl(relativePath: string): Promise<Record<string, unknown>> {
    const doc = await this.getOrCreate();
    doc.logoUrl = relativePath;
    if (!doc.faviconUrl) doc.faviconUrl = relativePath;
    await doc.save();
    return this.toView(doc);
  }

  private toView(doc: BrandingDocument): Record<string, unknown> {
    const json = doc.toJSON() as unknown as Record<string, unknown>;
    const logoUrl =
      typeof json.logoUrl === 'string' ? absoluteMediaUrl(json.logoUrl) : '';
    const faviconUrl =
      typeof json.faviconUrl === 'string' && json.faviconUrl
        ? absoluteMediaUrl(json.faviconUrl)
        : logoUrl;
    return {
      ...json,
      logoUrl,
      faviconUrl,
    };
  }
}
