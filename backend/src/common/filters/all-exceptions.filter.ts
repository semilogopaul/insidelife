import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@insidelife/shared';
import { DomainException } from '../exceptions/domain.exception.js';
import { traceIdOf } from '../utils/trace.js';

const HTTP_ERROR_CODES: Readonly<Partial<Record<number, string>>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Global exception filter. Every error leaves the API in one shape; internal details never reach clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') return;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const traceId = traceIdOf(request);

    const { status, body } = this.toBody(exception, traceId);
    if (status >= 500) {
      this.logger.error({ err: exception, traceId, path: request.url }, 'Unhandled error');
    } else {
      this.logger.debug({ errorCode: body.errorCode, traceId, path: request.url }, 'Request rejected');
    }
    response.status(status).json(body);
  }

  private toBody(exception: unknown, traceId: string): { status: number; body: ApiErrorBody } {
    const timestamp = new Date().toISOString();

    if (exception instanceof DomainException) {
      return {
        status: exception.status,
        body: { errorCode: exception.errorCode, message: exception.message, timestamp, traceId, details: exception.details },
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: { errorCode: 'RATE_LIMITED', message: 'Slow down small — try again in a moment', timestamp, traceId },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const details =
        typeof payload === 'object' && payload !== null && 'message' in payload && Array.isArray(payload.message)
          ? payload.message.map(String)
          : undefined;
      const message = status >= 500 ? 'Something went wrong on our side' : details ? 'Some details need fixing' : exception.message;
      return {
        status,
        body: {
          errorCode: details ? 'VALIDATION_FAILED' : (HTTP_ERROR_CODES[status] ?? 'REQUEST_FAILED'),
          message,
          timestamp,
          traceId,
          details,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { errorCode: 'INTERNAL_ERROR', message: 'Something went wrong on our side', timestamp, traceId },
    };
  }
}
