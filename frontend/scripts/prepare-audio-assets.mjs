#!/usr/bin/env node
/**
 * Audio asset pipeline for `modules/audio`.
 *
 * Copies ONLY the Kenney CC0 sounds the game uses into `public/assets/audio/<key>.ogg`, adds an MP3 fallback per file
 * when `ffmpeg` is on the PATH (Safari < 18.4 cannot decode Ogg Vorbis), measures peak/loudness so the engine can
 * loudness-match samples, and writes the typed manifest `src/modules/audio/services/sfx/audio-assets.generated.ts`.
 * Files under `public/assets/audio` that are no longer listed are removed. Idempotent; safe to re-run.
 *
 * Usage:
 *   node scripts/prepare-audio-assets.mjs --src /path/to/kenney-packs
 *   AUDIO_ASSETS_SRC=/path/to/kenney-packs node scripts/prepare-audio-assets.mjs
 *
 * The source directory holds the unzipped Kenney packs (interface-sounds, ui-audio, casino-audio, rpg-audio,
 * impact-sounds, music-jingles), each with an `Audio/` folder.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(FRONTEND, 'public', 'assets', 'audio');
const MANIFEST = join(FRONTEND, 'src', 'modules', 'audio', 'services', 'sfx', 'audio-assets.generated.ts');
const CREDITS = join(FRONTEND, 'public', 'assets', 'CREDITS.md');
const CREDITS_MARKER = '<!-- audio:kenney -->';
const CREDITS_END = '<!-- /audio:kenney -->';

/** key → source file (pack-relative to `<pack>/Audio/`). Keys become public paths: /assets/audio/<key>.ogg */
const ASSETS = [
  // UI (phone, HUD). Taps come from UI Audio (35-55 ms clicks); everything else from Interface Sounds.
  ['ui/click-1', 'ui-audio', 'click4.ogg'],
  ['ui/click-2', 'ui-audio', 'click5.ogg'],
  ['ui/click-3', 'ui-audio', 'click2.ogg'],
  ['ui/open-1', 'interface-sounds', 'open_001.ogg'],
  ['ui/open-2', 'interface-sounds', 'maximize_008.ogg'],
  ['ui/close-1', 'interface-sounds', 'close_001.ogg'],
  ['ui/close-2', 'interface-sounds', 'minimize_008.ogg'],
  ['ui/success-1', 'interface-sounds', 'confirmation_001.ogg'],
  ['ui/success-2', 'interface-sounds', 'confirmation_003.ogg'],
  ['ui/error-1', 'interface-sounds', 'error_002.ogg'],
  ['ui/error-2', 'interface-sounds', 'error_004.ogg'],
  ['ui/notify-1', 'interface-sounds', 'glass_001.ogg'],
  ['ui/notify-2', 'interface-sounds', 'glass_002.ogg'],
  ['ui/pluck-1', 'interface-sounds', 'pluck_001.ogg'],
  // Money
  ['money/coins-1', 'rpg-audio', 'handleCoins.ogg'],
  ['money/coins-2', 'rpg-audio', 'handleCoins2.ogg'],
  ['money/chips-stack-1', 'casino-audio', 'chips-stack-1.ogg'],
  ['money/chips-stack-2', 'casino-audio', 'chips-stack-4.ogg'],
  ['money/chips-stack-3', 'casino-audio', 'chips-stack-5.ogg'],
  ['money/chip-lay-1', 'casino-audio', 'chip-lay-1.ogg'],
  ['money/chip-lay-2', 'casino-audio', 'chip-lay-3.ogg'],
  ['money/chips-handle-1', 'casino-audio', 'chips-handle-3.ogg'],
  ['money/notes-1', 'casino-audio', 'card-slide-1.ogg'],
  ['money/notes-2', 'casino-audio', 'card-slide-2.ogg'],
  ['money/notes-3', 'casino-audio', 'card-slide-3.ogg'],
  ['money/notes-4', 'casino-audio', 'card-slide-4.ogg'],
  ['money/notes-fan', 'casino-audio', 'card-fan-1.ogg'],
  // World
  ['world/door-open-1', 'rpg-audio', 'doorOpen_1.ogg'],
  ['world/door-open-2', 'rpg-audio', 'doorOpen_2.ogg'],
  ['world/door-close-1', 'rpg-audio', 'doorClose_1.ogg'],
  ['world/door-close-2', 'rpg-audio', 'doorClose_2.ogg'],
  ['world/door-close-3', 'rpg-audio', 'doorClose_4.ogg'],
  ['world/bus-slam', 'rpg-audio', 'doorClose_3.ogg'],
  ['world/latch', 'rpg-audio', 'metalLatch.ogg'],
  ['world/thump-1', 'impact-sounds', 'impactSoft_heavy_000.ogg'],
  ['world/thump-2', 'impact-sounds', 'impactSoft_heavy_001.ogg'],
  ['world/metal-hit', 'impact-sounds', 'impactMetal_heavy_000.ogg'],
  ['world/plate-1', 'impact-sounds', 'impactPlate_light_000.ogg'],
  ['world/plate-2', 'impact-sounds', 'impactPlate_light_002.ogg'],
  ['world/step-concrete-1', 'impact-sounds', 'footstep_concrete_000.ogg'],
  ['world/step-concrete-2', 'impact-sounds', 'footstep_concrete_001.ogg'],
  ['world/step-concrete-3', 'impact-sounds', 'footstep_concrete_002.ogg'],
  ['world/step-concrete-4', 'impact-sounds', 'footstep_concrete_003.ogg'],
  ['world/step-concrete-5', 'impact-sounds', 'footstep_concrete_004.ogg'],
  ['world/step-wood-1', 'impact-sounds', 'footstep_wood_000.ogg'],
  ['world/step-wood-2', 'impact-sounds', 'footstep_wood_001.ogg'],
  ['world/step-wood-3', 'impact-sounds', 'footstep_wood_002.ogg'],
  // Stingers (pitch-contour checked: these all resolve upwards)
  ['jingles/sax-02', 'music-jingles', 'Sax jingles/jingles_SAX02.ogg'],
  ['jingles/sax-10', 'music-jingles', 'Sax jingles/jingles_SAX10.ogg'],
  ['jingles/sax-13', 'music-jingles', 'Sax jingles/jingles_SAX13.ogg'],
  ['jingles/sax-15', 'music-jingles', 'Sax jingles/jingles_SAX15.ogg'],
  ['jingles/steel-08', 'music-jingles', 'Steel jingles/jingles_STEEL08.ogg'],
  ['jingles/steel-10', 'music-jingles', 'Steel jingles/jingles_STEEL10.ogg'],
  ['jingles/steel-13', 'music-jingles', 'Steel jingles/jingles_STEEL13.ogg'],
  ['jingles/steel-15', 'music-jingles', 'Steel jingles/jingles_STEEL15.ogg'],
  ['jingles/pizzi-02', 'music-jingles', 'Pizzicato jingles/jingles_PIZZI02.ogg'],
  ['jingles/pizzi-10', 'music-jingles', 'Pizzicato jingles/jingles_PIZZI10.ogg'],
  ['jingles/pizzi-15', 'music-jingles', 'Pizzicato jingles/jingles_PIZZI15.ogg'],
];

