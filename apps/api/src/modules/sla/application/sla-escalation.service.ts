import { Injectable, Logger } from '@nestjs/common';
import type { RouteSnapshot } from '@tracker/shared';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { EscalationService } from '../../request/application/services/escalation.service';
import { UserReader } from '../../request/domain/request.repository';

@Injectable()
export class SlaEscalationService {
  private readonly logger = new Logger(SlaEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userReader: UserReader,
    private readonly escalation: EscalationService,
  ) {}

  async checkAndEscalate(): Promise<{ processed: number; skipped: number }> {
    const overdue = await this.prisma.assignment.findMany({
      where: {
        status: 'pending',
        dueAt: { not: null, lt: new Date() },
        request: { status: 'in_progress' },
      },
      include: {
        assignee: true,
        request: {
          select: {
            id: true,
            currentStepIndex: true,
            routeSnapshot: true,
          },
        },
      },
      orderBy: { dueAt: 'asc' },
      take: 50,
    });

    let processed = 0;
    let skipped = 0;

    for (const assignment of overdue) {
      try {
        const escalated = await this.escalateOverdueAssignment(assignment);
        if (escalated) {
          processed += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        skipped += 1;
        this.logger.warn(
          `SLA escalation failed for assignment ${assignment.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    if (processed > 0) {
      this.logger.log(`SLA auto-escalated ${processed} assignment(s)`);
    }

    return { processed, skipped };
  }

  private async escalateOverdueAssignment(assignment: {
    id: string;
    requestId: string;
    stepIndex: number;
    assigneeId: string;
    assignee: { fullName: string };
    request: {
      id: string;
      currentStepIndex: number | null;
      routeSnapshot: unknown;
    };
  }): Promise<boolean> {
    if (assignment.request.currentStepIndex !== assignment.stepIndex) {
      return false;
    }

    const route = assignment.request.routeSnapshot as RouteSnapshot | null;
    const step = route?.steps[assignment.stepIndex];
    if (!step || step.status !== 'active' || step.assignee.id !== assignment.assigneeId) {
      return false;
    }

    const managerId = await this.userReader.findManagerId(assignment.assigneeId);
    if (!managerId || managerId === assignment.assigneeId) {
      return false;
    }

    const manager = await this.userReader.findById(managerId);
    if (!manager) {
      return false;
    }

    const stepName = step.name;

    await this.escalation.perform({
      requestId: assignment.requestId,
      actorId: assignment.assigneeId,
      newAssignee: { id: manager.id, fullName: manager.fullName },
      action: 'sla_escalate',
      comment: `Автоэскалация: просрочен SLA шага «${stepName}»`,
      metadata: {
        assignmentId: assignment.id,
        previousAssigneeId: assignment.assigneeId,
        newAssigneeId: manager.id,
        triggeredBy: 'sla_checker',
      },
    });

    return true;
  }
}
