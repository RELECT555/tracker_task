import type { RequestPriority, RequestStatus } from '@tracker/shared';
import { InvalidTransitionError, ValidationError } from '../../../shared/domain/domain.error';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { RequestCreatedEvent } from './events/request-created.event';

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

  submit(): void {
    if (this.props.status !== 'draft') {
      throw new InvalidTransitionError('Only draft requests can be submitted');
    }
    this.props.status = 'submitted';
    this.props.submittedAt = new Date();
    this.props.updatedAt = new Date();
  }
}
