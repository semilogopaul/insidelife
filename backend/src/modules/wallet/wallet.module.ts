import { Module } from '@nestjs/common';
import { CharactersModule } from '../characters/characters.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { SocialGuardModule } from '../social/social-guard.module.js';
import { UsersModule } from '../users/users.module.js';
import { PeerMoneyModule } from './peer-money.module.js';
import { TransfersService } from './transfers.service.js';
import { TransfersController, WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

/** The Bank app: balances, statement, savings moves and player-to-player transfers. */
@Module({
  imports: [SimulationModule, CharactersModule, NotificationsModule, UsersModule, SocialGuardModule, PeerMoneyModule],
  controllers: [WalletController, TransfersController],
  providers: [WalletService, TransfersService],
})
export class WalletModule {}
