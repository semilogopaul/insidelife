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

const id = (value: string): string => encodeURIComponent(value);

/** Shop, inventory and wardrobe endpoints (all under /api/v1). */
export const shopApi = {
  /** Whole catalogue (filtered on the client); `venue` is where you're standing, if it's a shop. */
  catalogue: () => api.get<ShopCatalogDto>('/shop'),
  purchase: (itemId: string, quantity: number) =>
    api.post<ShopPurchaseResultDto>('/shop/purchases', { itemId, quantity }),
  inventory: () => api.get<InventoryDto>('/inventory'),
  sell: (inventoryId: string, quantity: number) =>
    api.post<InventorySaleResultDto>(`/inventory/${id(inventoryId)}/sale`, { quantity }),
  repair: (inventoryId: string) =>
    api.post<InventoryRepairResultDto>(`/inventory/${id(inventoryId)}/repairs`),
  wardrobe: () => api.get<WardrobeDto>('/wardrobe'),
  dress: (outfit: Outfit) => api.put<WardrobeDto>('/wardrobe', { outfit }),
};
