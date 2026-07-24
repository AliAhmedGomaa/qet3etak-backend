import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserStatus } from '../../common/enums/user.enums';

export class UpdateShopStatusDto {
  @ApiProperty({ enum: UserStatus, example: UserStatus.APPROVED })
  @IsEnum(UserStatus)
  status!: UserStatus;

  @ApiPropertyOptional({
    description: 'Required when status is REJECTED',
    example: 'Commercial registration photo is unclear',
  })
  @ValidateIf((o: UpdateShopStatusDto) => o.status === UserStatus.REJECTED)
  @IsString()
  @MinLength(3)
  reason?: string;

  @ApiPropertyOptional({ description: 'Alias for `reason`' })
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
