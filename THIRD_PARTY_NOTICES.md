# Third-party notices — Axie Duel

Axie Duel is a fan project built for the Axie Vibeathon. Everything below
keeps its own license or terms; nothing here is relicensed by this project.

## Axie Mixer 3D toolkit and Axie content

- **What:** `@jaatster/threejs-axie-mixer3d-public` (Three.js Axie Mixer 3D
  runtime) and a trimmed subset of its content pack (bodies, parts, Mystic
  parts, six weapons, animations, textures) in `public/assets/axie3d/`.
- **Terms:** limited-use rights, **not** open source. See
  [`public/assets/axie3d/RIGHTS.md`](public/assets/axie3d/RIGHTS.md) and
  [`public/assets/axie3d/THIRD_PARTY_NOTICES.md`](public/assets/axie3d/THIRD_PARTY_NOTICES.md),
  copied unchanged from the toolkit.
- **How it's used:** only the parts of the runtime and content the game needs
  to run are bundled (see `scripts/trim-axie3d-assets.mjs`). The game loads
  them at runtime to render Axies; it does not offer the toolkit or asset pack
  as a standalone download.
- Axie Infinity, Axie, Lunacia and related names, characters, artwork, models
  and animations belong to Sky Mavis and its licensors. They are used only to
  identify and build this approved-program project.

## Libraries

| Package | Use | License |
|---|---|---|
| [three](https://github.com/mrdoob/three.js) | 3D rendering | MIT |
| [vite](https://github.com/vitejs/vite) | build tool (dev only) | MIT |

## Fonts

Loaded from Google Fonts at runtime (not redistributed here):
[Baloo 2](https://fonts.google.com/specimen/Baloo+2) and
[Nunito](https://fonts.google.com/specimen/Nunito), both under the SIL Open
Font License 1.1.

## Made for this project

Game rules, card sets, AI, balance simulator, sound effects (generated live
with the Web Audio API), card cinematics, the snow hall and its Lunacia-style
floor sigil (drawn procedurally with canvas) and the SVG class portraits are
original to this project.
