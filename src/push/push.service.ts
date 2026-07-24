import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import {
  PushSubscriptionEntity,
  PushSubscriptionDocument,
} from './schemas/push-subscription.schema';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(PushSubscriptionEntity.name)
    private readonly subModel: Model<PushSubscriptionEntity>,
  ) {}

  onModuleInit(): void {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = (
      this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@qet3etak.com'
    ).trim();

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys missing — push notifications disabled');
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
      this.logger.log(`Web Push VAPID configured (${subject})`);
    } catch (err) {
      this.enabled = false;
      this.logger.error(
        `VAPID setup failed — push disabled: ${(err as Error).message}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY', '').trim();
  }

  async saveSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    audience: 'SHOP_OWNER' | 'ADMIN' = 'SHOP_OWNER',
  ): Promise<PushSubscriptionDocument> {
    return this.subModel
      .findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
          userId: new Types.ObjectId(userId),
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          audience,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )
      .exec() as Promise<PushSubscriptionDocument>;
  }

  async removeSubscription(userId: string, endpoint?: string): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (endpoint) filter['endpoint'] = endpoint;
    await this.subModel.deleteMany(filter).exec();
  }

  async notifyUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      this.logger.warn('notifyUser skipped — VAPID not enabled');
      return 0;
    }
    const subs = await this.subModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    return this.sendToSubs(subs, payload);
  }

  async broadcastToShopOwners(payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      this.logger.warn('broadcast skipped — VAPID not enabled');
      return 0;
    }
    const subs = await this.subModel.find({ audience: 'SHOP_OWNER' }).exec();
    return this.sendToSubs(subs, payload);
  }

  async notifyAdmins(payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      this.logger.warn('notifyAdmins skipped — VAPID not enabled');
      return 0;
    }
    const subs = await this.subModel.find({ audience: 'ADMIN' }).exec();
    return this.sendToSubs(subs, payload);
  }

  private async sendToSubs(
    subs: PushSubscriptionDocument[],
    payload: PushPayload,
  ): Promise<number> {
    if (!subs.length) {
      this.logger.debug('No push subscriptions for payload');
      return 0;
    }

    // Angular ngsw expects { notification: { title, body, ... } }
    // Icon paths must be absolute from the app origin (SW scope).
    const body = JSON.stringify({
      notification: {
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: payload.tag || 'qet3etak',
        renotify: true,
        data: {
          url: payload.url || '/',
          onActionClick: {
            default: {
              operation: 'openWindow',
              url: payload.url || '/',
            },
          },
        },
      },
    });

    let sent = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            },
            body,
            {
              TTL: 60 * 60,
              urgency: 'high',
            },
          );
          sent += 1;
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          const message = (err as Error)?.message;
          this.logger.warn(
            `Push failed (${status ?? 'err'}) ${message ?? ''} for ${sub.endpoint.slice(0, 48)}`,
          );
          if (status === 404 || status === 410) {
            await this.subModel.deleteOne({ _id: sub._id }).exec();
          }
        }
      }),
    );
    this.logger.log(`Push sent ${sent}/${subs.length}`);
    return sent;
  }
}
