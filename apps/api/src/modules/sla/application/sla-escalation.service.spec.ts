import { SlaEscalationService } from './sla-escalation.service';
import { EscalationService } from '../../request/application/services/escalation.service';
import { UserReader } from '../../request/domain/request.repository';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

describe('SlaEscalationService', () => {
  const prisma = {
    assignment: { findMany: jest.fn() },
  } as unknown as PrismaService;

  const userReader = {
    findManagerId: jest.fn(),
    findById: jest.fn(),
  } as unknown as UserReader;

  const escalation = {
    perform: jest.fn(),
  } as unknown as EscalationService;

  const service = new SlaEscalationService(prisma, userReader, escalation);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns zero counts when no overdue assignments', async () => {
    (prisma.assignment.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.checkAndEscalate();

    expect(result).toEqual({ processed: 0, skipped: 0 });
    expect(escalation.perform).not.toHaveBeenCalled();
  });

  it('auto-escalates overdue assignment to manager', async () => {
    (prisma.assignment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'asg-1',
        requestId: 'req-1',
        stepIndex: 0,
        assigneeId: 'mgr-1',
        assignee: { fullName: 'Manager' },
        request: {
          id: 'req-1',
          currentStepIndex: 0,
          routeSnapshot: {
            templateId: 'tpl',
            templateVersion: 1,
            steps: [
              {
                index: 0,
                name: 'Согласование',
                assignee: { id: 'mgr-1', fullName: 'Manager' },
                status: 'active',
                slaHours: 24,
                dueAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        },
      },
    ]);
    (userReader.findManagerId as jest.Mock).mockResolvedValue('dir-1');
    (userReader.findById as jest.Mock).mockResolvedValue({
      id: 'dir-1',
      fullName: 'Director',
      email: 'director@tracker.local',
    });
    (escalation.perform as jest.Mock).mockResolvedValue(undefined);

    const result = await service.checkAndEscalate();

    expect(result).toEqual({ processed: 1, skipped: 0 });
    expect(escalation.perform).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        actorId: 'mgr-1',
        action: 'sla_escalate',
        newAssignee: { id: 'dir-1', fullName: 'Director' },
      }),
    );
  });

  it('skips when assignment step is not current', async () => {
    (prisma.assignment.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'asg-1',
        requestId: 'req-1',
        stepIndex: 0,
        assigneeId: 'mgr-1',
        assignee: { fullName: 'Manager' },
        request: {
          id: 'req-1',
          currentStepIndex: 1,
          routeSnapshot: { steps: [] },
        },
      },
    ]);

    const result = await service.checkAndEscalate();

    expect(result).toEqual({ processed: 0, skipped: 1 });
    expect(escalation.perform).not.toHaveBeenCalled();
  });
});
