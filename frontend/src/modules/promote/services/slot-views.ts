import { BILLBOARD_WEEK_DAYS, billboardQuote, findAdSlot, type BillboardSlotDto, type BillboardSlotsDto } from '@insidelife/shared';
import { addDays } from './rules';

/** The slots response with every slot expanded for display (catalog details + live occupancy). */
export interface SlotCatalog extends Omit<BillboardSlotsDto, 'slots'> {
  readonly slots: readonly BillboardSlotDto[];
}

/**
 * Join the server's slot states with the shared ad catalog. The server only sends what changes (occupancy per day,
 * ads live now) for the ~560 slots; names, prices, formats and descriptions come from `AD_SLOTS`. Unknown ids (a newer
 * server) are skipped.
 */
export function toSlotCatalog(dto: BillboardSlotsDto): SlotCatalog {
  const slots = dto.slots.flatMap((state): BillboardSlotDto[] => {
    const slot = findAdSlot(state.id);
    if (!slot) return [];
    return [
      {
        id: slot.id,
        kind: slot.kind,
        name: slot.name,
        districtId: slot.districtId,
        description: slot.description,
        placement: slot.placement,
        format: slot.format,
        width: slot.width,
        height: slot.height,
        tier: slot.tier,
        pricePerDayKobo: slot.pricePerDayKobo,
        weekPriceKobo: billboardQuote(slot, BILLBOARD_WEEK_DAYS).totalKobo,
        maxConcurrentAds: slot.maxConcurrentAds,
        liveCount: state.liveCount,
        availability: state.occupancy.map((booked, index) => ({ date: addDays(dto.today, index), booked, capacity: slot.maxConcurrentAds })),
      },
    ];
  });
  return { ...dto, slots };
}
