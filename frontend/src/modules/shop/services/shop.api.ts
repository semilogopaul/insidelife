import type {
  InventoryDto,
  InventoryRepairResultDto,
  InventorySaleResultDto,
  Outfit,
  ShopCatalogDto,
  ShopPurchaseResultDto,
  WardrobeDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

const id = (value: string): string => encodeURIComponent(value);

/** Shop, inventory and wardrobe endpoints (all under /api/v1). */
export const shopApi = {
  /** Whole catalogue (filtered on the client); `venue` is where you're standing, if it's a shop. */
  catalogue: () => api.get<ShopCatalogDto>('/shop'),
  /** Tap once: a retry of the same purchase reuses its key, so it's charged once. */
  purchase: (itemId: string, quantity: number, roomId?: string) =>
    tapOnce(`shop:${itemId}:${quantity}`, (idempotencyKey) =>
      api.post<ShopPurchaseResultDto>('/shop/purchases', { itemId, quantity, ...(roomId ? { roomId } : {}), idempotencyKey }),
    ),
  inventory: () => api.get<InventoryDto>('/inventory'),
  sell: (inventoryId: string, quantity: number) =>
    api.post<InventorySaleResultDto>(`/inventory/${id(inventoryId)}/sale`, { quantity }),
  repair: (inventoryId: string) =>
    api.post<InventoryRepairResultDto>(`/inventory/${id(inventoryId)}/repairs`),
  wardrobe: () => api.get<WardrobeDto>('/wardrobe'),
  dress: (outfit: Outfit) => api.put<WardrobeDto>('/wardrobe', { outfit }),
};
