# threejs-tactical-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/xhamzar/threejs-tactical-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/xhamzar/threejs-tactical-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**DUSK STRIKE** — a round-based tactical FPS in the browser, built on three.js. Defend Pier 7, a dusk harbor warehouse map: you and two bot teammates (GUARD) hold Sites A and B against three RAIDERS bots carrying a bomb. Rounds, an economy with a buy menu, headshots, recoil, grenades, and bots that patrol lanes, hold positions, and react to what they see and hear.

## Run it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

## Controls

WASD move · mouse look · click fire · R reload · 1/2/3 switch weapon · G grenade · Ctrl/C crouch · Shift sprint · B buy menu · E (hold) defuse the bomb · Esc pause.

## How it is built

- `game/` — the playable game as static files, no build step: ES modules, three.js 0.187.0 vendored under `game/vendor/three/`, procedural canvas textures and synthesized WebAudio sound (no external assets, no network requests).
- `game/src/` — one module per job: fixed-step simulation in `main.js`, movement in `player.js`, gunplay in `weapons.js` + `combat.js`, bot AI in `bots.js`, rounds and economy in `rounds.js`, HUD in `hud.js`, menus in `menus.js`.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the output and writes `dossier.json` with the kit's vendored library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2a62mj9w&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
