import { IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { UserStatus } from '../../common/enums/user.enums';

export class UpdateShopStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;

  @ValidateIf((o: UpdateShopStatusDto) => o.status === UserStatus.REJECTED)
  @IsString()
  @MinLength(3)
  reason?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
