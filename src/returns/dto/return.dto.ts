import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateReturnItemDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  productId!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnRequestDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  @IsMongoId()
  orderId!: string;

  @ApiProperty({ type: [CreateReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];

  @ApiProperty({
    example: 'القطعة تالفة / غير مطابقة للمواصفات',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class RejectReturnDto {
  @ApiProperty({
    example: 'المرتجع خارج فترة القبول',
    minLength: 3,
  })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class ApproveReturnDto {
  @ApiPropertyOptional({
    example: 'تم استلام المرتجع وإعادة التخزين',
  })
  @IsOptional()
  @IsString()
  adminNote?: string;
}

/** Admin marks a wholesale order as fully returned (restock + refund). */
export class MarkOrderReturnedDto {
  @ApiPropertyOptional({
    example: 'العميل رفض الاستلام / مرتجع من المحل',
    minLength: 3,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;

  @ApiPropertyOptional({
    example: 'تم استلام المرتجع في المخزن',
  })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
