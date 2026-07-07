export abstract class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND');
  }
}

export class AccessDeniedError extends DomainError {
  constructor(message = 'Access denied') {
    super(message, 'ACCESS_DENIED');
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_TRANSITION');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION');
  }
}
