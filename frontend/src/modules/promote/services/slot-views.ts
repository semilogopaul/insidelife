import { findAdSlot, type BillboardSlotDto, type BillboardSlotsDto } from '@insidelife/shared';

/** The slots response with every slot expanded for display (catalog details + live state and price). */
export interface SlotCatalog extends Omit<BillboardSlotsDto, 'slots'> {
  readonly slots: readonly BillboardSlotDto[];
}

/**
 * Join the server's slot states with the shared ad catalog. The server sends what changes (current weekly price, the
 * next start for 1–4 weeks, ads live now) for the ~560 slots; names, formats and descriptions come from `AD_SLOTS`.
 * Unknown ids (a newer server) are skipped.
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
        weekPriceKobo: state.weekPriceKobo,
        maxConcurrentAds: slot.maxConcurrentAds,
        liveCount: state.liveCount,
        nextStarts: state.nextStarts,
      },
    ];
  });
  return { ...dto, slots };
}
