'use client';

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { Plus } from 'lucide-react';
import type { InsertEdgeData } from '@/features/admin/ui/route-canvas/route-canvas-utils';

export function InsertStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });

  const edgeData = data as InsertEdgeData | undefined;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      {edgeData?.interactive && edgeData.onInsert ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label={`Вставить шаг перед шагом ${edgeData.at + 1}`}
            title="Вставить шаг"
            className="nodrag nopan pointer-events-auto absolute inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-45 shadow-sm transition-all hover:scale-110 hover:border-primary hover:bg-primary hover:text-primary-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onClick={(event) => {
              event.stopPropagation();
              edgeData.onInsert?.(edgeData.at);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
