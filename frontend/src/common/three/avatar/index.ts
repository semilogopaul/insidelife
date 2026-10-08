export { Avatar, AvatarAttachment, useAvatarParts, useResolvedOutfit, type AvatarHandle, type AvatarProps } from './Avatar';
export { AVATAR_SOCKETS, type AvatarParts, type AvatarSocket } from './avatar-instance';
export { AVATAR_GAIT_SPEED, AVATAR_SEAT_HEIGHT, CLIPS as AVATAR_CLIPS, type AvatarClip, type AvatarStance } from './animation/clips';
export { animationForSegment, stanceFor, SEATED_ANIMATIONS } from './animation/select';
export { EXPRESSIONS, expressionForMood, type Expression } from './face';
export { resolveOutfit, outfitKey, catalogLookup, type ClothingLookup, type ResolvedOutfit } from './outfit';
export { npcLook, randomAppearance, OUTFIT_THEMES, type NpcLook, type OutfitTheme } from './npc';
export { AVATAR_PROPS, type AvatarProp } from './rig';
export type { AvatarLod } from './build/build-avatar';
