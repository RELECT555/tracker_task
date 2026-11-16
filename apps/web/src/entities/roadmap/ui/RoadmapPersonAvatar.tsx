'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { roadmapApi, type RoadmapPerson } from '../api/roadmapApi';

function personInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('ru-RU');
}

export function RoadmapPersonAvatar({ person, className }: { person: RoadmapPerson; className?: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failedSrc, setFailedSrc] = useState<string>();
  const { data } = useQuery({
    queryKey: ['roadmap', 'admin', 'user-avatar', person.id],
    queryFn: ({ signal }) => roadmapApi.adminPersonAvatar(person.id, signal),
    enabled: visible && !person.isMock,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (visible || person.isMock || !element.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [visible, person.isMock]);

  const src = data?.avatar;
  return (
    <span
      ref={element}
      aria-hidden="true"
      className={cn(
        'relative flex size-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-xs font-semibold sm:size-10',
        person.isActive !== false ? 'bg-status-progress-bg text-status-progress-fg' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {personInitials(person.name)}
      {src && src !== failedSrc ? (
        <img src={src} alt="" width={44} height={44} loading="lazy" className="absolute inset-0 size-full object-cover" onError={() => setFailedSrc(src)} />
      ) : null}
    </span>
  );
}
