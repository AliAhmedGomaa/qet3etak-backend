import { IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/)
  phone!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
