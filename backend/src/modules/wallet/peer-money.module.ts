import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { PeerMoneyDayEntity } from './entities/peer-money-day.entity.js';
import { PeerMoneyGuard } from './peer-money.guard.js';

/** `PeerMoneyGuard`: the limits on money moving between players. Import it wherever players can pay each other. */
@Module({
  imports: [TypeOrmModule.forFeature([PeerMoneyDayEntity]), UsersModule],
  providers: [PeerMoneyGuard],
  exports: [PeerMoneyGuard],
})
export class PeerMoneyModule {}
