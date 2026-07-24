import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'هل الشاشة أصلية؟', maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
