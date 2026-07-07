export abstract class DomainEvent {
  readonly occurredAt = new Date();

  abstract get eventName(): string;
}
