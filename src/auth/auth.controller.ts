import {
  Controller,
  Get,
  Post,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterShopDto } from './dto/register-shop.dto';
import type { AuthUser } from './guards/roles.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { examples } from '../swagger/examples';
import { imageUploadOptions } from '../common/multer-image';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register-shop')
  @ApiOperation({
    summary: 'Register a new shop (pending verification)',
    description:
      'Multipart form: text fields + optional `commercialRegPhoto` image (jpeg/png/webp, max 3MB).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'fullName',
        'shopName',
        'phone',
        'city',
        'address',
        'password',
      ],
      properties: {
        fullName: { type: 'string', example: 'Ahmed Hassan' },
        shopName: { type: 'string', example: 'Hassan Mobile Parts' },
        phone: { type: 'string', example: '01001234567' },
        city: { type: 'string', example: 'Cairo' },
        address: { type: 'string', example: '12 Tahrir St, Downtown' },
        password: { type: 'string', example: 'Shop123!' },
        commercialRegPhotoUrl: { type: 'string', nullable: true },
        commercialRegPhoto: {
          type: 'string',
          format: 'binary',
          description: 'Commercial registration photo (max 3MB)',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Created shop (PENDING_VERIFICATION)',
    schema: { example: examples('registerShopResponse').registerShopResponse.value },
  })
  @UseInterceptors(
    FileInterceptor('commercialRegPhoto', imageUploadOptions('shop')),
  )
  registerShop(
    @Body() dto: RegisterShopDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.authService.registerShop(dto, file?.filename);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and receive JWT' })
  @ApiBody({
    type: LoginDto,
    examples: examples('loginRequest', 'loginShopRequest'),
  })
  @ApiOkResponse({
    description: 'Access token + user',
    schema: { example: examples('loginResponse').loginResponse.value },
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('employee/login')
  @ApiOperation({ summary: 'Employee portal login' })
  @ApiBody({ type: LoginDto })
  loginEmployee(@Body() dto: LoginDto) {
    return this.authService.loginEmployee(dto);
  }

  @Get('me')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Current authenticated user' })
  @ApiOkResponse({
    description: 'User profile',
    schema: { example: examples('meResponse').meResponse.value },
  })
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    if (user.kind === 'employee') {
      return this.authService.employeeMe(user.userId);
    }
    return this.authService.me(user.userId);
  }
}
