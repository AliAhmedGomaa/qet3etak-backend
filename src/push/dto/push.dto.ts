import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'BNcRd...' })
  @IsString()
  p256dh!: string;

  @ApiProperty({ example: 'tBHIt...' })
  @IsString()
  auth!: string;
}

export class SavePushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/abc123' })
  @IsString()
  endpoint!: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}

export class BroadcastDto {
  @ApiProperty({ example: 'New stock arrived', minLength: 3 })
  @IsString()
  @MinLength(3)
  title!: string;

  @ApiProperty({ example: 'iPhone 15 screens now available', minLength: 3 })
  @IsString()
  @MinLength(3)
  body!: string;

  @ApiPropertyOptional({ example: '/catalog?brand=Apple' })
  @IsOptional()
  @IsString()
  url?: string;
}

export class CreateSpecialRequestDto {
  @ApiProperty({ example: 'iPhone 13 Pro' })
  @IsString()
  @MinLength(2)
  deviceModel!: string;

  @ApiProperty({ example: 'True Tone Flex' })
  @IsString()
  @MinLength(2)
  partName!: string;

  @ApiProperty({ example: 3, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 120, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  targetPrice!: number;

  @ApiPropertyOptional({ description: 'Set internally when a file is uploaded' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class QuoteSpecialRequestDto {
  @ApiProperty({ example: 145, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quotePrice!: number;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsString()
  estimatedArrival?: string;

  @ApiPropertyOptional({ example: 'Genuine flex arriving next week' })
  @IsOptional()
  @IsString()
  adminReply?: string;
}
