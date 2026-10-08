'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { SfxId } from '@/common/game/game-events';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useAudioEngine } from '../hooks/use-audio-engine';
import { useAudioEvents } from '../hooks/use-game-audio';
import { SILENT_AMBIENCE, type AmbienceTargets } from '../services/ambience/ambience-state';
import { SFX_RECIPES } from '../services/sfx/sfx-catalog';
import type { AudioEngineStats, CelebrationKind, MusicContext } from '../types/audio';
import { NowPlayingChip } from './NowPlayingChip';

const SFX_IDS = Object.keys(SFX_RECIPES) as SfxId[];
const CONTEXTS: readonly MusicContext[] = ['menu', 'city', 'home', 'club', 'party', 'campus', 'office', 'hospital'];
const CELEBRATIONS: readonly CelebrationKind[] = ['goal', 'achievement', 'milestone'];

const AMBIENCE_PRESETS: ReadonlyArray<readonly [string, AmbienceTargets, boolean]> = [
  ['Silence', SILENT_AMBIENCE, false],
  [
    'Street · rush hour',
    { ...SILENT_AMBIENCE, trafficDb: -6, trafficCutoffHz: 620, hornsPerMinute: 9, kekesPerMinute: 2 },
    false,
  ],
  [
    'Lagoon · night',
    { ...SILENT_AMBIENCE, trafficDb: -18, trafficCutoffHz: 330, hornsPerMinute: 1.5, insectsDb: -21, frogsPerMinute: 6 },
    false,
  ],
  [
    'Rainstorm · street',
    { ...SILENT_AMBIENCE, trafficDb: -9, trafficCutoffHz: 470, hornsPerMinute: 5, rainDb: -8, thunderPerMinute: 3 },
    false,
  ],
  [
    'Home · rain on roof',
    { ...SILENT_AMBIENCE, trafficDb: -27, trafficCutoffHz: 190, muffled: true, rainDb: -10, rainIndoor: true, roomToneDb: -36 },
    true,
  ],
  [
    'Home · NEPA took light',
    { ...SILENT_AMBIENCE, trafficDb: -32, trafficCutoffHz: 190, muffled: true, generatorDb: -19, generatorIndoor: true, insectsDb: -34, roomToneDb: -36 },
    true,
  ],
  ['Street · grid collapse', { ...SILENT_AMBIENCE, trafficDb: -14, trafficCutoffHz: 330, hornsPerMinute: 1.5, generatorDb: -24 }, false],
];

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-card bg-ink-2 p-4">
      <h2 className="type-title mb-3 text-lg text-danfo">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function LabButton({ children, onClick, active = false }: { readonly children: ReactNode; readonly onClick: () => void; readonly active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-10 rounded-chip px-3 text-sm font-semibold transition-colors ${active ? 'bg-danfo text-ink' : 'bg-ink-3 text-on-ink hover:bg-lagoon'}`}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, onChange, max = 1, step = 0.01 }: { readonly label: string; readonly value: number; readonly onChange: (value: number) => void; readonly max?: number; readonly step?: number }) {
  return (
    <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm text-on-ink-soft">
      <span>
        {label}: <span className="tabular text-on-ink">{max === 1 ? `${Math.round(value * 100)}%` : Math.round(value)}</span>
      </span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="accent-danfo" />
    </label>
  );
}

/**
 * Dev-only audio lab (`/dev/audio`): trigger every SFX, stinger, music context, ambience preset, vehicle speed and a
 * test club track; watch engine stats (context time, live nodes, voices) to confirm scheduling and no leaks.
 */
export function AudioLab() {
  const engine = useAudioEngine();
  useAudioEvents(engine);
  const settings = useUi((state) => state.settings);
  const updateSettings = useUi((state) => state.updateSettings);
  const [context, setContext] = useState<MusicContext | null>(null);
  const [night, setNight] = useState(false);
  const [ambience, setAmbience] = useState('Silence');
  const [vehicle, setVehicle] = useState<'off' | 'driving' | 'riding'>('off');
  const [speed, setSpeed] = useState(0);
  const [line, setLine] = useState('In 200 metres, turn right onto Awolowo Road.');
  const [stats, setStats] = useState<AudioEngineStats | null>(null);

  useEffect(() => {
    if (!engine) return;
    const off = gameEvents.on('music-context', ({ context: next, venueId }) => {
      engine.setMusic({ context: next, night, energy: 1, clubVenueId: next === 'club' ? (venueId ?? 'the-vault') : null });
    });
    return () => {
      off();
    };
  }, [engine, night]);

  useEffect(() => {
    if (!engine) return;
    if (context) engine.setMusic({ context, night, energy: 1, clubVenueId: context === 'club' ? 'the-vault' : null });
    else engine.setMusic(null);
  }, [engine, context, night]);

  useEffect(() => {
    if (!engine) return;
    const preset = AMBIENCE_PRESETS.find(([name]) => name === ambience);
    if (preset) engine.setAmbience(preset[1], preset[2]);
  }, [engine, ambience]);

  useEffect(() => {
    if (!engine) return;
    if (vehicle === 'off') {
      engine.setVehicle(null, 0);
      return;
    }
    engine.setVehicle(vehicle, speed);
    // Mirror the game's 10 Hz telemetry so smoothing is exercised.
    const id = window.setInterval(() => engine.setVehicle(vehicle, speed), 100);
    return () => window.clearInterval(id);
  }, [engine, vehicle, speed]);

  useEffect(() => {
    if (!engine) return;
    const id = window.setInterval(() => setStats(engine.stats), 500);
    return () => window.clearInterval(id);
  }, [engine]);

  return (
    <main className="min-h-dvh bg-ink p-4 text-on-ink sm:p-8">
      <NowPlayingChip />
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-danfo">Dev only</p>
          <h1 className="type-slogan text-5xl">Audio lab</h1>
          <p className="mt-2 text-on-ink-soft">The first click anywhere unlocks audio. Every button goes through the same engine the game uses.</p>
        </header>

        <section aria-live="polite" className="tabular grid grid-cols-2 gap-2 rounded-card bg-ink-2 p-4 text-sm sm:grid-cols-4" data-testid="audio-stats">
          <span>State: {stats?.state ?? '—'}</span>
          <span>Time: {stats ? stats.currentTime.toFixed(2) : '—'} s</span>
          <span>Live nodes: {stats?.liveNodes ?? 0}</span>
          <span>Music voices: {stats?.musicVoices ?? 0}</span>
          <span>Style: {stats?.musicStyle ?? 'off'}</span>
          <span>Sessions: {stats?.musicSessions ?? 0}</span>
          <span>Beds: {stats?.ambienceBeds.join(', ') || 'none'}</span>
          <span>
            Samples: {stats?.samplesLoaded ?? 0} loaded / {stats?.samplesFailed ?? 0} failed
          </span>
          <span>Duck: {stats ? stats.duckDb.toFixed(0) : 0} dB</span>
          <span>Latency: {stats?.baseLatencyMs ?? 0} ms</span>
          <span className="col-span-2">Club track: {stats?.clubTrack ?? '—'}</span>
        </section>

        <Section title="Mix (player settings)">
          <Slider label="Master" value={settings.masterVolume} onChange={(value) => updateSettings({ masterVolume: value })} />
          <Slider label="Music" value={settings.musicVolume} onChange={(value) => updateSettings({ musicVolume: value })} />
          <Slider label="Effects" value={settings.sfxVolume} onChange={(value) => updateSettings({ sfxVolume: value })} />
          <Slider label="Voice" value={settings.voiceVolume} onChange={(value) => updateSettings({ voiceVolume: value })} />
          <LabButton active={settings.voiceGuidance} onClick={() => updateSettings({ voiceGuidance: !settings.voiceGuidance })}>
            Voice guidance {settings.voiceGuidance ? 'on' : 'off'}
          </LabButton>
        </Section>

        <Section title="Sound effects">
          {SFX_IDS.map((id) => (
            <LabButton key={id} onClick={() => gameEvents.emit('sfx', { id })}>
              {id}
            </LabButton>
          ))}
        </Section>

        <Section title="Celebrations">
          {CELEBRATIONS.map((kind) => (
            <LabButton key={kind} onClick={() => gameEvents.emit('celebrate', { kind, title: `Test ${kind}` })}>
              {kind}
            </LabButton>
          ))}
        </Section>

        <Section title="Music">
          {CONTEXTS.map((next) => (
            <LabButton key={next} active={context === next} onClick={() => setContext(next)}>
              {next}
            </LabButton>
          ))}
          <LabButton active={context === null} onClick={() => setContext(null)}>
            Stop music
          </LabButton>
          <LabButton active={night} onClick={() => setNight((value) => !value)}>
            {night ? 'Night' : 'Day'}
          </LabButton>
          <LabButton
            onClick={() =>
              engine?.debugPlayClubTrack('the-vault', {
                trackId: 'lab-track',
                url: '/assets/audio/jingles/sax-02.ogg',
                artist: 'Lab Artist',
                title: 'Test Track (Owambe Mix)',
                durationSeconds: 2,
              })
            }
          >
            Play test club track
          </LabButton>
        </Section>

        <Section title="Ambience">
          {AMBIENCE_PRESETS.map(([name]) => (
            <LabButton key={name} active={ambience === name} onClick={() => setAmbience(name)}>
              {name}
            </LabButton>
          ))}
        </Section>

        <Section title="Vehicle">
          {(['off', 'driving', 'riding'] as const).map((mode) => (
            <LabButton key={mode} active={vehicle === mode} onClick={() => setVehicle(mode)}>
              {mode === 'off' ? 'On foot' : mode}
            </LabButton>
          ))}
          <Slider label="Speed (km/h)" value={speed} max={160} step={1} onChange={setSpeed} />
        </Section>

        <Section title="Voice guidance">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm text-on-ink-soft">
            Line
            <input value={line} onChange={(event) => setLine(event.target.value)} className="h-10 rounded-chip bg-ink-3 px-3 text-on-ink" />
          </label>
          <LabButton onClick={() => gameEvents.emit('speak', { text: line })}>Speak</LabButton>
        </Section>
      </div>
    </main>
  );
}
