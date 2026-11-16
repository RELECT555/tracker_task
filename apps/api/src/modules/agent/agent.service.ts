import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AgentError,
  createLlmClient,
  readAgentConfig,
  runAgentTurn,
  type ChatMessage,
} from '@mtkit/agent-integration';
import type { AuthenticatedUser } from '../../shared/presentation/decorators/current-user.decorator';
import { planChangeContext } from '../roadmap/roadmap-plan-change';
import { RoadmapProjectAccessService } from '../roadmap/roadmap-project-access.service';
import { RoadmapService } from '../roadmap/roadmap.service';
import {
  buildPlanSnapshot,
  checkChange,
  type AgentProposal,
  type ChangeInput,
} from './agent-plan';
import { createAgent, type AgentState } from './agent-tools';

const MAX_TOOL_RESULT_CHARS = 20_000;

export interface ChatInput {
  projectId: string;
  quarterKey: string;
  prompt: string;
  history?: unknown;
}

export interface ChatOutput {
  reply: string;
  history: ChatMessage[];
  proposals: AgentProposal[];
}

export interface ApplyResult {
  index: number;
  ok: boolean;
  error?: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger('Agent');
  private readonly config = readAgentConfig(process.env);
  private readonly llm = createLlmClient(this.config, {
    logger: this.logger,
  });

  constructor(
    private readonly roadmap: RoadmapService,
    private readonly access: RoadmapProjectAccessService,
  ) {}

  isConfigured() {
    return this.llm.isConfigured();
  }

  async chat(actor: AuthenticatedUser, input: ChatInput): Promise<ChatOutput> {
    if (!this.llm.isConfigured())
      throw new ServiceUnavailableException('AI-ассистент не настроен');

    const canEdit = await this.access.require(
      actor,
      { projectId: input.projectId },
      'read',
    );
    const state = await this.createState(actor, input, canEdit);

    try {
      const result = await runAgentTurn(
        createAgent(state),
        { prompt: input.prompt, history: input.history },
        state,
        {
          llm: this.llm,
          toolMode: this.config.toolMode,
          maxSteps: this.config.maxSteps,
          maxToolResultChars: MAX_TOOL_RESULT_CHARS,
          logger: this.logger,
        },
      );
      return {
        reply: result.reply,
        // Tool results are dropped: the plan is re-read on the next turn, and
        // the client never has to carry (or forge) plan data.
        history: result.history.filter(
          (message) =>
            (message.role === 'user' || message.role === 'assistant') &&
            !message.tool_calls?.length &&
            Boolean(message.content),
        ),
        proposals: result.state.proposals,
      };
    } catch (error) {
      if (error instanceof AgentError)
        throw new ServiceUnavailableException(error.message);
      throw error;
    }
  }

  /** Applies changes the user confirmed, with the user's own edit rights. */
  async apply(
    actor: AuthenticatedUser,
    projectId: string,
    changes: ChangeInput[],
  ): Promise<ApplyResult[]> {
    await this.access.require(actor, { projectId }, 'edit');

    // One batch for the whole apply; a proposal that fails logs nothing.
    const context = planChangeContext(
      { id: actor.id, email: actor.email },
      'ai',
    );
    const results: ApplyResult[] = [];
    for (const [index, change] of changes.entries()) {
      // Re-read each time: an earlier change may have affected the next one.
      const snapshot = buildPlanSnapshot(
        await this.roadmap.getProjectPlan(projectId, actor.id, true),
      );
      const check = checkChange(snapshot, change);
      if (!check.ok) {
        results.push({ index, ok: false, error: check.error });
        continue;
      }
      const { proposal, existing } = check;
      const member = snapshot.roles
        .find(({ id }) => id === proposal.roleId)
        ?.members.find(
          ({ personExternalId }) =>
            personExternalId === proposal.personExternalId,
        );
      try {
        await this.roadmap.saveAllocation(
          {
            allocationId: existing?.id,
            workItemId: proposal.workItemId,
            roleId: proposal.roleId,
            personExternalId: proposal.personExternalId,
            personName: proposal.personName,
            personEmail: member?.personEmail ?? undefined,
            quarterKey: proposal.quarterKey,
            estimatedHours: proposal.toHours,
            // saveAllocation replaces the periods, so keep the existing ones.
            periods: (existing?.periods ?? []).map((period) => ({
              ...period,
              monthKey: period.monthKey ?? undefined,
            })),
          },
          undefined,
          context,
        );
        results.push({ index, ok: true });
      } catch (error) {
        results.push({
          index,
          ok: false,
          error:
            error instanceof Error ? error.message : 'Не удалось сохранить',
        });
      }
    }
    return results;
  }

  private async createState(
    actor: AuthenticatedUser,
    input: ChatInput,
    canEdit: boolean,
  ): Promise<AgentState> {
    const plan = await this.roadmap.getProjectPlan(
      input.projectId,
      actor.id,
      canEdit,
    );
    return {
      projectId: input.projectId,
      quarterKey: input.quarterKey,
      canEdit,
      snapshot: buildPlanSnapshot(plan),
      proposals: [],
    };
  }
}
