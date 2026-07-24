import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums/user.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { examples } from '../swagger/examples';

@ApiTags('Wholesale — Chat')
@ApiBearerAuth('JWT')
@Controller('wholesale/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SHOP_OWNER)
export class ShopChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Get (or create) the shop-to-admin chat thread' })
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
  @ApiOperation({ summary: 'Send a message to admin' })
  @ApiBody({ schema: {}, examples: examples('sendMessageRequest') })
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

@ApiTags('Admin — Chat')
@ApiBearerAuth('JWT')
@Controller('admin/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List all shop conversations' })
  conversations() {
    return this.chatService.listConversations();
  }

  @Get(':shopId')
  @ApiOperation({ summary: 'Get chat thread with a specific shop' })
  async thread(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
  ) {
    const messages = await this.chatService.getMessages(shopId);
    await this.chatService.markRead(shopId, user.role as UserRole);
    return { messages };
  }

  @Post(':shopId')
  @ApiOperation({ summary: 'Send a message to a shop' })
  @ApiBody({ schema: {}, examples: examples('sendMessageRequest') })
  send(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage({
      shopId,
      senderId: user.userId,
      senderRole: user.role as UserRole,
      text: dto.text,
    });
  }
}
