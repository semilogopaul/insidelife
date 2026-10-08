import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const stop = this.metrics.httpDuration.startTimer();
    return next.handle().pipe(
      finalize(() => {
        const route = (request.route as { path?: string } | undefined)?.path ?? 'unmatched';
        stop({ method: request.method, route, status: String(http.getResponse<Response>().statusCode) });
      }),
    );
  }
}
