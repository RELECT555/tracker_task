'use client';

import { use } from 'react';
import { RequestDetailPage } from '@/views/request-detail/ui/RequestDetailPage';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <RequestDetailPage requestId={id} />;
}
