# Axie Duel — Vibeathon submission kit

Ready-to-paste texts for the submission form. Items marked **TODO** need the
author (links, video, anything only you know).

| Field | Value |
|---|---|
| Title | **Axie Duel** |
| Playable link | https://powerdeblack.github.io/taichi/ (opens in the browser, nothing to install, self-hosted on GitHub Pages) |
| Repository | https://github.com/powerdeblack/taichi (branch `claude/axie-duel-vite-threejs-w1acib`) |
| Thumbnail | [`submission/thumbnail.png`](submission/thumbnail.png) (1280×720) |
| Fallback demo video | **TODO** — record following [the shot list](#fallback-video-shot-list) and upload (YouTube unlisted / Drive) |

---

## One-sentence pitch

A real-time 3-vs-3 Axie card duel in a snowy Lunacia arena: move your squad
with one thumb, aim and release cards with the other, and win by reading
range, timing and Origin-style tricks like Stun and hidden Secrets.

## Short description

Build a squad of three Axies, give each one a card set (Warrior, Priest, Mage,
Ranger, Rogue or Shaman) and fight a rival squad in real time. Cards take a
few seconds to charge and fly, so you walk into range, dodge out of it, stun
casters to interrupt them and lay face-down Secrets. Protect your Tank: the
first team to lose its Tank loses the duel.

## Full description

**Axie Duel** turns Axie card battles into a real-time, positional duel that
plays on a phone held sideways — left thumb moves, right thumb plays cards.

**Build your squad.** Pick three Axies from the six classes and give each a
card set. Class decides the 3D look and the class-triangle bonus; the card set
decides what it does in battle. An Axie paired with its native set (a
Beast-born Warrior, a Plant-born Priest…) unlocks a signature card. Split each
Axie's 5 cards between Attack, Defense and Heal to shape its stats, mark one
as the Tank, or load one of ten ready-made archetypes (Bleed, Poison, Heal,
Thorns, Mirage, Deathmark, Arcane Bastion…).

**Fight in real time.** Energy refills continuously. Tap an Axie to target it,
hold a card to see its reach ring and exactly what letting go will do, then
release. Every card charges on its caster, flies to the target and lands a few
seconds later, and each side can only start a new card every 5 seconds — so
the fight is about positioning and reading the rival's cast bar. Short-range
cards need contact distance; long-range cards reach most of the arena. Your
squad moves as one block led by the Tank, whose Taunt forces nearby attackers
to hit it.

**Origin-style depth.** Bleed and Poison damage over time, Deathmark, Retain,
Ambush and arrow combos; Stun (interrupts casts and roots a Tank), Chill (no
dodging, half speed) and Fear (the next attack misses); and face-down Secrets
that spring when their Axie is attacked — you see yours, the rival only sees
"❓ Secret". Defense cards (Guard, Bulwark, Barrier, Evasion, Thorns,
Cleanse) protect allies; a heal aimed at an enemy becomes Reverse Heal.

**A match always ends.** After 2:00 a Blizzard hurts everyone and halves
healing; at 3:20 the Tank with more HP left wins.

**Feel.** Official 3D Axies from the Three.js Axie Mixer: class body colours,
a weapon per card set, Mystic parts with glow for Evolved Axies, and the
toolkit's own attack, skill, hit, stun and death animations. Each card also
plays a short cinematic that matches what it does (arrow rain, slashes,
arcane blasts, shields, heals), with hit-stop, camera shake and slow motion on
knockouts. There's an optional interactive tutorial and a help screen.

**Balanced with simulation.** A headless simulator plays the real rules and
the in-game AI against itself: 400 duels for every pairing of the ten
archetypes (18,000 duels per balance pass), plus a 2,000-team Swiss
tournament (11,000 duels). Every archetype currently wins between 38% and 62%
of its duels, and each has at least one counter.

## Controls / first contact

- Play in **landscape** on a phone (portrait and desktop also work; the ⛶
  button goes full screen).
- **Team screen:** tap "Use this team" on an archetype, or add three Axies and
  tweak them; then **Start Duel**. The tutorial is optional.
- **Left thumb — joystick:** moves your whole squad (the 🛡️ Tank leads).
- **Tap an Axie** (yours or the rival's) to put the 🎯 on it.
- **Right thumb — hold a card:** shows its reach ring and a preview of the
  result (green = lands, red = misses). **Release** to play it; **drag your
  finger off the card** to cancel.
- Defense cards go to your own Axies; heals follow the 🎯 (on an enemy they
  become Reverse Heal).
- **On a computer:** move with **W A S D** (or the arrow keys); click a card
  (press to aim, release to play), or hold **1 / 2 / 3** to aim the matching
  card and release to play it; **Esc** cancels. Touch controls on phones are
  unchanged.
- Win by defeating the rival **Tank**.

## Axie Core fit

Axie Duel is built on Axie's own systems rather than just using Axie art:

1. **Class triangle.** Beast > Plant > Aqua > Beast and Bird > Bug > Reptile >
   Bird: +20% damage with the advantage, −15% against it. Class also sets each
   Axie's official body colour.
2. **Axie-battle control effects, adapted to real time.** Stun, Chill and
   Fear: a Stun interrupts a cast and roots a Tank, Chill removes dodging,
   Fear makes the next attack miss.
3. **Secrets.** Face-down cards that spring by themselves when their Axie is
   attacked (counter-attack, freeze, snare, shadow, curse, hidden heal),
   hidden from the opponent — modelled on Axie Origin's Secret cards.
4. **Bleed and Poison** damage over time, plus Deathmark, Retain and Reverse
   Heal — status effects and keywords in the spirit of Axie's card games.
5. **Official 3D Axies** from the Three.js Axie Mixer: real body and parts,
   class colours, weapons per card set, Mystic parts for Evolved Axies, and
   the toolkit's animations driving every attack, hit and knockout.

It also keeps Origin's structure: three-Axie teams, an energy economy, a
5-card loadout per Axie split across attack, defense and heal, and species
"native" card sets that echo how an Axie's parts decide its cards. The arena
is a snowy Lunacia hall with the Lunacia sigil on the floor.

## AI tools used

- **Claude Code (Anthropic)** — wrote and refactored the game code (rules
  engine, AI, Three.js scene, UI, cinematics); designed and ran the balance
  simulator and the 2,000-team tournament and applied the tuning; drove
  automated browser tests with Playwright (phone viewports, touch, screenshots)
  and asset-pack trimming; wrote the documentation.
- **Claude (claude.ai chat, Anthropic)** — researched the Vibeathon rules and
  judging criteria and prepared the submission/compliance guide (deadlines,
  required fields, rights checklist) that this kit follows.

Suggested sentence:

> Developed with Claude Code, used both to implement the combat system and to
> test balance automatically: tens of thousands of simulated duels between the
> ten squad archetypes (400 per pairing per balance pass, plus a 2,000-team
> Swiss tournament) were run to find dominant compositions and tune card
> values before release.

## Fallback video shot list

Record the phone screen in landscape, 2–3 minutes, no cuts needed:

1. **0:00–0:20 Team screen.** Tap "Use this team" on an archetype, change one
   Axie's card set, toggle **Evolve** on one (the preview turns Mystic),
   show the 3D preview swinging its weapon.
2. **0:20–0:35 Start Duel.** Squads walk into the hall.
3. **0:35–1:30 The fight.** Move with the joystick; tap an enemy (🎯); hold a
   short-range card while out of reach (red preview), walk in until it turns
   green, release. Show a long-range card, a heal on an ally, and a
   **Secret** being laid (❓ pill), ideally one springing.
4. **1:30–2:00 Control.** Land a **Stun** on a casting enemy ("INTERRUPTED")
   or a Chill; show the status timer on the unit tag.
5. **2:00–end The finish.** Keep going until a Tank falls (slow motion,
   letterbox and the victory pose), or let the Blizzard hit after 2:00.

On Android: Quick Settings → Screen record; on iPhone: Control Center →
Screen Recording.

## Rights checklist

- [x] No API keys, credentials, wallet data or personal data in the repository
  or its history (full-history scan).
- [x] Toolkit `RIGHTS.md` and `THIRD_PARTY_NOTICES.md` kept unchanged in
  `public/assets/axie3d/`; project-level notices in
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
- [x] Only the parts of the toolkit and content pack the game needs are
  bundled; they are not offered as a standalone download.
- [x] No wallet or onchain features.
- [x] Plays from a direct browser link, nothing to install.
