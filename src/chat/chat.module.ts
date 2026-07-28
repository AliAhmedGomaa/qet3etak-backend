import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { HrModule } from '../hr/hr.module';
import { PushModule } from '../push/push.module';
import { UsersModule } from '../users/users.module';
import {
  AdminChatController,
  EmployeeChatController,
  ShopChatController,
} from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatMessage, ChatMessageSchema } from './schemas/message.schema';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UsersModule,
    HrModule,
    PushModule,
    MongooseModule.forFeature([
      { name: ChatMessage.name, schema: ChatMessageSchema },
      { name: Conversation.name, schema: ConversationSchema },
    ]),
  ],
  controllers: [ShopChatController, EmployeeChatController, AdminChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService],
})
export class ChatModule {}
