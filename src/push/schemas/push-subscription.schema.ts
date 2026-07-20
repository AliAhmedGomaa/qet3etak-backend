import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PushSubscriptionDocument = HydratedDocument<PushSubscriptionEntity>;

@Schema({ _id: false })
export class PushKeys {
  @Prop({ required: true })
  p256dh!: string;

  @Prop({ required: true })
  auth!: string;
}

export const PushKeysSchema = SchemaFactory.createForClass(PushKeys);

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionEntity {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  endpoint!: string;

  @Prop({ type: PushKeysSchema, required: true })
  keys!: PushKeys;

  @Prop({ default: 'SHOP_OWNER' })
  audience!: string;
}

export const PushSubscriptionSchema = SchemaFactory.createForClass(
  PushSubscriptionEntity,
);
