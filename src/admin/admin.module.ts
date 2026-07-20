import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, WalletsModule],
  controllers: [AdminController],
})
export class AdminModule {}
