'use client';

import { useEffect, useRef } from 'react';
import { baseURL } from '@/shared/api/client';
import { getAccessToken } from '@/shared/lib/auth-storage';

export interface NotificationStreamEvent {
  userId: string;
  notificationId: string;
  type: string;
  title: string;
  requestId: string | null;
}

/**
 * Subscribes to the SSE notification stream and calls onEvent for each push.
 * EventSource can't set an Authorization header, so the token travels as a
 * query param; reconnects automatically on drops (native EventSource behavior).
 */
export function useNotificationStream(onEvent: (event: NotificationStreamEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = getAccessToken();
    if (!token || typeof window === 'undefined') return;

    const url = `${baseURL}/notifications/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);

    source.onmessage = (message) => {
      try {
        const payload = JSON.parse(message.data) as NotificationStreamEvent;
        onEventRef.current(payload);
      } catch {
        // ignore malformed events
      }
    };

    return () => source.close();
  }, []);
}
