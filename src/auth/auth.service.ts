import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserRole, UserStatus } from '../common/enums/user.enums';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterShopDto } from './dto/register-shop.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async registerShop(
    dto: RegisterShopDto,
    photoFilename?: string,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const existing = await this.usersService.findByPhone(dto.phone.trim());
    if (existing) {
      throw new ConflictException('Phone number already registered');
    }

    const photoUrl =
      photoFilename != null
        ? `/uploads/${photoFilename}`
        : dto.commercialRegPhotoUrl?.trim();

    if (!photoUrl) {
      throw new BadRequestException(
        'Business card / commercial registration photo is required',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      fullName: dto.fullName.trim(),
      shopName: dto.shopName.trim(),
      phone: dto.phone.trim(),
      city: dto.city.trim(),
      address: dto.address.trim(),
      commercialRegPhotoUrl: photoUrl,
      passwordHash,
      role: UserRole.SHOP_OWNER,
      status: UserStatus.PENDING_VERIFICATION,
    });

    return this.tokenResponse(user);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const user = await this.usersService.findByPhoneWithPassword(
      dto.phone.trim(),
    );
    if (!user) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid phone or password');
    }
    return this.tokenResponse(user);
  }

  async me(userId: string): Promise<Record<string, unknown>> {
    const user = await this.usersService.findByIdOrFail(userId);
    return user.toJSON() as unknown as Record<string, unknown>;
  }

  private tokenResponse(user: UserDocument): {
    accessToken: string;
    user: Record<string, unknown>;
  } {
    const payload = { sub: String(user._id), phone: user.phone };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
      user: user.toJSON() as unknown as Record<string, unknown>,
    };
  }
}
