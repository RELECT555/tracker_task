import { DomainEvent } from '../../../../shared/domain/domain.event';

export class RequestCreatedEvent extends DomainEvent {
  readonly eventName = 'RequestCreated';

  constructor(
    readonly requestId: string,
    readonly authorId: string,
    readonly typeId: string,
  ) {
    super();
  }
}
