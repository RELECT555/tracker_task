import { Suspense } from 'react';
import { SearchPage } from '@/views/search/ui/SearchPage';

// useSearchParams needs a Suspense boundary to keep the route out of static bailout.
export default function Page() {
  return (
    <Suspense>
      <SearchPage />
    </Suspense>
  );
}
