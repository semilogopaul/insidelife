import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SimulationModule } from '../simulation/simulation.module.js';
import { UsersModule } from '../users/users.module.js';
import { BettingController } from './betting.controller.js';
import { BettingService } from './betting.service.js';
import { BettingSystem } from './betting.system.js';
import { BetSlipEntity } from './entities/bet-slip.entity.js';
import { BettingProfileEntity } from './entities/betting-profile.entity.js';
import { LeagueService } from './league.service.js';

/**
 * The betting phone app: a virtual football league, always against the house, game naira only, 18+ by real age.
 * Results come from a server-only secret (`BETTING_SECRET`), never the public world seed.
 */
@Module({
  imports: [TypeOrmModule.forFeature([BetSlipEntity, BettingProfileEntity]), SimulationModule, UsersModule],
  controllers: [BettingController],
  providers: [LeagueService, BettingService, BettingSystem],
})
export class BettingModule {}
