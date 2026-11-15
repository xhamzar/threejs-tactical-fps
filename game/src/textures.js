// DUSK STRIKE — every texture is painted on a canvas at load: no image
// files, no network, nothing to download. A seeded random keeps the look
// identical every run (the same rust streaks, the same worn paint).
// v3: richer detail everywhere — cracked concrete, rusted metal, grained
// wood, a lived-in yard floor, stencilled container labels, and a painted
// dusk sky for the dome.
import * as THREE from 'three';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function speckle(ctx, size, rand, n, colors, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.globalAlpha = aMin + rand() * (aMax - aMin);
    const s = 1 + rand() * 3;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx, size, rand, n, color, vertical) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.05 + rand() * 0.12;
    const x = rand() * size, y = rand() * size;
    if (vertical) ctx.fillRect(x, y, 1 + rand() * 2, 20 + rand() * 90);
    else ctx.fillRect(x, y, 20 + rand() * 90, 1 + rand() * 2);
  }
  ctx.globalAlpha = 1;
}

// Soft dark blotches: oil stains, water damage, grime.
function blotches(ctx, size, rand, n, color, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rand() * size, y = rand() * size, r = rMin + rand() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Jagged random-walk cracks.
function cracks(ctx, size, rand, n, color) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    let x = rand() * size, y = rand() * size;
    ctx.lineWidth = 1 + rand();
    ctx.globalAlpha = 0.25 + rand() * 0.3;
    ctx.beginPath(); ctx.moveTo(x, y);
    const segs = 4 + (rand() * 6 | 0);
    for (let s = 0; s < segs; s++) {
      x += (rand() - 0.5) * 36; y += rand() * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Corrugated shipping container: ribs, rust, dents, stencilled labels.
function containerTexture(base, rib, seed, label) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 16) {
    ctx.fillStyle = rib; ctx.fillRect(x, 0, 7, size);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 7, 0, 2, size);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 14, 0, 2, size);
  }
  // Rust bleeding down from the top edge and around dents.
  streaks(ctx, size, rand, 34, '#3a1c0c', true);
  blotches(ctx, size, rand, 6, '#4a2410', 6, 22, 0.5);
  speckle(ctx, size, rand, 500, ['#000000', '#ffffff', '#3a2418'], 0.03, 0.1);
  // Stencilled shipping label, worn paint.
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#f5ead8';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(label, 18, 52);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('PIER 7 · DUSK HARBOR', 18, 76);
  ctx.globalAlpha = 0.25;
  ctx.fillRect(14, 92, 120, 3);
  ctx.restore();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, size, 6); ctx.fillRect(0, size - 6, size, 6);
  return tex(c);
}

function concreteTexture(seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#8d8880'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rand, 2600, ['#6f6a63', '#a39d94', '#7d7871'], 0.08, 0.25);
  blotches(ctx, size, rand, 5, '#55504a', 20, 60, 0.35);
  streaks(ctx, size, rand, 14, '#5c564e', true);
  cracks(ctx, size, rand, 4, '#4a453f');
  // Formwork panel seams + tie holes.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(size, 128); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, size); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const [x, y] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  return tex(c);
}

function groundTexture(seed) {
  const size = 512, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4a4440'; ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, rand, 9000, ['#38332f', '#5b534c', '#2e2a27'], 0.1, 0.3);
  blotches(ctx, size, rand, 7, '#1c1a18', 18, 70, 0.5); // oil stains
  cracks(ctx, size, rand, 6, '#241f1c');
  // Tire arcs from forklifts.
  ctx.strokeStyle = 'rgba(20,18,16,0.35)';
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = 6 + rand() * 6;
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 40 + rand() * 90, rand() * 3, rand() * 3 + 1.2);
    ctx.stroke();
  }
  // Expansion joints + faded painted lines.
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(size, i * 128); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,176,58,0.35)'; ctx.lineWidth = 5; ctx.setLineDash([26, 18]);
  ctx.beginPath(); ctx.moveTo(0, 64); ctx.lineTo(size, 64); ctx.stroke();
  ctx.setLineDash([]);
  // Faded dock number painted on the concrete.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 90px system-ui, sans-serif';
  ctx.fillText('07', 330, 420);
  ctx.restore();
  return tex(c);
}

