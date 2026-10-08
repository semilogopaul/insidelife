import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';

/** How often pending system-account deltas are folded into balances. */
const ROLLUP_INTERVAL_MS = 5_000;

/** Keeps system-account balances (money supply, sinks, faucets) current without locking them in player transactions. */
@Injectable()
export class LedgerRollupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LedgerRollupScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly ledger: LedgerService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), ROLLUP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ledger.rollUpSystemBalances();
    } catch (error) {
      this.logger.warn(`System balance roll-up failed (will retry): ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
