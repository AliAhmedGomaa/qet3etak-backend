import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Server } from 'socket.io';
import { UserRole, isAdminPanelRole } from '../common/enums/user.enums';
import { EMPLOYEE_ROLE } from '../common/enums/hr.enums';
import { PushService } from '../push/push.service';
import { ChatMessage } from './schemas/message.schema';
import {
  ChatParticipantKind,
  Conversation,
} from './schemas/conversation.schema';

export const ADMIN_ROOM = 'admins';
export const shopRoom = (shopId: string) => `shop:${shopId}`;
/** A shop/employee is actively looking at their own support thread. */
export const shopViewRoom = (shopId: string) => `view:shop:${shopId}`;
/** An admin is actively looking at this conversation. */
export const adminViewRoom = (shopId: string) => `view:admin:${shopId}`;

export function isChatParticipantRole(role: string | undefined | null): boolean {
  return role === UserRole.SHOP_OWNER || role === EMPLOYEE_ROLE;
}

interface SendMessageInput {
  shopId: string;
  shopName?: string;
  kind?: ChatParticipantKind;
  senderId: string;
  senderRole: string;
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
    const fromParticipant = isChatParticipantRole(input.senderRole);

    const message = await this.messageModel.create({
      shopId: shopObjectId,
      senderId: new Types.ObjectId(input.senderId),
      senderRole: input.senderRole,
      text,
      read: false,
    });

    const update: Record<string, unknown> = {
      lastMessage: text,
      lastMessageAt: new Date(),
      $inc: fromParticipant ? { unreadForAdmin: 1 } : { unreadForShop: 1 },
    };
    if (input.shopName) update['shopName'] = input.shopName;
    if (input.kind) update['kind'] = input.kind;

    const conversation = await this.conversationModel
      .findOneAndUpdate({ shopId: shopObjectId }, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      .exec();

    // Ensure kind is set on insert when only admin replies first.
    if (input.kind && conversation && conversation.kind !== input.kind) {
      conversation.kind = input.kind;
      await conversation.save();
    }

    const messageView = view(message);
    const displayName =
      (conversation?.shopName as string) || input.shopName || 'محادثة';
    const kind: ChatParticipantKind =
      (conversation?.kind as ChatParticipantKind) ||
      input.kind ||
      'SHOP';

    await this.pushToRecipient(input, displayName, text, kind);

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

  private async pushToRecipient(
    input: SendMessageInput,
    displayName: string,
    text: string,
    kind: ChatParticipantKind,
  ): Promise<void> {
    try {
      const preview = text.length > 120 ? `${text.slice(0, 117)}…` : text;
      const tag = `chat-${input.shopId}-${Date.now()}`;

      if (isChatParticipantRole(input.senderRole)) {
        const label = kind === 'EMPLOYEE' ? 'موظف' : 'متجر';
        const sent = await this.pushService.notifyAdmins({
          title: `رسالة من ${displayName} (${label})`,
          body: preview,
          url: `/chat?shopId=${encodeURIComponent(input.shopId)}`,
          tag,
        });
        this.logger.log(
          `[chat] push to admins id=${input.shopId} kind=${kind} sent=${sent}`,
        );
      } else {
        const sent = await this.pushService.notifyUser(input.shopId, {
          title: 'دعم قطع الغيار',
          body: preview,
          url: '/support',
          tag,
        });
        this.logger.log(
          `[chat] push to participant id=${input.shopId} kind=${kind} sent=${sent}`,
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
    kind: ChatParticipantKind = 'SHOP',
  ): Promise<Record<string, unknown>> {
    const shopObjectId = new Types.ObjectId(shopId);
    const conversation = await this.conversationModel
      .findOneAndUpdate(
        { shopId: shopObjectId },
        {
          $setOnInsert: { shopId: shopObjectId, kind },
          ...(shopName ? { shopName } : {}),
          ...(kind ? { kind } : {}),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    return view(conversation!);
  }

  async getConversation(
    shopId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!Types.ObjectId.isValid(shopId)) return null;
    const conversation = await this.conversationModel
      .findOne({ shopId: new Types.ObjectId(shopId) })
      .exec();
    if (!conversation) return null;
    const json = view(conversation);
    if (!json['kind']) json['kind'] = 'SHOP';
    return json;
  }

  async listConversations(
    kind?: ChatParticipantKind,
  ): Promise<Record<string, unknown>[]> {
    const filter: Record<string, unknown> = {};
    if (kind === 'EMPLOYEE') {
      filter['kind'] = 'EMPLOYEE';
    } else if (kind === 'SHOP') {
      filter['$or'] = [{ kind: 'SHOP' }, { kind: { $exists: false } }];
    }
    const conversations = await this.conversationModel
      .find(filter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .exec();
    return conversations.map((c) => {
      const json = view(c);
      if (!json['kind']) json['kind'] = 'SHOP';
      return json;
    });
  }

  /** Mark the thread read for whichever side is viewing it. */
  async markRead(shopId: string, reader: string): Promise<void> {
    const shopObjectId = new Types.ObjectId(shopId);
    const readerIsAdmin = isAdminPanelRole(reader);

    await this.messageModel
      .updateMany(
        {
          shopId: shopObjectId,
          senderRole: readerIsAdmin
            ? { $in: [UserRole.SHOP_OWNER, EMPLOYEE_ROLE] }
            : { $nin: [UserRole.SHOP_OWNER, EMPLOYEE_ROLE] },
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