const PACK_TITLES = {
  'interface-sounds': 'Interface Sounds',
  'casino-audio': 'Casino Audio',
  'rpg-audio': 'RPG Audio',
  'impact-sounds': 'Impact Sounds',
  'music-jingles': 'Music Jingles',
  'ui-audio': 'UI Audio',
};

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

function hasTool(tool) {
  const result = spawnSync(tool, ['-version'], { stdio: 'ignore' });
  return result.status === 0;
}

function run(tool, args) {
  const result = spawnSync(tool, args, { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.status !== 0) throw new Error(`${tool} ${args.join(' ')} failed: ${result.stderr}`);
  return `${result.stdout}\n${result.stderr}`;
}

/** True when `target` is missing, a different size, or older than `source` (re-mapped keys are re-copied). */
function isStale(target, source, compareSize = false) {
  if (!existsSync(target)) return true;
  const [t, s] = [statSync(target), statSync(source)];
  return (compareSize && t.size !== s.size) || t.mtimeMs < s.mtimeMs;
}

/** Duration, channels, sample peak and a transient-aware loudness (max of overall RMS and 50 ms RMS peak). */
function measure(file) {
  const probe = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=channels', '-of', 'json', file]);
  const info = JSON.parse(probe.slice(0, probe.lastIndexOf('}') + 1));
  const stats = run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'aformat=channel_layouts=mono,astats=length=0.05:measure_overall=Peak_level+RMS_level+RMS_peak:measure_perchannel=none',
    '-f', 'null', '-',
  ]);
  const read = (label) => {
    const match = stats.match(new RegExp(`${label} dB: (-?[\\d.]+|-inf)`));
    return match && match[1] !== '-inf' ? Number(match[1]) : -96;
  };
  return {
    durationMs: Math.round(Number(info.format.duration) * 1000),
    channels: info.streams?.[0]?.channels ?? 1,
    peakDb: Math.round(read('Peak level') * 10) / 10,
    loudnessDb: Math.round(Math.max(read('RMS level'), read('RMS peak')) * 10) / 10,
  };
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

