import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webpush from 'web-push';
import { UsersService } from '../users/users.service';
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

export type BroadcastResult = {
  targeted: number;
  sent: number;
  failed: number;
  enabled: boolean;
};

export type PushDebugStats = {
  enabled: boolean;
  vapidPublicKeyPrefix: string;
  vapidSubject: string;
  totals: {
    all: number;
    admin: number;
    shopOwner: number;
  };
  recentEndpoints: Array<{
    audience: string;
    userId: string;
    endpointHost: string;
    updatedAt?: string;
  }>;
};

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
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
      this.logger.warn(
        '[push] VAPID keys missing — push notifications DISABLED (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY)',
      );
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
      this.logger.log(
        `[push] VAPID OK subject=${subject} publicKeyPrefix=${publicKey.slice(0, 12)}…`,
      );
    } catch (err) {
      this.enabled = false;
      this.logger.error(
        `[push] VAPID setup FAILED — push disabled: ${(err as Error).message}`,
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
    const host = this.endpointHost(subscription.endpoint);
    this.logger.log(
      `[push] subscribe start audience=${audience} userId=${userId} endpointHost=${host}`,
    );
    const doc = (await this.subModel
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
      .exec()) as PushSubscriptionDocument;
    this.logger.log(
      `[push] subscribe saved audience=${audience} userId=${userId} subId=${String(doc._id)} endpointHost=${host}`,
    );
    return doc;
  }

  async removeSubscription(userId: string, endpoint?: string): Promise<void> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (endpoint) filter['endpoint'] = endpoint;
    const res = await this.subModel.deleteMany(filter).exec();
    this.logger.log(
      `[push] unsubscribe userId=${userId} endpointHost=${endpoint ? this.endpointHost(endpoint) : 'ALL'} deleted=${res.deletedCount ?? 0}`,
    );
  }

  async notifyUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      this.logger.warn(
        `[push] notifyUser SKIPPED (VAPID off) userId=${userId} tag=${payload.tag ?? '-'} title="${payload.title}"`,
      );
      return 0;
    }
    const subs = await this.subModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    this.logger.log(
      `[push] notifyUser userId=${userId} subs=${subs.length} tag=${payload.tag ?? '-'} title="${payload.title}"`,
    );
    if (!subs.length) {
      this.logger.warn(
        `[push] notifyUser NO_SUBSCRIPTIONS userId=${userId} — shop must enable notifications on HTTPS/PWA`,
      );
      return 0;
    }
    const { sent, failed } = await this.sendToSubs(subs, payload, 'notifyUser');
    return sent;
  }

  async broadcastToShopOwners(
    payload: PushPayload,
    shopIds?: string[],
  ): Promise<BroadcastResult> {
    if (!this.enabled) {
      this.logger.warn(
        `[push] broadcast SKIPPED (VAPID off) title="${payload.title}"`,
      );
      return { targeted: 0, sent: 0, failed: 0, enabled: false };
    }

    const filter: Record<string, unknown> = { audience: 'SHOP_OWNER' };
    let targeted: number;

    const selected = [
      ...new Set((shopIds ?? []).map((id) => id.trim()).filter(Boolean)),
    ];

    if (selected.length) {
      const shops =
        await this.usersService.findApprovedShopOwnersByIds(selected);
      if (shops.length !== selected.length) {
        const found = new Set(shops.map((s) => String(s._id)));
        const invalidShopIds = selected.filter((id) => !found.has(id));
        this.logger.warn(
          `[push] broadcast invalid shopIds=${invalidShopIds.join(',')}`,
        );
        throw new BadRequestException({
          message:
            'Some shopIds are invalid or not eligible (must be approved shop owners)',
          invalidShopIds,
        });
      }
      filter['userId'] = { $in: shops.map((s) => s._id) };
      targeted = shops.length;
    } else {
      targeted = await this.usersService.countApprovedShopOwners();
    }

    const subs = await this.subModel.find(filter).exec();
    this.logger.log(
      `[push] broadcast shopsTargeted=${targeted} subs=${subs.length} title="${payload.title}"`,
    );
    if (!subs.length) {
      this.logger.warn(
        '[push] broadcast NO_SUBSCRIPTIONS — no shop owner has enabled push',
      );
      return { targeted, sent: 0, failed: 0, enabled: true };
    }
    const { sent, failed } = await this.sendToSubs(subs, payload, 'broadcast');
    return { targeted, sent, failed, enabled: true };
  }

  async notifyAdmins(payload: PushPayload): Promise<number> {
    if (!this.enabled) {
      this.logger.warn(
        `[push] notifyAdmins SKIPPED (VAPID off) tag=${payload.tag ?? '-'} title="${payload.title}"`,
      );
      return 0;
    }
    const subs = await this.subModel.find({ audience: 'ADMIN' }).exec();
    this.logger.log(
      `[push] notifyAdmins subs=${subs.length} tag=${payload.tag ?? '-'} title="${payload.title}"`,
    );
    if (!subs.length) {
      this.logger.warn(
        '[push] notifyAdmins NO_SUBSCRIPTIONS — admin must click تفعيل الإشعارات on HTTPS/PWA',
      );
      return 0;
    }
    const { sent } = await this.sendToSubs(subs, payload, 'notifyAdmins');
    return sent;
  }

  /** Admin diagnostics: subscription counts + recent endpoints (no secrets). */
  async debugStats(): Promise<PushDebugStats> {
    const publicKey = this.getPublicKey();
    const subject = (
      this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@qet3etak.com'
    ).trim();
    const [all, admin, shopOwner, recent] = await Promise.all([
      this.subModel.countDocuments().exec(),
      this.subModel.countDocuments({ audience: 'ADMIN' }).exec(),
      this.subModel.countDocuments({ audience: 'SHOP_OWNER' }).exec(),
      this.subModel
        .find()
        .sort({ updatedAt: -1 })
        .limit(20)
        .select('audience userId endpoint updatedAt')
        .lean()
        .exec(),
    ]);

    this.logger.log(
      `[push] debugStats enabled=${this.enabled} all=${all} admin=${admin} shopOwner=${shopOwner}`,
    );

    return {
      enabled: this.enabled,
      vapidPublicKeyPrefix: publicKey ? `${publicKey.slice(0, 12)}…` : '',
      vapidSubject: subject,
      totals: { all, admin, shopOwner },
      recentEndpoints: recent.map((row) => {
        const updatedAt = (row as { updatedAt?: Date }).updatedAt;
        return {
          audience: String(row.audience ?? ''),
          userId: String(row.userId ?? ''),
          endpointHost: this.endpointHost(String(row.endpoint ?? '')),
          updatedAt:
            updatedAt instanceof Date ? updatedAt.toISOString() : undefined,
        };
      }),
    };
  }

  private async sendToSubs(
    subs: PushSubscriptionDocument[],
    payload: PushPayload,
    source: string,
  ): Promise<{ sent: number; failed: number }> {
    if (!subs.length) {
      this.logger.warn(`[push] ${source} send skipped — empty subscription list`);
      return { sent: 0, failed: 0 };
    }

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
    let failed = 0;
    await Promise.all(
      subs.map(async (sub) => {
        const host = this.endpointHost(sub.endpoint);
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
          this.logger.log(
            `[push] ${source} SENT userId=${String(sub.userId)} audience=${sub.audience} host=${host}`,
          );
        } catch (err: unknown) {
          failed += 1;
          const status = (err as { statusCode?: number })?.statusCode;
          const message = (err as Error)?.message;
          this.logger.warn(
            `[push] ${source} FAIL status=${status ?? 'err'} host=${host} userId=${String(sub.userId)} msg=${message ?? ''}`,
          );
          if (status === 404 || status === 410) {
            await this.subModel.deleteOne({ _id: sub._id }).exec();
            this.logger.warn(
              `[push] removed stale subscription host=${host} status=${status}`,
            );
          }
        }
      }),
    );
    this.logger.log(
      `[push] ${source} summary sent=${sent} failed=${failed} total=${subs.length} tag=${payload.tag ?? '-'} title="${payload.title}"`,
    );
    return { sent, failed };
  }

  private endpointHost(endpoint: string): string {
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint.slice(0, 40) || 'invalid';
    }
  }
}
