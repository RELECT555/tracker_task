import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../../domain/domain.error';

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusMap: Record<string, HttpStatus> = {
      NOT_FOUND: HttpStatus.NOT_FOUND,
      ACCESS_DENIED: HttpStatus.FORBIDDEN,
      INVALID_TRANSITION: HttpStatus.CONFLICT,
      VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
      ROUTE_NOT_ALLOWED: HttpStatus.CONFLICT,
      BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
    };

    const status =
      statusMap[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      error: {
        code: exception.code,
        message: exception.message,
      },
    });
  }
}