/** Writes (or refreshes in place) the audio section of CREDITS.md between the begin/end markers. */
function ensureCredits(usedPacks) {
  mkdirSync(dirname(CREDITS), { recursive: true });
  const existing = existsSync(CREDITS) ? readFileSync(CREDITS, 'utf8') : '# Third-party assets\n';
  const lines = [
    CREDITS_MARKER,
    '## Audio — Kenney (CC0 1.0)',
    '',
    'Sound effects and stingers in `public/assets/audio/` come from these packs by Kenney Vleugels',
    '([kenney.nl](https://kenney.nl)), released under Creative Commons Zero',
    '([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)). Credit is not required; we give it gladly.',
    '',
    ...[...usedPacks].sort().map((pack) => `- **${PACK_TITLES[pack] ?? pack}** — https://kenney.nl/assets/${pack}`),
    '',
    'MP3 fallbacks are transcodes of the same files. Music, ambience, horns, engines and the "ka-ching" pluck are',
    'synthesised at runtime (Web Audio) and are original to Inside Life. Voice guidance uses the browser’s built-in',
    'speech synthesis (no third-party service).',
    CREDITS_END,
  ];
  const block = lines.join('\n');
  const start = existing.indexOf(CREDITS_MARKER);
  const end = existing.indexOf(CREDITS_END);
  const next =
    start >= 0 && end > start
      ? `${existing.slice(0, start)}${block}${existing.slice(end + CREDITS_END.length)}`
      : `${existing.replace(/\s*$/, '\n')}\n${block}\n`;
  if (next === existing) return false;
  writeFileSync(CREDITS, next);
  return true;
}

function main() {
  const src = argValue('--src') ?? process.env.AUDIO_ASSETS_SRC;
  if (!src || !existsSync(src)) {
    console.error('prepare-audio-assets: pass --src <dir> (or AUDIO_ASSETS_SRC) pointing at the unzipped Kenney packs.');
    process.exit(1);
  }
  if (!hasTool('ffprobe') || !hasTool('ffmpeg')) {
    console.error('prepare-audio-assets: ffmpeg/ffprobe are required to measure loudness (brew install ffmpeg).');
    process.exit(1);
  }
  const wantMp3 = !process.argv.includes('--no-mp3');

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  const keep = new Set();
  const usedPacks = new Set();
  let bytes = 0;

  for (const [key, pack, file] of ASSETS) {
    const source = join(src, pack, 'Audio', file);
    if (!existsSync(source)) throw new Error(`Missing source ${source}`);
    usedPacks.add(pack);
    const ogg = join(OUT_DIR, `${key}.ogg`);
    const mp3 = join(OUT_DIR, `${key}.mp3`);
    mkdirSync(dirname(ogg), { recursive: true });
    if (isStale(ogg, source, true)) copyFileSync(source, ogg);
    keep.add(ogg);
    bytes += statSync(ogg).size;
    if (wantMp3) {
      if (isStale(mp3, ogg)) run('ffmpeg', ['-y', '-v', 'error', '-i', ogg, '-codec:a', 'libmp3lame', '-q:a', '5', mp3]);
      keep.add(mp3);
      bytes += statSync(mp3).size;
    }
    manifest.push({ key, ...measure(ogg), mp3: wantMp3 });
  }

  for (const file of listFiles(OUT_DIR)) {
    if (!keep.has(file)) {
      rmSync(file);
      console.log(`removed stale ${relative(FRONTEND, file)}`);
    }
  }

  const body = manifest
    .map(
      (asset) =>
        `  '${asset.key}': { durationMs: ${asset.durationMs}, channels: ${asset.channels}, peakDb: ${asset.peakDb}, loudnessDb: ${asset.loudnessDb}, mp3: ${asset.mp3} },`,
    )
    .join('\n');
  writeFileSync(
    MANIFEST,
    `// Generated by scripts/prepare-audio-assets.mjs — do not edit by hand.\nimport type { AudioAssetInfo } from './audio-asset-types';\n\nexport const AUDIO_ASSETS = {\n${body}\n} as const satisfies Readonly<Record<string, AudioAssetInfo>>;\n\nexport type AudioAssetKey = keyof typeof AUDIO_ASSETS;\n`,
  );

  const creditsAdded = ensureCredits(usedPacks);
  console.log(
    `prepare-audio-assets: ${manifest.length} sounds → ${relative(FRONTEND, OUT_DIR)}${sep} (${(bytes / 1024).toFixed(0)} KB incl. ${wantMp3 ? 'MP3 fallbacks' : 'no MP3'}); manifest → ${relative(FRONTEND, MANIFEST)}${creditsAdded ? '; credits appended' : ''}`,
  );
}

main();
