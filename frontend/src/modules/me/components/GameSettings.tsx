'use client';

import { useUi, type GraphicsQuality } from '@/common/game/ui-store';

/** Device settings: audio, voice directions, which thumb walks on touch screens, graphics (stored on this device). */
export function GameSettings() {
  const settings = useUi((state) => state.settings);
  const updateSettings = useUi((state) => state.updateSettings);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Voice directions</span>
        <input type="checkbox" checked={settings.voiceGuidance} onChange={(event) => updateSettings({ voiceGuidance: event.target.checked })} className="size-5 accent-[var(--color-ink)]" />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Music volume</span>
        <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} onChange={(event) => updateSettings({ musicVolume: Number(event.target.value) })} className="w-40 accent-[var(--color-ink)]" />
      </label>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Sound effects</span>
        <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(event) => updateSettings({ sfxVolume: Number(event.target.value) })} className="w-40 accent-[var(--color-ink)]" />
      </label>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id="walk-stick-label">Joystick side</span>
        <div className="flex rounded-chip bg-paper-2 p-0.5" role="radiogroup" aria-labelledby="walk-stick-label">
          {(['left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={settings.walkStick === side}
              onClick={() => updateSettings({ walkStick: side })}
              className={settings.walkStick === side ? 'h-9 rounded-chip bg-ink px-3 text-sm font-bold text-on-ink' : 'h-9 rounded-chip px-3 text-sm font-bold text-text-soft'}
            >
              {side === 'left' ? 'Left' : 'Right'}
            </button>
          ))}
        </div>
      </div>
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>Graphics</span>
        <select value={settings.graphics} onChange={(event) => updateSettings({ graphics: event.target.value as GraphicsQuality })} className="h-10 rounded-chip bg-paper-2 px-2">
          <option value="auto">Auto</option>
          <option value="low">Battery saver</option>
          <option value="high">High</option>
        </select>
      </label>
    </div>
  );
}
