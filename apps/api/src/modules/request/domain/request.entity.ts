import type { RequestPriority, RequestStatus, RouteSnapshot } from '@tracker/shared';
import { AccessDeniedError, InvalidTransitionError, ValidationError } from '../../../shared/domain/domain.error';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { RequestCreatedEvent } from './events/request-created.event';
import { RequestSubmittedEvent } from './events/request-submitted.event';
import {
  approveRouteStep,
  assertActiveAssignee,
  cancelRouteOnCancel,
  type ApproveStepResult,
  type ProvideInfoResult,
} from './request.actions';

export interface RequestProps {
  id: string;
  typeId: string;
  authorId: string;
  title: string;
  fields: Record<string, unknown>;
  status: RequestStatus;
  priority: RequestPriority;
  routeSnapshot: unknown | null;
  currentStepIndex: number | null;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  completedAt: Date | null;
}

export class Request extends AggregateRoot {
  private constructor(private props: RequestProps) {
    super();
  }

  static create(input: {
    id: string;
    typeId: string;
    authorId: string;
    title: string;
    fields?: Record<string, unknown>;
    priority?: RequestPriority;
  }): Request {
    if (!input.title.trim()) {
      throw new ValidationError('Title is required');
    }

    const now = new Date();
    const request = new Request({
      id: input.id,
      typeId: input.typeId,
      authorId: input.authorId,
      title: input.title.trim(),
      fields: input.fields ?? {},
      status: 'draft',
      priority: input.priority ?? 'normal',
      routeSnapshot: null,
      currentStepIndex: null,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
      completedAt: null,
    });

    request.raise(
      new RequestCreatedEvent(request.id, request.authorId, request.typeId),
    );

    return request;
  }

  static rehydrate(props: RequestProps): Request {
    return new Request(props);
  }

  get id(): string {
    return this.props.id;
  }

  get typeId(): string {
    return this.props.typeId;
  }

  get authorId(): string {
    return this.props.authorId;
  }

  get title(): string {
    return this.props.title;
  }

  get fields(): Record<string, unknown> {
    return this.props.fields;
  }

  get status(): RequestStatus {
    return this.props.status;
  }

  get priority(): RequestPriority {
    return this.props.priority;
  }

  get routeSnapshot(): unknown | null {
    return this.props.routeSnapshot;
  }

  get currentStepIndex(): number | null {
    return this.props.currentStepIndex;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get submittedAt(): Date | null {
    return this.props.submittedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  toProps(): RequestProps {
    return { ...this.props };
  }

  submitWithRoute(routeSnapshot: RouteSnapshot): void {
    if (this.props.status !== 'draft') {
      throw new InvalidTransitionError('Only draft requests can be submitted');
    }

    this.props.status = 'in_progress';
    this.props.submittedAt = new Date();
    this.props.routeSnapshot = routeSnapshot;
    this.props.currentStepIndex = 0;
    this.props.updatedAt = new Date();

    this.raise(
      new RequestSubmittedEvent(
        this.id,
        this.authorId,
        routeSnapshot.templateId,
      ),
    );
  }

  approve(actorId: string): ApproveStepResult {
    if (this.props.status !== 'in_progress') {
      throw new InvalidTransitionError('Only in-progress requests can be approved');
    }

    const routeSnapshot = this.props.routeSnapshot as RouteSnapshot;
    assertActiveAssignee(routeSnapshot, this.props.currentStepIndex, actorId);

    const result = approveRouteStep(routeSnapshot, this.props.currentStepIndex!);
    this.props.routeSnapshot = result.routeSnapshot;
    this.props.updatedAt = new Date();

    if (result.kind === 'completed') {
      this.props.status = 'approved';
      this.props.completedAt = new Date();
      return result;
    }

    this.props.currentStepIndex = result.nextStepIndex ?? this.props.currentStepIndex;
    return result;
  }

  reject(actorId: string): void {
    if (this.props.status !== 'in_progress') {
      throw new InvalidTransitionError('Only in-progress requests can be rejected');
    }

    const routeSnapshot = this.props.routeSnapshot as RouteSnapshot;
    assertActiveAssignee(routeSnapshot, this.props.currentStepIndex, actorId);

    const steps = routeSnapshot.steps.map((step, index) =>
      index === this.props.currentStepIndex
        ? { ...step, status: 'completed' as const }
        : step,
    );

    this.props.routeSnapshot = { ...routeSnapshot, steps };
    this.props.status = 'rejected';
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();
  }

  cancel(actorId: string): void {
    const cancellable: RequestStatus[] = ['draft', 'in_progress', 'pending_info'];
    if (!cancellable.includes(this.props.status)) {
      throw new InvalidTransitionError('Request cannot be cancelled in current status');
    }

    if (this.props.authorId !== actorId) {
      throw new AccessDeniedError('Only the author can cancel this request');
    }

    if (this.props.routeSnapshot) {
      this.props.routeSnapshot = cancelRouteOnCancel(this.props.routeSnapshot as RouteSnapshot);
    }

    this.props.status = 'cancelled';
    this.props.completedAt = new Date();
    this.props.updatedAt = new Date();
  }

  requestInfo(actorId: string): void {
    if (this.props.status !== 'in_progress') {
      throw new InvalidTransitionError('Only in-progress requests can request info');
    }

    const routeSnapshot = this.props.routeSnapshot as RouteSnapshot;
    assertActiveAssignee(routeSnapshot, this.props.currentStepIndex, actorId);

    this.props.status = 'pending_info';
    this.props.updatedAt = new Date();
  }

  provideInfo(authorId: string, fields: Record<string, unknown>): ProvideInfoResult {
    if (this.props.status !== 'pending_info') {
      throw new InvalidTransitionError('Only requests awaiting info can receive a response');
    }

    if (this.props.authorId !== authorId) {
      throw new AccessDeniedError('Only the author can provide info');
    }

    const routeSnapshot = this.props.routeSnapshot as RouteSnapshot;
    const stepIndex = this.props.currentStepIndex;
    if (stepIndex === null) {
      throw new InvalidTransitionError('Request has no active route step');
    }

    const step = routeSnapshot.steps[stepIndex];
    if (!step) {
      throw new InvalidTransitionError('Current route step not found');
    }

    this.props.fields = { ...this.props.fields, ...fields };
    this.props.status = 'in_progress';
    this.props.updatedAt = new Date();

    return {
      stepIndex,
      assigneeId: step.assignee.id,
      dueAt: step.dueAt ? new Date(step.dueAt) : null,
    };
  }
}
