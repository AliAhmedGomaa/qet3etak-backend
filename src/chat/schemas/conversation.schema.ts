import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true, collection: 'chat_conversations' })
export class Conversation {
  /** One conversation per shop owner. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  shopName!: string;

  @Prop({ trim: true, default: '' })
  lastMessage!: string;

  @Prop({ type: Date, default: null })
  lastMessageAt!: Date | null;

  /** Unread messages waiting for the admin to read (sent by the shop). */
  @Prop({ default: 0, min: 0 })
  unreadForAdmin!: number;

  /** Unread messages waiting for the shop to read (sent by the admin). */
  @Prop({ default: 0, min: 0 })
  unreadForShop!: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ lastMessageAt: -1 });

ConversationSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
