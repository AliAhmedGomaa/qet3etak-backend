import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AppNotificationDocument = HydratedDocument<AppNotification>;

@Schema({ timestamps: true, collection: 'app_notifications' })
export class AppNotification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ default: '/' })
  url!: string;

  @Prop({ default: 'qet3etak' })
  tag!: string;

  @Prop({ default: false, index: true })
  read!: boolean;
}

export const AppNotificationSchema =
  SchemaFactory.createForClass(AppNotification);

AppNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
