import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  ConversationDocument,
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

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: number }).code === 11000
  );
}

function requireObjectId(id: string, label: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestException(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
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
    const shopObjectId = requireObjectId(input.shopId, 'chat participant id');
    const senderObjectId = requireObjectId(input.senderId, 'sender id');
    const text = input.text.trim();
    const fromParticipant = isChatParticipantRole(input.senderRole);
    const kind: ChatParticipantKind = input.kind || 'SHOP';

    const message = await this.messageModel.create({
      shopId: shopObjectId,
      senderId: senderObjectId,
      senderRole: input.senderRole,
      text,
      read: false,
    });

    const $set: Record<string, unknown> = {
      lastMessage: text,
      lastMessageAt: new Date(),
      kind,
    };
    if (input.shopName) $set['shopName'] = input.shopName;

    const conversation = await this.upsertConversation(shopObjectId, {
      $set,
      $inc: fromParticipant ? { unreadForAdmin: 1 } : { unreadForShop: 1 },
      $setOnInsert: { shopId: shopObjectId },
    });

    const messageView = view(message);
    const displayName =
      (conversation?.shopName as string) || input.shopName || 'محادثة';

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
    const shopObjectId = requireObjectId(shopId, 'chat participant id');
    const messages = await this.messageModel
      .find({ shopId: shopObjectId })
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
    const shopObjectId = requireObjectId(shopId, 'chat participant id');
    const $set: Record<string, unknown> = { kind };
    if (shopName) $set['shopName'] = shopName;

    // Use disjoint operator paths only — mixing `$setOnInsert.kind` with
    // `$set.kind` (or bare fields Mongoose wraps as `$set`) makes MongoDB
    // reject the update with ConflictingUpdateOperators → HTTP 500.
    const conversation = await this.upsertConversation(shopObjectId, {
      $setOnInsert: { shopId: shopObjectId },
      $set,
    });
    return view(conversation!);
  }

  /**
   * Upsert a conversation, retrying once on unique-index races when the
   * socket connect and REST thread load create the same thread together.
   */
  private async upsertConversation(
    shopObjectId: Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<ConversationDocument | null> {
    try {
      return await this.conversationModel
        .findOneAndUpdate({ shopId: shopObjectId }, update, {
          upsert: true,
          returnDocument: 'after',
          setDefaultsOnInsert: true,
        })
        .exec();
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      this.logger.warn(
        `Chat conversation upsert race for ${String(shopObjectId)}; retrying find`,
      );
      // Apply non-insert operators on the winner of the race.
      const retryUpdate = { ...update };
      delete retryUpdate['$setOnInsert'];
      if (Object.keys(retryUpdate).length === 0) {
        return this.conversationModel.findOne({ shopId: shopObjectId }).exec();
      }
      return this.conversationModel
        .findOneAndUpdate({ shopId: shopObjectId }, retryUpdate, {
          returnDocument: 'after',
        })
        .exec();
    }
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
    const shopObjectId = requireObjectId(shopId, 'chat participant id');
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
        { returnDocument: 'after' },
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
