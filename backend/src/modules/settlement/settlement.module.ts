import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SETTLEMENT_QUEUE } from './settlement.constants.js';
import { SettlementProcessor } from './settlement.processor.js';
import { SettlementScheduler } from './settlement.scheduler.js';

@Module({
  imports: [SimulationModule, BullModule.registerQueue({ name: SETTLEMENT_QUEUE })],
  providers: [SettlementProcessor, SettlementScheduler],
})
export class SettlementModule {}
