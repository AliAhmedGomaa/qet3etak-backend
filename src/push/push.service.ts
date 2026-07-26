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
import { AppNotification } from './schemas/app-notification.schema';
import { UserStatus } from '../common/enums/user.enums';

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type BroadcastResult = {
  targeted: number;
  /** How many push subscriptions matched the targeted shops. */
  subscriptions: number;
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
    p256dhLen?: number;
    authLen?: number;
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
    @InjectModel(AppNotification.name)
    private readonly notifModel: Model<AppNotification>,
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
    const p256dh = this.normalizeKey(subscription.keys?.p256dh);
    const auth = this.normalizeKey(subscription.keys?.auth);
    // Uncompressed P-256 point is 65 bytes (~87 base64url); auth secret is 16 bytes (~22).
    if (!subscription.endpoint?.startsWith('https://')) {
      throw new BadRequestException('Invalid push endpoint');
    }
    if (p256dh.length < 80 || auth.length < 20) {
      this.logger.warn(
        `[push] subscribe REJECTED bad key lengths p256dh=${p256dh.length} auth=${auth.length} host=${host}`,
      );
      throw new BadRequestException(
        `Invalid push keys (p256dh=${p256dh.length}, auth=${auth.length})`,
      );
    }
    this.logger.log(
      `[push] subscribe start audience=${audience} userId=${userId} endpointHost=${host} p256dhLen=${p256dh.length} authLen=${auth.length}`,
    );
    const doc = (await this.subModel
      .findOneAndUpdate(
        { endpoint: subscription.endpoint },
        {
          userId: new Types.ObjectId(userId),
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
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

  /**
   * Send a payload-less push (still wakes the SW). Useful to verify the
   * subscription/delivery path without payload encryption.
   */
  async tickleUser(userId: string): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.subModel
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    let sent = 0;
    for (const sub of subs) {
      const host = this.endpointHost(sub.endpoint);
      try {
        await webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        });
        sent += 1;
        this.logger.log(
          `[push] tickle SENT userId=${userId} host=${host}`,
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        const message = (err as Error)?.message;
        this.logger.warn(
          `[push] tickle FAIL status=${status ?? 'err'} host=${host} msg=${message ?? ''}`,
        );
        if (status === 404 || status === 410) {
          await this.subModel.deleteOne({ _id: sub._id }).exec();
        }
      }
    }
    return sent;
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
    await this.enqueueForUsers([userId], payload);
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
        `[push] notifyUser NO_SUBSCRIPTIONS userId=${userId} — inbox still queued for polling`,
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
      return {
        targeted: 0,
        subscriptions: 0,
        sent: 0,
        failed: 0,
        enabled: false,
      };
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

    // Inbox for polling (works even when FCM is blocked by the OS).
    if (selected.length) {
      await this.enqueueForUsers(selected, payload);
    } else if (subs.length) {
      await this.enqueueForUsers(
        [...new Set(subs.map((s) => String(s.userId)))],
        payload,
      );
    }

    if (!subs.length) {
      this.logger.warn(
        '[push] broadcast NO_SUBSCRIPTIONS — no shop owner has enabled push',
      );
      return {
        targeted,
        subscriptions: 0,
        sent: 0,
        failed: 0,
        enabled: true,
      };
    }
    const { sent, failed } = await this.sendToSubs(subs, payload, 'broadcast');
    return {
      targeted,
      subscriptions: subs.length,
      sent,
      failed,
      enabled: true,
    };
  }

  async notifyAdmins(payload: PushPayload): Promise<number> {
    const adminIds = await this.resolveAdminUserIds();
    await this.enqueueForUsers(adminIds, payload);

    if (!this.enabled) {
      this.logger.warn(
        `[push] notifyAdmins SKIPPED (VAPID off) tag=${payload.tag ?? '-'} title="${payload.title}"`,
      );
      return 0;
    }
    const subs = await this.subModel.find({ audience: 'ADMIN' }).exec();
    this.logger.log(
      `[push] notifyAdmins subs=${subs.length} inbox=${adminIds.length} tag=${payload.tag ?? '-'} title="${payload.title}"`,
    );
    if (!subs.length) {
      this.logger.warn(
        '[push] notifyAdmins NO_SUBSCRIPTIONS — inbox still queued for polling',
      );
      return 0;
    }
    const { sent } = await this.sendToSubs(subs, payload, 'notifyAdmins');
    return sent;
  }

  async listUnreadInbox(
    userId: string,
    limit = 20,
  ): Promise<
    Array<{
      id: string;
      title: string;
      body: string;
      url: string;
      tag: string;
      createdAt?: string;
    }>
  > {
    const rows = await this.notifModel
      .find({ userId: new Types.ObjectId(userId), read: false })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 50))
      .lean()
      .exec();
    return rows.map((row) => {
      const createdAt = (row as { createdAt?: Date }).createdAt;
      return {
        id: String(row._id),
        title: String(row.title ?? ''),
        body: String(row.body ?? ''),
        url: String(row.url ?? '/'),
        tag: String(row.tag ?? 'qet3etak'),
        createdAt:
          createdAt instanceof Date ? createdAt.toISOString() : undefined,
      };
    });
  }

  async markInboxRead(userId: string, ids?: string[]): Promise<number> {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      read: false,
    };
    if (ids?.length) {
      filter['_id'] = {
        $in: ids
          .filter((id) => Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id)),
      };
    }
    const res = await this.notifModel.updateMany(filter, { read: true }).exec();
    return res.modifiedCount ?? 0;
  }

  private async enqueueForUsers(
    userIds: string[],
    payload: PushPayload,
  ): Promise<void> {
    const unique = [
      ...new Set(userIds.map((id) => id.trim()).filter((id) => Types.ObjectId.isValid(id))),
    ];
    if (!unique.length) return;
    try {
      await this.notifModel.insertMany(
        unique.map((id) => ({
          userId: new Types.ObjectId(id),
          title: payload.title,
          body: payload.body,
          url: payload.url || '/',
          tag: payload.tag || `qet3etak-${Date.now()}`,
          read: false,
        })),
        { ordered: false },
      );
      this.logger.log(
        `[push] inbox queued recipients=${unique.length} title="${payload.title}"`,
      );
    } catch (err) {
      this.logger.warn(
        `[push] inbox enqueue failed: ${(err as Error).message}`,
      );
    }
  }

  private async resolveAdminUserIds(): Promise<string[]> {
    const fromSubs = await this.subModel.distinct('userId', {
      audience: 'ADMIN',
    });
    const ids = new Set(fromSubs.map((id) => String(id)));
    try {
      const staff = await this.usersService.findStaff(
        undefined,
        UserStatus.APPROVED,
        1,
        200,
      );
      for (const u of staff.items) ids.add(String(u._id));
    } catch {
      /* ignore */
    }
    return [...ids];
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
        .select('audience userId endpoint updatedAt keys')
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
        const keys = (row as { keys?: { p256dh?: string; auth?: string } }).keys;
        return {
          audience: String(row.audience ?? ''),
          userId: String(row.userId ?? ''),
          endpointHost: this.endpointHost(String(row.endpoint ?? '')),
          p256dhLen: keys?.p256dh?.length ?? 0,
          authLen: keys?.auth?.length ?? 0,
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
        tag: payload.tag || `qet3etak-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
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
      // Flat fallbacks some SWs read at the top level
      title: payload.title,
      body: payload.body,
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

  /** Browser keys sometimes get `+` turned into spaces in transit. */
  private normalizeKey(value: string | undefined): string {
    return String(value ?? '')
      .trim()
      .replace(/ /g, '+');
  }
}
