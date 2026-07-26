import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import {
  DeliveryGuy,
  DeliveryGuySchema,
} from '../delivery/schemas/delivery-guy.schema';
import { Employee, EmployeeSchema } from '../hr/schemas/employee.schema';
import { RolesModule } from '../roles/roles.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    RolesModule,
    MongooseModule.forFeature([
      { name: Employee.name, schema: EmployeeSchema },
      { name: DeliveryGuy.name, schema: DeliveryGuySchema },
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'qet3etak-dev-secret'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as `${number}d`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PermissionsGuard],
  exports: [AuthService, JwtModule, PassportModule, PermissionsGuard],
})
export class AuthModule {}
