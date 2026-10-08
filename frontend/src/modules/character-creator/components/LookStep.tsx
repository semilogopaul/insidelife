'use client';

import { BODY_TYPES, EYE_STYLES, FACIAL_HAIR, HAIR_COLORS, HAIR_STYLES, HAIR_STYLE_LABELS, SKIN_TONES, type Appearance, type BodyType, type EyeStyle, type FacialHair, type HairStyle } from '@insidelife/shared';
import { OUTFIT_PRESETS, PRESET_LABELS, type OutfitPreset } from '../lib/presets';
import { Chips, Swatches } from './controls';

export interface LookStepProps {
  readonly appearance: Appearance;
  readonly preset: OutfitPreset;
  readonly onChange: (patch: Partial<Appearance>) => void;
  readonly onPreset: (preset: OutfitPreset) => void;
}

const SKIN_NAMES = ['Ebony', 'Dark chocolate', 'Cocoa', 'Kola nut', 'Mahogany', 'Caramel', 'Honey', 'Sand'];
const HAIR_COLOR_NAMES = ['Jet black', 'Soft black', 'Dark brown', 'Auburn', 'Honey blonde', 'Burgundy', 'Grey', 'Royal blue'];
const BODY_LABELS: Readonly<Record<BodyType, string>> = { slim: 'Slim', average: 'Average', curvy: 'Curvy', broad: 'Broad' };
const EYE_LABELS: Readonly<Record<EyeStyle, string>> = { round: 'Round', almond: 'Almond', sleepy: 'Sleepy', bright: 'Bright' };
const BEARD_LABELS: Readonly<Record<FacialHair, string>> = { none: 'None', stubble: 'Stubble', moustache: 'Moustache', goatee: 'Goatee', 'full-beard': 'Full beard' };

function heightLabel(height: number): string {
  if (height < 0.97) return 'Petite';
  if (height > 1.03) return 'Tall';
  return 'Average';
}

export function LookStep({ appearance, preset, onChange, onPreset }: LookStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <Swatches label="Skin tone" values={SKIN_TONES} names={SKIN_NAMES} selected={appearance.skinTone} onSelect={(skinTone) => onChange({ skinTone })} />
      <Chips<HairStyle> label="Hair" options={HAIR_STYLES.map((id) => ({ id, label: HAIR_STYLE_LABELS[id] }))} selected={appearance.hairStyle} onSelect={(hairStyle) => onChange({ hairStyle })} />
      <Swatches label="Hair colour" values={HAIR_COLORS} names={HAIR_COLOR_NAMES} selected={appearance.hairColor} onSelect={(hairColor) => onChange({ hairColor })} />
      <Chips<BodyType> label="Body" options={BODY_TYPES.map((id) => ({ id, label: BODY_LABELS[id] }))} selected={appearance.bodyType} onSelect={(bodyType) => onChange({ bodyType })} />
      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-sm font-bold">
          Height <span className="text-xs font-normal text-text-soft">{heightLabel(appearance.height)}</span>
        </span>
        <input
          type="range"
          min={0.92}
          max={1.08}
          step={0.01}
          value={appearance.height}
          aria-valuetext={heightLabel(appearance.height)}
          onChange={(event) => onChange({ height: Number(event.target.value) })}
          className="h-11 accent-[var(--color-ink)]"
        />
      </label>
      <Chips<FacialHair> label="Facial hair" options={FACIAL_HAIR.map((id) => ({ id, label: BEARD_LABELS[id] }))} selected={appearance.facialHair} onSelect={(facialHair) => onChange({ facialHair })} />
      <Chips<EyeStyle> label="Eyes" options={EYE_STYLES.map((id) => ({ id, label: EYE_LABELS[id] }))} selected={appearance.eyeStyle} onSelect={(eyeStyle) => onChange({ eyeStyle })} />
      <div className="rounded-card bg-paper-2 p-3.5 ring-1 ring-line">
        <Chips<OutfitPreset>
          label="Try on"
          tone="ankara"
          hint="Preview only"
          options={OUTFIT_PRESETS.map((id) => ({ id, label: PRESET_LABELS[id] }))}
          selected={preset}
          onSelect={onPreset}
        />
        <p className="mt-2.5 text-xs text-text-soft">You start with okrika basics. Agbada, gele and the rest? Buy them in Lagos.</p>
      </div>
    </div>
  );
}
