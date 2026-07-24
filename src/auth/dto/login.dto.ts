import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: '0500000000' })
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/)
  phone!: string;

  @ApiProperty({ example: 'Admin123!', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}
