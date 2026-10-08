# Third-party assets

<!-- audio:kenney -->
## Audio — Kenney (CC0 1.0)

Sound effects and stingers in `public/assets/audio/` come from these packs by Kenney Vleugels
([kenney.nl](https://kenney.nl)), released under Creative Commons Zero
([CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)). Credit is not required; we give it gladly.

- **Casino Audio** — https://kenney.nl/assets/casino-audio
- **Impact Sounds** — https://kenney.nl/assets/impact-sounds
- **Interface Sounds** — https://kenney.nl/assets/interface-sounds
- **Music Jingles** — https://kenney.nl/assets/music-jingles
- **RPG Audio** — https://kenney.nl/assets/rpg-audio
- **UI Audio** — https://kenney.nl/assets/ui-audio

MP3 fallbacks are transcodes of the same files. Music, ambience, horns, engines and the "ka-ching" pluck are
synthesised at runtime (Web Audio) and are original to Inside Life. Voice guidance uses the browser’s built-in
speech synthesis (no third-party service).
<!-- /audio:kenney -->

## Kenney — City Kit (Commercial, Suburban, Roads), Car Kit, Nature Kit

- Author: Kenney (www.kenney.nl) — License: Creative Commons Zero (CC0 1.0)
- Used for: the open-world city (`assets/city/**`) and vehicles (`assets/vehicles/**`).
- Optimised with glTF-Transform (dedup, prune, weld, meshopt). The `danfo` vehicle is the Car Kit van repainted.
- Thank you Kenney! Support at https://kenney.nl/support

<!-- interiors:kenney -->
## Kenney — Furniture Kit (+ Nature Kit plants, Car Kit showroom cars)

- Author: Kenney (www.kenney.nl) — License: Creative Commons Zero (CC0 1.0)
- Furniture Kit: https://kenney.nl/assets/furniture-kit · Nature Kit: https://kenney.nl/assets/nature-kit · Car Kit: https://kenney.nl/assets/car-kit
- Used for: interior dollhouses (`assets/interiors/furniture.glb`, `assets/interiors/showroom-cars.glb`).
- Bundled and optimised with glTF-Transform (dedup, prune, weld, meshopt) by `scripts/prepare-interior-assets.mjs`;
  materials are recoloured at runtime. Avatars, clothing prints, faces, signage and Lagos props (danfos, coolers,
  gele, agbada…) are procedural and original to Inside Life. The Mini Characters kit was used as a proportion
  reference only. Thank you Kenney!
<!-- /interiors:kenney -->
