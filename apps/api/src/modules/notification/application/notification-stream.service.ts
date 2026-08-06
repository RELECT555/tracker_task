import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface NotificationStreamEvent {
  userId: string;
  notificationId: string;
  type: string;
  title: string;
  requestId: string | null;
}

/**
 * In-process pub/sub for pushing new notifications to connected SSE clients.
 * Single-instance only — if the API ever runs multiple replicas, this needs
 * a shared bus (Redis pub/sub) instead.
 */
@Injectable()
export class NotificationStream {
  private readonly events$ = new Subject<NotificationStreamEvent>();

  publish(event: NotificationStreamEvent): void {
    this.events$.next(event);
  }

  forUser(userId: string) {
    return this.events$.asObservable().pipe(
      filter((event) => event.userId === userId),
      map((event) => ({ data: event })),
    );
  }
}
