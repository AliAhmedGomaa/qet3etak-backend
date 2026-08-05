import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Model } from 'mongoose';
import { getUploadsDir } from '../common/uploads';
import { Order } from '../orders/schemas/order.schema';

const RETENTION_DAYS = 15;

@Injectable()
export class DeliveryPhotosCleanupService {
  private readonly logger = new Logger(DeliveryPhotosCleanupService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
  ) {}

  /** Daily job: delete delivery proof photos older than 15 days. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldDeliveryPhotos(): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const orders = await this.orderModel
      .find({
        deliveryPhotoUrl: { $exists: true, $nin: [null, ''] },
        deliveredAt: { $lte: cutoff },
      })
      .select('_id deliveryPhotoUrl deliveredAt')
      .limit(500)
      .exec();

    let deleted = 0;
    const uploadsDir = getUploadsDir();

    for (const order of orders) {
      const url = (order.deliveryPhotoUrl || '').trim();
      if (!url) continue;

      const filename = url.split('/').pop();
      if (filename && filename.startsWith('delivery-proof-')) {
        const fullPath = join(uploadsDir, filename);
        try {
          if (existsSync(fullPath)) {
            unlinkSync(fullPath);
          }
        } catch (err) {
          this.logger.warn(
            `Failed to delete ${fullPath}: ${(err as Error).message}`,
          );
        }
      }

      order.deliveryPhotoUrl = '';
      await order.save();
      deleted += 1;
    }

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} delivery proof photo(s) older than ${RETENTION_DAYS} days`,
      );
    }
    return { deleted };
  }
}
