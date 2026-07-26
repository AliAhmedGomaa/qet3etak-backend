import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Server } from 'socket.io';
import { UserRole, isAdminPanelRole } from '../common/enums/user.enums';
import { PushService } from '../push/push.service';
import { ChatMessage } from './schemas/message.schema';
import { Conversation } from './schemas/conversation.schema';

export const ADMIN_ROOM = 'admins';
export const shopRoom = (shopId: string) => `shop:${shopId}`;
/** A shop owner is actively looking at their own support thread. */
export const shopViewRoom = (shopId: string) => `view:shop:${shopId}`;
/** An admin is actively looking at this shop's conversation. */
export const adminViewRoom = (shopId: string) => `view:admin:${shopId}`;

interface SendMessageInput {
  shopId: string;
  shopName?: string;
  senderId: string;
  senderRole: UserRole;
  text: string;
}

function view(doc: { toJSON: () => unknown }): Record<string, unknown> {
  return doc.toJSON() as Record<string, unknown>;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private server: Server | null = null;

  constructor(
    @InjectModel(ChatMessage.name)
    private readonly messageModel: Model<ChatMessage>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    private readonly pushService: PushService,
  ) {}

  /** Called by the gateway once the Socket.IO server is ready. */
  setServer(server: Server): void {
    this.server = server;
  }

  async sendMessage(input: SendMessageInput): Promise<Record<string, unknown>> {
    const shopObjectId = new Types.ObjectId(input.shopId);
    const text = input.text.trim();

    const message = await this.messageModel.create({
      shopId: shopObjectId,
      senderId: new Types.ObjectId(input.senderId),
      senderRole: input.senderRole,
      text,
      read: false,
    });

    const fromShop = input.senderRole === UserRole.SHOP_OWNER;
    const update: Record<string, unknown> = {
      lastMessage: text,
      lastMessageAt: new Date(),
      $inc: fromShop ? { unreadForAdmin: 1 } : { unreadForShop: 1 },
    };
    if (input.shopName) update['shopName'] = input.shopName;

    const conversation = await this.conversationModel
      .findOneAndUpdate({ shopId: shopObjectId }, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      .exec();

    const messageView = view(message);

    // Push first (must complete before the HTTP response on Vercel).
    const shopName =
      (conversation?.shopName as string) || input.shopName || 'متجر';
    await this.pushToRecipient(input, shopName, text);

    // Realtime fan-out is best-effort (Socket.IO is flaky on serverless).
    try {
      this.emitMessage(input.shopId, messageView);
      if (conversation) this.emitConversation(input.shopId, view(conversation));
    } catch (err) {
      this.logger.warn(
        `Chat socket emit failed: ${(err as Error).message}`,
      );
    }

    return messageView;
  }

  /**
   * Always send a web-push to the recipient side.
   * (Presence-based suppression is unreliable on serverless Socket.IO.)
   */
  private async pushToRecipient(
    input: SendMessageInput,
    shopName: string,
    text: string,
  ): Promise<void> {
    try {
      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      const tag = `chat-${input.shopId}-${Date.now()}`;

      if (input.senderRole === UserRole.SHOP_OWNER) {
        const sent = await this.pushService.notifyAdmins({
          title: `رسالة من ${shopName}`,
          body: preview,
          url: '/chat',
          tag,
        });
        this.logger.log(
          `[chat] push to admins shopId=${input.shopId} sent=${sent}`,
        );
      } else {
        const sent = await this.pushService.notifyUser(input.shopId, {
          title: 'دعم قطع الغيار',
          body: preview,
          url: '/support',
          tag,
        });
        this.logger.log(
          `[chat] push to shop shopId=${input.shopId} sent=${sent}`,
        );
      }
    } catch (err) {
      this.logger.warn(`Chat push failed: ${(err as Error).message}`);
    }
  }

  async getMessages(shopId: string): Promise<Record<string, unknown>[]> {
    const messages = await this.messageModel
      .find({ shopId: new Types.ObjectId(shopId) })
      .sort({ createdAt: 1 })
      .limit(500)
      .exec();
    return messages.map((m) => view(m));
  }

  async getOrCreateConversation(
    shopId: string,
    shopName?: string,
  ): Promise<Record<string, unknown>> {
    const shopObjectId = new Types.ObjectId(shopId);
    const conversation = await this.conversationModel
      .findOneAndUpdate(
        { shopId: shopObjectId },
        { $setOnInsert: { shopId: shopObjectId }, ...(shopName ? { shopName } : {}) },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    return view(conversation!);
  }

  async listConversations(): Promise<Record<string, unknown>[]> {
    const conversations = await this.conversationModel
      .find()
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .exec();
    return conversations.map((c) => view(c));
  }

  /** Mark the thread read for whichever side is viewing it. */
  async markRead(shopId: string, reader: UserRole): Promise<void> {
    const shopObjectId = new Types.ObjectId(shopId);
    const readerIsAdmin = isAdminPanelRole(reader);

    // Messages from the *other* party become read.
    await this.messageModel
      .updateMany(
        {
          shopId: shopObjectId,
          senderRole: readerIsAdmin
            ? UserRole.SHOP_OWNER
            : { $ne: UserRole.SHOP_OWNER },
          read: false,
        },
        { read: true },
      )
      .exec();

    const conversation = await this.conversationModel
      .findOneAndUpdate(
        { shopId: shopObjectId },
        readerIsAdmin ? { unreadForAdmin: 0 } : { unreadForShop: 0 },
        { new: true },
      )
      .exec();

    if (conversation) this.emitConversation(shopId, view(conversation));
  }

  async totalUnreadForAdmin(): Promise<number> {
    const rows = await this.conversationModel
      .aggregate<{ total: number }>([
        { $group: { _id: null, total: { $sum: '$unreadForAdmin' } } },
      ])
      .exec();
    return rows[0]?.total ?? 0;
  }

  private emitMessage(shopId: string, message: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(shopRoom(shopId)).to(ADMIN_ROOM).emit('message:new', message);
  }

  private emitConversation(
    shopId: string,
    conversation: Record<string, unknown>,
  ): void {
    if (!this.server) return;
    this.server
      .to(shopRoom(shopId))
      .to(ADMIN_ROOM)
      .emit('conversation:update', conversation);
  }
}
