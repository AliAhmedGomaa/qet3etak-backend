import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PushKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class SavePushSubscriptionDto {
  @IsString()
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class BroadcastDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsString()
  @MinLength(3)
  body!: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class CreateSpecialRequestDto {
  @IsString()
  @MinLength(2)
  deviceModel!: string;

  @IsString()
  @MinLength(2)
  partName!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetPrice!: number;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class QuoteSpecialRequestDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quotePrice!: number;

  @IsOptional()
  @IsString()
  estimatedArrival?: string;

  @IsOptional()
  @IsString()
  adminReply?: string;
}
