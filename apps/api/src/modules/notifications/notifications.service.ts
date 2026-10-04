import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { notifications } from '../../database/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import {
  IPushProvider,
  PUSH_PROVIDER_TOKEN,
} from '../../common/providers/push/push.provider.interface.js';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly dbService: DatabaseService,
    @Inject(PUSH_PROVIDER_TOKEN) private readonly pushProvider: IPushProvider,
  ) {}

  async listNotifications(userId: string, limit = 30) {
    const list = await this.dbService.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return list.map((n) => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      body: n.body,
      type: n.type,
      data: n.data,
      readAt: n.readAt?.toISOString() || null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async markAsRead(notificationId: string, userId: string) {
    const [updated] = await this.dbService.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('الإشعار غير موجود');
    }

    return { success: true };
  }

  async createNotification(userId: string, title: string, body: string, type: string, data = {}) {
    const [item] = await this.dbService.db
      .insert(notifications)
      .values({
        userId,
        title,
        body,
        type,
        data,
      })
      .returning();

    // Fire push delivery through pluggable push provider
    try {
      await this.pushProvider.sendNotification(
        {
          endpoint: `user:${userId}`,
          keys: { p256dh: '', auth: '' },
        },
        {
          title,
          body,
          data,
        },
      );
    } catch {
      // Non-blocking push delivery failure
    }

    return item;
  }
}
