import { cn } from '@/shared/lib/utils';

// Muted Azure Boards hues for the Roadmap's light and dark surfaces.
const iconColors = {
  epic: 'text-[#dd7c25] dark:text-[#e09650]',
  feature: 'text-[#795089] dark:text-[#ad8dbd]',
};

export function AzureWorkItemIcon({ type, className }: { type: string; className?: string }) {
  const icon = type.toLowerCase();
  if (icon !== 'epic' && icon !== 'feature') return null;

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" className={cn('size-4 shrink-0', iconColors[icon], className)}>
      <use href={`/azure-work-item-icons.svg#${icon}`} />
    </svg>
  );
}
