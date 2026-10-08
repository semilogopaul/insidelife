import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INVENTORY_PORT } from '../../common/ports/inventory.port.js';
import { EventsModule } from '../events/events.module.js';
import { SimulationModule } from '../simulation/simulation.module.js';
import { InventoryItemEntity } from './entities/inventory-item.entity.js';
import { ShopOrderEntity } from './entities/shop-order.entity.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { ShopController } from './shop.controller.js';
import { ShopService } from './shop.service.js';
import { ShopSystem } from './shop.system.js';
import { WardrobeController } from './wardrobe.controller.js';
import { WardrobeService } from './wardrobe.service.js';

/**
 * Shop domain: items, furniture, gadgets, clothing and the wardrobe. Provides `INVENTORY_PORT` (home comfort,
 * capability tags, grants and thefts) to other domains.
 */
@Module({
  imports: [SimulationModule, EventsModule, TypeOrmModule.forFeature([InventoryItemEntity, ShopOrderEntity])],
  controllers: [ShopController, InventoryController, WardrobeController],
  providers: [InventoryService, ShopService, WardrobeService, ShopSystem, { provide: INVENTORY_PORT, useExisting: InventoryService }],
  exports: [INVENTORY_PORT],
})
export class ShopModule {}
