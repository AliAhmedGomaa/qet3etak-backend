import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../common/enums/user.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('wholesale/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
export class ShopChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  async thread(@CurrentUser() user: AuthUser) {
    const conversation = await this.chatService.getOrCreateConversation(
      user.userId,
      user.shopName,
    );
    const messages = await this.chatService.getMessages(user.userId);
    await this.chatService.markRead(user.userId, UserRole.SHOP_OWNER);
    return { conversation, messages };
  }

  @Post()
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage({
      shopId: user.userId,
      shopName: user.shopName,
      senderId: user.userId,
      senderRole: UserRole.SHOP_OWNER,
      text: dto.text,
    });
  }
}

@Controller('admin/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  conversations() {
    return this.chatService.listConversations();
  }

  @Get(':shopId')
  async thread(@Param('shopId') shopId: string) {
    const messages = await this.chatService.getMessages(shopId);
    await this.chatService.markRead(shopId, UserRole.ADMIN);
    return { messages };
  }

  @Post(':shopId')
  send(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage({
      shopId,
      senderId: user.userId,
      senderRole: UserRole.ADMIN,
      text: dto.text,
    });
  }
}
