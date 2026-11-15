// DUSK STRIKE — the one place game state lives. Every system reads and
// writes this object; nothing keeps a second copy of the match. Events are
// a tiny bus: systems emit ('kill', 'shot', 'roundEnd'...), HUD and audio
// subscribe, so gameplay code never touches the DOM or the sound card.
export function createState() {
  return {
    phase: 'loading', // loading | menu | playing | paused | roundEnd | matchEnd
    roundPhase: 'buy', // buy | live | end
    round: 1,
    score: { guard: 0, raiders: 0 },
    timeLeft: 0,
    buyLeft: 0,
    fighters: [], // player + 5 bots, same shape
    grenades: [],
    smoke: [], // {x, y, z, r, until} — live smoke clouds that block bot sight
    noise: [], // {x, z, radius, until} — gunfire bots can hear
    bomb: { state: 'carried', site: null, carrier: null, x: 0, z: 0, timer: 0, planter: null },
    stats: { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, roundsWon: 0 },
    roundResult: null, // {winner, reason} for the end-of-round overlay
    matchWinner: null,
    settings: loadSettings(),
    time: 0,
    _listeners: new Map(),
  };
}

const DEFAULT_SETTINGS = { sensitivity: 1, master: 0.8, sfx: 0.9, quality: 'high', crosshair: true };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('dusk-strike-settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings(s) {
  try { localStorage.setItem('dusk-strike-settings', JSON.stringify(s)); } catch { /* private mode */ }
}

export function on(state, name, fn) {
  if (!state._listeners.has(name)) state._listeners.set(name, []);
  state._listeners.get(name).push(fn);
}

export function emit(state, name, data) {
  const list = state._listeners.get(name);
  if (list) for (const fn of list) fn(data);
}

export function aliveOf(state, team) {
  let n = 0;
  for (const f of state.fighters) if (f.team === team && f.alive) n++;
  return n;
}

export function playerOf(state) {
  return state.fighters[0]; // the player is always fighters[0]
}
