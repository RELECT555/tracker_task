import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  CreateNotificationInput,
  ListNotificationsQuery,
  ListNotificationsResult,
  NotificationRepository,
} from '../domain/notification.repository';

@Injectable()
export class PrismaNotificationRepository extends NotificationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: CreateNotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: {
        id: input.id,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        requestId: input.requestId ?? null,
      },
    });
  }

  async list(query: ListNotificationsQuery): Promise<ListNotificationsResult> {
    const where = {
      userId: query.userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: query.userId, isRead: false } }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        requestId: row.requestId,
        isRead: row.isRead,
        createdAt: row.createdAt,
      })),
      total,
      unreadCount,
      page: query.page,
      limit: query.limit,
    };
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}
