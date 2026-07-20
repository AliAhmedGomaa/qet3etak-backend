import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushModule } from '../push/push.module';
import { UsersModule } from '../users/users.module';
import {
  SpecialRequest,
  SpecialRequestSchema,
} from './schemas/special-request.schema';
import { SpecialRequestsController } from './special-requests.controller';
import { SpecialRequestsService } from './special-requests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SpecialRequest.name, schema: SpecialRequestSchema },
    ]),
    UsersModule,
    PushModule,
  ],
  controllers: [SpecialRequestsController],
  providers: [SpecialRequestsService],
  exports: [SpecialRequestsService],
})
export class SpecialRequestsModule {}
