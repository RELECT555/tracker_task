import { DomainEvent } from '../../../../shared/domain/domain.event';

export class RequestSubmittedEvent extends DomainEvent {
  readonly eventName = 'RequestSubmitted';

  constructor(
    readonly requestId: string,
    readonly authorId: string,
    readonly routeTemplateId: string,
  ) {
    super();
  }
}
