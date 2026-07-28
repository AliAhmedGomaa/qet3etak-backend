import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

export type ChatParticipantKind = 'SHOP' | 'EMPLOYEE';

@Schema({ timestamps: true, collection: 'chat_conversations' })
export class Conversation {
  /**
   * Thread participant id:
   * - SHOP → shop-owner User._id
   * - EMPLOYEE → Employee._id
   * Kept as `shopId` for backward compatibility with existing shop threads.
   */
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['SHOP', 'EMPLOYEE'],
    default: 'SHOP',
    index: true,
  })
  kind!: ChatParticipantKind;

  /** Display name (shop name or employee full name). */
  @Prop({ trim: true, default: '' })
  shopName!: string;

  @Prop({ trim: true, default: '' })
  lastMessage!: string;

  @Prop({ type: Date, default: null })
  lastMessageAt!: Date | null;

  /** Unread messages waiting for the admin to read. */
  @Prop({ default: 0, min: 0 })
  unreadForAdmin!: number;

  /** Unread messages waiting for the shop/employee to read. */
  @Prop({ default: 0, min: 0 })
  unreadForShop!: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ kind: 1, lastMessageAt: -1 });

ConversationSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
