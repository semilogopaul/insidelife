import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';

/**
 * Prometheus metrics. Besides process/HTTP metrics we track the game economy itself: money created (faucets),
 * destroyed (sinks) and settlement latency — the numbers that would have caught Lagos Life's hyperinflation early.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  readonly moneyFlow = new Counter({
    name: 'economy_money_flow_naira_total',
    help: 'Naira moved between players and the system, by direction (faucet/sink) and ledger kind',
    labelNames: ['direction', 'kind'] as const,
    registers: [this.registry],
  });

  readonly settleDuration = new Histogram({
    name: 'simulation_settle_duration_seconds',
    help: 'Time to settle a character up to now',
    buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [this.registry],
  });

  readonly settledGameDays = new Histogram({
    name: 'simulation_settled_game_days',
    help: 'Game days processed per settlement',
    buckets: [0, 0.1, 0.5, 1, 3, 7, 30, 90, 365],
    registers: [this.registry],
  });

  readonly shedRequests = new Counter({
    name: 'http_requests_shed_total',
    help: 'HTTP requests refused with 503 SERVER_BUSY because the node was overloaded (OVERLOAD_LAG_MS)',
    registers: [this.registry],
  });

  readonly eventLoopDelayP99 = new Gauge({
    name: 'overload_event_loop_delay_p99_seconds',
    help: 'p99 event-loop delay over the last second, as judged by the load shedder',
    registers: [this.registry],
  });

  readonly onlinePlayers = new Gauge({
    name: 'realtime_online_players',
    help: 'Players connected to the realtime gateway on this instance',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
