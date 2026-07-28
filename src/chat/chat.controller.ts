import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '../common/enums/user.enums';
import { EMPLOYEE_ROLE } from '../common/enums/hr.enums';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminOnly } from '../auth/decorators/admin-only.decorator';
import { EmployeeOnly } from '../auth/decorators/employee-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/guards/roles.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { examples } from '../swagger/examples';
import type { ChatParticipantKind } from './schemas/conversation.schema';

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
      'SHOP',
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
      kind: 'SHOP',
      senderId: user.userId,
      senderRole: UserRole.SHOP_OWNER,
      text: dto.text,
    });
  }
}

@ApiTags('Employee — Chat')
@ApiBearerAuth('JWT')
@Controller('employee/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@EmployeeOnly()
export class EmployeeChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'Get (or create) the employee-to-support chat thread' })
  async thread(@CurrentUser() user: AuthUser) {
    const name = user.fullName || 'موظف';
    const conversation = await this.chatService.getOrCreateConversation(
      user.userId,
      name,
      'EMPLOYEE',
    );
    const messages = await this.chatService.getMessages(user.userId);
    await this.chatService.markRead(user.userId, EMPLOYEE_ROLE);
    return { conversation, messages };
  }

  @Post()
  @ApiOperation({ summary: 'Send a support message as an employee' })
  @ApiBody({ schema: {}, examples: examples('sendMessageRequest') })
  send(@CurrentUser() user: AuthUser, @Body() dto: SendMessageDto) {
    return this.chatService.sendMessage({
      shopId: user.userId,
      shopName: user.fullName || 'موظف',
      kind: 'EMPLOYEE',
      senderId: user.userId,
      senderRole: EMPLOYEE_ROLE,
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
  @ApiOperation({ summary: 'List shop + employee support conversations' })
  conversations(@Query('kind') kind?: string) {
    const safe: ChatParticipantKind | undefined =
      kind === 'SHOP' || kind === 'EMPLOYEE' ? kind : undefined;
    return this.chatService.listConversations(safe);
  }

  @Get(':shopId')
  @ApiOperation({ summary: 'Get chat thread with a shop or employee' })
  async thread(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
  ) {
    const messages = await this.chatService.getMessages(shopId);
    await this.chatService.markRead(shopId, user.role);
    return { messages };
  }

  @Post(':shopId')
  @ApiOperation({ summary: 'Send a message to a shop or employee' })
  @ApiBody({ schema: {}, examples: examples('sendMessageRequest') })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('shopId') shopId: string,
    @Body() dto: SendMessageDto,
  ) {
    const existing = await this.chatService.getConversation(shopId);
    const kind = (existing?.['kind'] as ChatParticipantKind) || 'SHOP';
    return this.chatService.sendMessage({
      shopId,
      kind,
      shopName:
        typeof existing?.['shopName'] === 'string'
          ? existing['shopName']
          : undefined,
      senderId: user.userId,
      senderRole: user.role,
      text: dto.text,
    });
  }
}
