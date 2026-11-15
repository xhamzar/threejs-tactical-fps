// DUSK STRIKE — Pier 7, a dusk harbor warehouse map. The layout is data:
// a list of boxes becomes meshes, colliders and cover in one pass. Three
// lanes (north, mid, south) join the two spawns; Site A sits in the
// warehouse north-west, Site B on the open pier south-east. Bots navigate
// a hand-placed waypoint graph; bullets and sight-lines test the same
// colliders, so what blocks a shot blocks a bot's eyes too.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// [x, z, width, depth, height, material, y-offset]. Every waypoint link was
// checked against these boxes: no link crosses a collider.
const BOXES = [
  // Perimeter walls (h 4.5, t 1)
  [0, -22.5, 66, 1, 4.5, 'concrete'], [0, 22.5, 66, 1, 4.5, 'concrete'],
  [-32.5, 0, 1, 46, 4.5, 'concrete'], [32.5, 0, 1, 46, 4.5, 'concrete'],
  // Warehouse A (x -24.5..-13.5, z -17..-9; east gap z -13.5..-11, south gap x -19..-16.5)
  [-19, -17, 11, 1, 3.6, 'concrete'], [-24.5, -13, 1, 8, 3.6, 'concrete'],
  [-13.5, -15.25, 1, 3.5, 3.6, 'concrete'], [-13.5, -10, 1, 2, 3.6, 'concrete'],
  [-21.75, -9, 5.5, 1, 3.6, 'concrete'], [-15, -9, 3, 1, 3.6, 'concrete'],
  [-19, -12, 2.4, 2.4, 2.4, 'wood'],
  // Mid container stacks (one stacked second layer)
  [-4, -3, 6, 2.4, 2.6, 'containerOrange'], [4, 3, 6, 2.4, 2.6, 'containerTeal'],
  [-1, -8, 2.4, 6, 2.6, 'containerRust'], [2, 8, 2.4, 6, 2.6, 'containerBlue'],
  [-4, -3, 6, 2.4, 2.6, 'containerTeal', 2.6],
  // Lane cover (kept off the waypoint lines)
  [-2, -18, 6, 2.4, 2.6, 'containerBlue'], [12, -15, 6, 2.4, 2.6, 'containerOrange'],
  [16, -12, 2.4, 6, 2.6, 'containerRust'],
  [-18, 19, 6, 2.4, 2.6, 'containerRust'], [6, 16, 6, 2.4, 2.6, 'containerTeal'],
  [14, 8, 2.4, 6, 2.6, 'containerOrange'],
  // Pier B (low walls + crates)
  [19, 9, 8, 1, 1.4, 'concrete'], [23, 15, 1, 6, 1.4, 'concrete'],
  [16, 16, 2.4, 2.4, 2.4, 'wood'], [22, 17, 2.4, 2.4, 2.4, 'wood'],
  // Scattered crates (low cover)
  [-13, -5, 1.4, 1.4, 1.4, 'wood'], [-8, 5, 1.4, 1.4, 1.4, 'wood'],
  [12, -4, 1.4, 1.4, 1.4, 'wood'], [8, 6, 1.4, 1.4, 1.4, 'wood'],
  [-24, -6, 1.4, 1.4, 1.4, 'wood'], [26, 6, 1.4, 1.4, 1.4, 'wood'],
  [20, 16, 1.4, 1.4, 1.4, 'wood'],
];

// Waypoints: [x, z, links...] — lanes, connectors, site approaches.
const WP = [
  [-28, 0, 1, 2], [-26, -4, 0, 3, 8], [-24, 4, 0, 3, 14],
  [-14, 0, 1, 2, 4, 21, 22], [-9, -1, 3, 5, 21], [0, 0, 4, 6],
  [8, 1, 5, 7, 23, 24], [14, 0, 6, 27, 28],
  [-28, -20, 1, 9], [-14, -20, 8, 10, 21], [-4, -20, 9, 11, 29],
  [6, -19, 10, 12, 23], [16, -17, 11, 13], [24, -12, 12, 27],
  [-24, 14, 2, 15], [-10, 18, 14, 16, 22], [-4, 17, 15, 17, 24],
  [6, 19, 16, 18], [16, 14, 17, 19, 25], [25, 10, 18, 25, 28],
  [-19, -13, 29], [-10, -9, 3, 4, 9, 29], [-10, 9, 3, 15],
  [10, -8, 6, 11], [10, 8, 6, 16], [19, 13, 18, 19],
  [28, 0, 27, 28], [24, -4, 7, 13, 26], [24, 4, 7, 19, 26],
  [-11.5, -12.3, 20, 21, 10],
];

