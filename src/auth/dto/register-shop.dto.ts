import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterShopDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(2)
  shopName!: string;

  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone!: string;

  @IsString()
  @MinLength(2)
  city!: string;

  @IsString()
  @MinLength(5)
  address!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  commercialRegPhotoUrl?: string;
}
