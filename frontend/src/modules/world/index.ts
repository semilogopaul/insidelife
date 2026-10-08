/**
 * The 3D world feature: one canvas (city outside, interiors inside), GPS, minimap and billboards.
 * The play layer (`./play`) plugs in through `PlayLayer`, the live pose and the city plan's colliders.
 */
export { WorldCanvas, CityPreview, type CityPreviewProps } from './WorldCanvas';
export { Minimap } from './minimap';
export { livePose, publishLivePose, livePoseFresh, type LivePose } from './navigation/live-pose';
export { activeRoute, type ActiveRoute } from './navigation/route-state';
export { cityPlan, type CityPlan, type Collider, type Placement } from './city/layout/placements';
export { useBillboardAt, useLiveBillboards, type BillboardHandle } from './city/billboards/use-billboards';
export { currentBillboard, type BillboardContent, type CreativeContent, type HouseAdContent } from './city/billboards/billboard-content';
