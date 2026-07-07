import { DomainEvent } from './domain.event';

export abstract class AggregateRoot {
  private _domainEvents: DomainEvent[] = [];

  protected raise(event: DomainEvent): void {
    this._domainEvents.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
