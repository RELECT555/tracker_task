import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';

export type ApprovalStepNodeData = {
  step: RouteStepFormValue;
  index: number;
  total: number;
  selected: boolean;
  invalid: boolean;
  interactive: boolean;
  onMove?: (index: number, direction: -1 | 1) => void;
};

export type InsertEdgeData = {
  at: number;
  interactive: boolean;
  onInsert?: (at: number) => void;
};

export const APPROVAL_STEP_NODE_TYPE = 'approvalStep';
export const INSERT_EDGE_TYPE = 'insertStep';

export const NODE_WIDTH = 248;
export const NODE_GAP = 104;

interface StepsToFlowOptions {
  invalidIndexes?: ReadonlySet<number>;
  interactive?: boolean;
  onInsert?: (at: number) => void;
  onMove?: (index: number, direction: -1 | 1) => void;
}

export function stepsToFlow(
  steps: RouteStepFormValue[],
  selectedIndex: number | null,
  options: StepsToFlowOptions = {},
) {
  const { invalidIndexes, interactive = false, onInsert, onMove } = options;

  const nodes = steps.map((step, index) => ({
    id: `step-${index}`,
    type: APPROVAL_STEP_NODE_TYPE,
    position: { x: index * (NODE_WIDTH + NODE_GAP), y: 40 },
    data: {
      step,
      index,
      total: steps.length,
      selected: selectedIndex === index,
      invalid: invalidIndexes?.has(index) ?? false,
      interactive,
      onMove,
    } satisfies ApprovalStepNodeData,
    draggable: false,
    selectable: true,
  }));

  const edges = steps.slice(0, -1).map((_, index) => ({
    id: `edge-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: INSERT_EDGE_TYPE,
    data: {
      at: index + 1,
      interactive,
      onInsert,
    } satisfies InsertEdgeData,
    style: { stroke: 'hsl(var(--border))', strokeWidth: 2 },
  }));

  return { nodes, edges };
}
