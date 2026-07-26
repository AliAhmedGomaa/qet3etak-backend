import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminRolesController } from './admin-roles.controller';
import { Role, RoleSchema } from './schemas/role.schema';
import { RolesService } from './roles.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminRolesController],
  providers: [RolesService, PermissionsGuard],
  exports: [RolesService, MongooseModule],
})
export class RolesModule {}