function woodTexture(seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#7a5a34'; ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 32) {
    ctx.fillStyle = rand() > 0.5 ? '#85653c' : '#6f4f2c'; ctx.fillRect(0, y, size, 30);
    // Grain lines per plank.
    ctx.strokeStyle = 'rgba(60,40,16,0.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const gy = y + 5 + rand() * 22;
      ctx.beginPath(); ctx.moveTo(0, gy);
      ctx.bezierCurveTo(80, gy + (rand() - 0.5) * 6, 170, gy + (rand() - 0.5) * 6, size, gy);
      ctx.stroke();
    }
    // Knots + nail heads.
    if (rand() > 0.4) {
      ctx.fillStyle = 'rgba(40,26,10,0.7)';
      ctx.beginPath(); ctx.ellipse(30 + rand() * 190, y + 15, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath(); ctx.arc(10, y + 15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size - 10, y + 15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, y + 30, size, 2);
  }
  streaks(ctx, size, rand, 40, '#4a3319', false);
  return tex(c);
}

// Brushed dark metal with scratches — forklift body, drums, fittings.
function metalTexture(seed) {
  const size = 256, rand = rng(seed);
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4c4f55'; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    const y = rand() * size;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + (rand() - 0.5) * 4); ctx.stroke();
  }
  streaks(ctx, size, rand, 18, '#2c1c10', true);
  blotches(ctx, size, rand, 4, '#33200f', 8, 30, 0.45);
  speckle(ctx, size, rand, 300, ['#000000', '#8a8d94'], 0.05, 0.12);
  return tex(c);
}

// Dusk sky gradient for the sky dome: violet zenith, ember horizon.
function skyTexture() {
  const [c, ctx] = canvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1b1430');
  g.addColorStop(0.42, '#3a2440');
  g.addColorStop(0.62, '#7a3a3a');
  g.addColorStop(0.74, '#c65a2a');
  g.addColorStop(0.82, '#ff9a3c');
  g.addColorStop(0.9, '#2a1a24');
  g.addColorStop(1, '#14101a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  const t = tex(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

function hazardTexture() {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#d8a018'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#17171a';
  for (let i = -2; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 32, size); ctx.lineTo(i * 32 + 32, 0);
    ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 16, size);
    ctx.closePath(); ctx.fill();
  }
  return tex(c);
}

function signTexture(letter, color) {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(6, 6, size - 12, size - 12);
  ctx.fillStyle = color; ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, size / 2 + 4);
  return tex(c);
}

// Wide painted sign board (warehouse / pier landmarks).
function boardTexture(text, color) {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = '#14181d'; ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = color; ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  return tex(c);
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeTextures() {
  return {
    concrete: concreteTexture(11),
    ground: groundTexture(23),
    wood: woodTexture(37),
    metal: metalTexture(47),
    sky: skyTexture(),
    hazard: hazardTexture(),
    containerOrange: containerTexture('#b4551f', '#8f3f14', 41, 'DSLU 042'),
    containerTeal: containerTexture('#1f6f6a', '#15524e', 53, 'DSLU 117'),
    containerRust: containerTexture('#7a4a2e', '#5c341f', 67, 'DSLU 209'),
    containerBlue: containerTexture('#2e4a72', '#20344f', 71, 'DSLU 318'),
    signA: signTexture('A', '#ffb03a'),
    signB: signTexture('B', '#2fd8c4'),
    boardWarehouse: boardTexture('WAREHOUSE 07', '#ffb03a'),
    boardPier: boardTexture('PIER 7', '#2fd8c4'),
  };
}
