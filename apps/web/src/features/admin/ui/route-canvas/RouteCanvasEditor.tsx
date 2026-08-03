'use client';

import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus } from 'lucide-react';
import { ApprovalStepNode } from '@/features/admin/ui/route-canvas/ApprovalStepNode';
import { InsertStepEdge } from '@/features/admin/ui/route-canvas/InsertStepEdge';
import {
  APPROVAL_STEP_NODE_TYPE,
  INSERT_EDGE_TYPE,
  stepsToFlow,
} from '@/features/admin/ui/route-canvas/route-canvas-utils';
import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

const nodeTypes: NodeTypes = {
  [APPROVAL_STEP_NODE_TYPE]: ApprovalStepNode,
};

const edgeTypes: EdgeTypes = {
  [INSERT_EDGE_TYPE]: InsertStepEdge,
};

interface RouteCanvasEditorProps {
  steps: RouteStepFormValue[];
  selectedIndex: number | null;
  onSelectStep: (index: number | null) => void;
  readOnly?: boolean;
  /** Hide minimap and zoom controls — for inline previews */
  compact?: boolean;
  /** Indexes of steps that failed validation */
  invalidIndexes?: ReadonlySet<number>;
  /** Insert a new step at position `at` */
  onInsertStep?: (at: number) => void;
  /** Move step at `index` one position left (-1) or right (+1) */
  onMoveStep?: (index: number, direction: -1 | 1) => void;
  className?: string;
}

export function RouteCanvasEditor(props: RouteCanvasEditorProps) {
  return (
    <ReactFlowProvider>
      <RouteCanvasEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function RouteCanvasEditorInner({
  steps,
  selectedIndex,
  onSelectStep,
  readOnly = false,
  compact = false,
  invalidIndexes,
  onInsertStep,
  onMoveStep,
  className,
}: RouteCanvasEditorProps) {
  const flow = useMemo(
    () =>
      stepsToFlow(steps, selectedIndex, {
        invalidIndexes,
        interactive: !readOnly,
        onInsert: onInsertStep,
        onMove: onMoveStep,
      }),
    [steps, selectedIndex, invalidIndexes, readOnly, onInsertStep, onMoveStep],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  const { fitView } = useReactFlow();

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow.nodes, flow.edges, setNodes, setEdges]);

  // Re-frame the chain when its length changes so long routes stay readable.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.25, duration: 250, maxZoom: 1 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [steps.length, fitView]);

  return (
    <div className={cn('relative h-full w-full bg-muted/25 dark:bg-muted/10', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!readOnly}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        onNodeClick={(_, node) => {
          if (readOnly) return;
          const index = Number(node.id.replace('step-', ''));
          onSelectStep(Number.isFinite(index) ? index : null);
        }}
        onPaneClick={() => {
          if (!readOnly) onSelectStep(null);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="hsl(var(--border))" />
        {!compact ? (
          <Controls
            showInteractive={false}
            className="!bottom-4 !left-4 overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-sm [&_button]:!h-9 [&_button]:!w-9 [&_button]:!border-border [&_button]:!bg-card [&_button]:!text-foreground [&_button:hover]:!bg-accent"
          />
        ) : null}
        {!compact && steps.length > 3 ? (
          <MiniMap
            pannable
            zoomable
            className="!bottom-4 !right-4 !rounded-lg !border !border-border !bg-card"
            nodeColor={() => 'hsl(var(--primary))'}
            maskColor="hsl(var(--background) / 0.7)"
          />
        ) : null}
      </ReactFlow>

      {steps.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              Добавьте первый шаг согласования
            </p>
            {!readOnly && onInsertStep ? (
              <Button type="button" onClick={() => onInsertStep(0)}>
                <Plus className="h-4 w-4" />
                Добавить первый шаг
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
