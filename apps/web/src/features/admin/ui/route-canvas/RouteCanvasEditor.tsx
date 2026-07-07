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
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ApprovalStepNode } from '@/features/admin/ui/route-canvas/ApprovalStepNode';
import {
  APPROVAL_STEP_NODE_TYPE,
  stepsToFlow,
} from '@/features/admin/ui/route-canvas/route-canvas-utils';
import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';
import { cn } from '@/shared/lib/utils';

const nodeTypes: NodeTypes = {
  [APPROVAL_STEP_NODE_TYPE]: ApprovalStepNode,
};

interface RouteCanvasEditorProps {
  steps: RouteStepFormValue[];
  selectedIndex: number | null;
  onSelectStep: (index: number | null) => void;
  readOnly?: boolean;
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
  className,
}: RouteCanvasEditorProps) {
  const flow = useMemo(
    () => stepsToFlow(steps, selectedIndex),
    [steps, selectedIndex],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);

  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [flow.nodes, flow.edges, setNodes, setEdges]);

  return (
    <div className={cn('h-[420px] w-full rounded-xl border border-border bg-muted/10', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!readOnly}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.4}
        maxZoom={1.4}
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
        <Background gap={20} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={() => 'hsl(var(--primary))'}
          maskColor="hsl(var(--background) / 0.75)"
        />
      </ReactFlow>
    </div>
  );
}