export function buildWorld(scene, textures, quality) {
  const group = new THREE.Group();
  const colliders = [];
  const mats = {};
  for (const k of Object.keys(textures)) {
    if (k.startsWith('sign')) continue;
    mats[k] = new THREE.MeshStandardMaterial({ map: textures[k], roughness: 0.9, metalness: 0.05 });
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  for (const [x, z, w, d, h, mat, y = 0] of BOXES) {
    const m = new THREE.Mesh(boxGeo, mats[mat]);
    m.position.set(x, y + h / 2, z);
    m.scale.set(w, h, d);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
  }

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ map: textures.ground, roughness: 1 });
  textures.ground.repeat.set(8, 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Barrels (cylinders, AABB colliders)
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x7a2f1e, roughness: 0.7, metalness: 0.3 });
  for (const [x, z] of [[-6, -12], [12, 12], [-26, 8], [26, -8], [-16, 12]]) {
    const b = new THREE.Mesh(barrelGeo, barrelMat);
    b.position.set(x, 0.55, z); b.castShadow = true;
    group.add(b);
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, minY: 0, maxY: 1.1 });
  }

  // Bomb sites: hazard ring + beacon pole + letter sign
  const sites = {};
  const beacons = [];
  for (const [key, x, z, signTex] of [['A', -19, -13, textures.signA], ['B', 19, 13, textures.signB]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.1, 40),
      new THREE.MeshBasicMaterial({ map: textures.hazard, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.02, z);
    group.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.set(x + 3.4, 1.7, z); group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb03a }));
    lamp.position.set(x + 3.4, 3.5, z); group.add(lamp);
    beacons.push(lamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(x + 3.4, 2.6, z); sign.rotation.y = Math.PI / 4;
    group.add(sign);
    sites[key] = { x, z, r: 3.1 };
  }

  // Light poles around the yard
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.6, metalness: 0.5 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const [x, z] of [[-28, -18], [28, 18], [-8, -19], [8, 19], [0, -12]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
    p.position.set(x, 3, z); group.add(p);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), lampMat);
    l.position.set(x, 6.1, z); group.add(l);
  }

  // Distant harbor cranes (silhouettes outside the walls, no colliders)
  const craneMat = new THREE.MeshBasicMaterial({ color: 0x1a1420 });
  for (const [x, z, h] of [[-20, -34, 16], [8, -36, 20], [26, 34, 14]]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), craneMat);
    tower.position.set(x, h / 2, z); group.add(tower);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 1), craneMat);
    arm.position.set(x + 4, h - 1, z); group.add(arm);
  }
  // Low sun disc on the horizon
  const sun = new THREE.Mesh(new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, fog: false }));
  sun.position.set(-60, 9, -30); sun.lookAt(0, 4, 0);
  group.add(sun);

  // Lighting: warm low sun + cool sky fill + dusk fog
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 110);
  const sunLight = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sunLight.position.set(-24, 30, -18);
  sunLight.castShadow = quality === 'high';
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -40; sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40; sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.bias = -0.0004;
  group.add(sunLight);
  group.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.05));
  const fill = new THREE.DirectionalLight(0x6a7ab8, 0.5);
  fill.position.set(20, 18, 24);
  group.add(fill);

  scene.add(group);

  const waypoints = WP.map(([x, z, ...links]) => ({ x, z, links }));
  const world = {
    group, colliders, sites, beacons,
    spawns: { guard: [[-28, -2], [-28, 2], [-26, 0]], raiders: [[28, -2], [28, 2], [26, 0]] },
    waypoints,
    bounds: { minX: -31.5, maxX: 31.5, minZ: -21.5, maxZ: 21.5 },
    update(dt, t) {
      const s = 1 + Math.sin(t * 3) * 0.25;
      for (const b of beacons) b.scale.setScalar(s);
    },
  };
  return world;
}

// Segment vs AABB (slab test). Returns t in [0,1] of first hit, or Infinity.
export function segmentHitBox(ax, ay, az, bx, by, bz, box) {
  let tmin = 0, tmax = 1;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const axes = [[ax, dx, box.minX, box.maxX], [ay, dy, box.minY, box.maxY], [az, dz, box.minZ, box.maxZ]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return Infinity; }
    else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

// True when nothing solid stands between two points (eye-level sight).
export function hasLineOfSight(world, ax, ay, az, bx, by, bz) {
  for (const box of world.colliders) {
    if (segmentHitBox(ax, ay, az, bx, by, bz, box) < 1) return false;
  }
  return true;
}

// Distance along a ray to the nearest wall, or Infinity.
export function rayHitWorld(world, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = Infinity;
  const ex = ox + dx * maxDist, ey = oy + dy * maxDist, ez = oz + dz * maxDist;
  for (const box of world.colliders) {
    const t = segmentHitBox(ox, oy, oz, ex, ey, ez, box);
    if (t < 1) best = Math.min(best, t * maxDist);
  }
  // Ground plane y=0
  if (dy < 0) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

export function nearestWaypoint(world, x, z) {
  let best = 0, bd = Infinity;
  world.waypoints.forEach((w, i) => {
    const d = (w.x - x) ** 2 + (w.z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

// Breadth-first path over the waypoint graph; returns waypoint indices.
export function findPath(world, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of world.waypoints[cur].links) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let n = cur;
        while (n !== -1) { path.push(n); n = prev.get(n); }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [to];
}
