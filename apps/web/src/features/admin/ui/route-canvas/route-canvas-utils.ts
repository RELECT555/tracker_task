import type { RouteStepFormValue } from '@/features/admin/ui/RouteStepEditor';

export type ApprovalStepNodeData = {
  step: RouteStepFormValue;
  index: number;
  selected: boolean;
};

export const APPROVAL_STEP_NODE_TYPE = 'approvalStep';

export const NODE_WIDTH = 220;
export const NODE_GAP = 80;

export function stepsToFlow(steps: RouteStepFormValue[], selectedIndex: number | null) {
  const nodes = steps.map((step, index) => ({
    id: `step-${index}`,
    type: APPROVAL_STEP_NODE_TYPE,
    position: { x: index * (NODE_WIDTH + NODE_GAP), y: 40 },
    data: {
      step,
      index,
      selected: selectedIndex === index,
    } satisfies ApprovalStepNodeData,
    draggable: false,
    selectable: true,
  }));

  const edges = steps.slice(0, -1).map((_, index) => ({
    id: `edge-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    animated: true,
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
  }));

  return { nodes, edges };
}
