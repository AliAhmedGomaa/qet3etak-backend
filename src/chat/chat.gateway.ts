import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole, isAdminPanelRole } from '../common/enums/user.enums';
import { buildCorsOptions } from '../common/cors';
import { UsersService } from '../users/users.service';
import {
  ADMIN_ROOM,
  ChatService,
  adminViewRoom,
  shopRoom,
  shopViewRoom,
} from './chat.service';

interface SocketUser {
  userId: string;
  role: UserRole | string;
  shopName?: string;
}

type ChatSocket = Socket & { data: { user?: SocketUser } };

@WebSocketGateway({
  cors: buildCorsOptions(),
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server): void {
    this.chatService.setServer(server);
    this.logger.log('Chat gateway initialised');
  }

  async handleConnection(client: ChatSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error('Missing token');

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: this.config.get<string>('JWT_SECRET', 'qet3etak-dev-secret'),
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user) throw new Error('User no longer exists');

      const socketUser: SocketUser = {
        userId: String(user._id),
        role: user.role,
        shopName: user.shopName,
      };
      client.data.user = socketUser;

      if (isAdminPanelRole(socketUser.role)) {
        await client.join(ADMIN_ROOM);
      } else {
        await client.join(shopRoom(socketUser.userId));
        // Ensure the conversation exists so admins can see new shops.
        await this.chatService.getOrCreateConversation(
          socketUser.userId,
          socketUser.shopName,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Rejected socket ${client.id}: ${(err as Error).message}`,
      );
      client.emit('chat:error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { shopId?: string; text?: string },
  ): Promise<void> {
    const user = client.data.user;
    if (!user) return;
    const text = (body?.text ?? '').trim();
    if (!text) return;

    const shopId =
      isAdminPanelRole(user.role) ? body?.shopId : user.userId;
    if (!shopId) return;

    await this.chatService.sendMessage({
      shopId,
      shopName: user.role === UserRole.SHOP_OWNER ? user.shopName : undefined,
      senderId: user.userId,
      senderRole: user.role as UserRole,
      text,
    });
  }

  @SubscribeMessage('conversation:read')
  async onRead(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { shopId?: string },
  ): Promise<void> {
    const user = client.data.user;
    if (!user) return;
    const shopId = isAdminPanelRole(user.role) ? body?.shopId : user.userId;
    if (!shopId) return;
    await this.chatService.markRead(shopId, user.role as UserRole);
  }

  /**
   * Tracks whether a user is actively looking at a conversation so we can
   * suppress redundant push notifications only for the open thread.
   */
  @SubscribeMessage('chat:view')
  async onView(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { shopId?: string; active?: boolean },
  ): Promise<void> {
    const user = client.data.user;
    if (!user) return;
    const shopId = isAdminPanelRole(user.role) ? body?.shopId : user.userId;
    if (!shopId) return;

    const room =
      isAdminPanelRole(user.role) ? adminViewRoom(shopId) : shopViewRoom(shopId);

    if (body?.active) {
      await client.join(room);
      await this.chatService.markRead(shopId, user.role);
    } else {
      await client.leave(room);
    }
  }

  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() body: { shopId?: string; isTyping?: boolean },
  ): void {
    const user = client.data.user;
    if (!user) return;
    const shopId = isAdminPanelRole(user.role) ? body?.shopId : user.userId;
    if (!shopId) return;

    const payload = { shopId, isTyping: !!body?.isTyping, role: user.role };
    if (isAdminPanelRole(user.role)) {
      this.server.to(shopRoom(shopId)).emit('typing', payload);
    } else {
      this.server.to(ADMIN_ROOM).emit('typing', payload);
    }
  }

  private extractToken(client: ChatSocket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const query = client.handshake.query?.token;
    if (typeof query === 'string') return query;
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }
}
