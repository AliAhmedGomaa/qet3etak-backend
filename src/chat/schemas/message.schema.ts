import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ChatMessageDocument = HydratedDocument<ChatMessage>;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage {
  /**
   * Conversation key — shop User id or Employee id (same field as Conversation.shopId).
   */
  @Prop({ type: Types.ObjectId, required: true, index: true })
  shopId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  senderId!: Types.ObjectId;

  /** SHOP_OWNER | EMPLOYEE | ADMIN | MANAGER | STAFF | … */
  @Prop({ type: String, required: true })
  senderRole!: string;

  @Prop({ required: true, trim: true })
  text!: string;

  @Prop({ default: false })
  read!: boolean;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

ChatMessageSchema.index({ shopId: 1, createdAt: 1 });

ChatMessageSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: unknown, ret: any) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});
