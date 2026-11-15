// DUSK STRIKE — Pier 7, a dusk harbor warehouse map. The layout is data:
// a list of boxes becomes meshes, colliders and cover in one pass. Three
// lanes (north, mid, south) join the two spawns; Site A sits in the
// warehouse north-west, Site B on the open pier south-east. Bots navigate
// a hand-placed waypoint graph; bullets and sight-lines test the same
// colliders, so what blocks a shot blocks a bot's eyes too.
//
// v3: a west-alley flank and a pier flank with new waypoints, a forklift,
// mooring bollards, site landmarks (warehouse board, pier board, floodlight
// tower, a moored hull), and merged static geometry so the whole map draws
// in a handful of calls instead of one per box.
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
  // v3: mid-south low wall, an extra mid crate, a stacked crate
  [0, 12, 4, 1, 1.4, 'concrete'],
  [3, -6, 1.4, 1.4, 1.4, 'wood'],
  [-13, -5, 1.4, 1.4, 1.4, 'wood', 1.4],
];

// Waypoints: [x, z, links...] — lanes, connectors, site approaches.
// v3 adds the west alley (30), the pier flank (31) and a mid-south
// connector (32); every new link was checked against the colliders.
const WP = [
  [-28, 0, 1, 2], [-26, -4, 0, 3, 8, 30], [-24, 4, 0, 3, 14],
  [-14, 0, 1, 2, 4, 21, 22], [-9, -1, 3, 5, 21], [0, 0, 4, 6],
  [8, 1, 5, 7, 23, 24], [14, 0, 6, 27, 28],
  [-28, -20, 1, 9, 30], [-14, -20, 8, 10, 21], [-7, -20, 9, 11, 29],
  [6, -19, 10, 12, 23], [16, -17, 11, 13], [24, -12, 12, 27],
  [-24, 14, 2, 15], [-10, 18, 14, 16, 22, 32], [-4, 17, 15, 17, 24, 32],
  [6, 19, 16, 18], [16, 14, 17, 19, 25], [25, 10, 18, 25, 28, 31],
  [-16.5, -14.5, 29], [-10, -9, 3, 4, 9, 29], [-10, 9, 3, 15, 32],
  [10, -8, 6, 11], [10, 8, 6, 16], [19, 13, 18, 19],
  [28, 0, 27, 28, 31], [24, -4, 7, 13, 26], [24, 4, 7, 19, 26],
  [-11.5, -12.3, 20, 21, 10],
  [-28, -12, 1, 8], [28, 14, 19, 26], [-6, 12, 22, 16, 15],
];

// Merge one base geometry under many transforms into a single BufferGeometry.
// Static map pieces share materials, so one merged mesh per material replaces
// dozens of draw calls — and matrixAutoUpdate stays off, so the renderer
// never recomputes their matrices.
function mergeTransformed(baseGeo, matrices) {
  const pos = [], norm = [], uv = [], idx = [];
  const p = baseGeo.attributes.position, n = baseGeo.attributes.normal, u = baseGeo.attributes.uv;
  const index = baseGeo.index.array;
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let offset = 0;
  for (const m of matrices) {
    nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      norm.push(nv.x, nv.y, nv.z);
      uv.push(u.getX(i), u.getY(i));
    }
    for (let i = 0; i < index.length; i++) idx.push(index[i] + offset);
    offset += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const _q = new THREE.Quaternion();
function boxMatrix(x, y, z, w, h, d) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), _q, new THREE.Vector3(w, h, d));
}

export function buildWorld(scene, textures, quality) {
  const group = new THREE.Group();
  const colliders = [];
  const mats = {};
  for (const k of Object.keys(textures)) {
    if (k.startsWith('sign') || k.startsWith('board') || k === 'sky') continue;
    mats[k] = new THREE.MeshStandardMaterial({ map: textures[k], roughness: 0.9, metalness: 0.05 });
  }
  mats.metal = new THREE.MeshStandardMaterial({ map: textures.metal, roughness: 0.45, metalness: 0.7 });

  // Boxes, merged per material — one draw call each.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const byMat = new Map();
  for (const [x, z, w, d, h, mat, y = 0] of BOXES) {
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(boxMatrix(x, y + h / 2, z, w, h, d));
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: y, maxY: y + h });
  }
  for (const [mat, matrices] of byMat) {
    const m = new THREE.Mesh(mergeTransformed(boxGeo, matrices), mats[mat]);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    group.add(m);
  }

  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ map: textures.ground, roughness: 1 });
  textures.ground.repeat.set(8, 6);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();
  group.add(ground);

  // Barrels (cylinders, merged; AABB colliders)
  const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10);
  const barrelSpots = [[-6, -12], [12, 12], [-26, 8], [26, -8], [-16, 12], [14, -2], [-20, 8]];
  const barrelMats = barrelSpots.map(([x, z]) => boxMatrix(x, 0.55, z, 1, 1, 1));
  const barrelMesh = new THREE.Mesh(
    mergeTransformed(barrelGeo, barrelMats),
    new THREE.MeshStandardMaterial({ color: 0x7a2f1e, roughness: 0.7, metalness: 0.3 }),
  );
  barrelMesh.castShadow = true;
  barrelMesh.matrixAutoUpdate = false;
  group.add(barrelMesh);
  for (const [x, z] of barrelSpots) {
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, minY: 0, maxY: 1.1 });
  }

  // Forklift by the north containers (static prop, one collider).
  const fork = new THREE.Group();
  const forkBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 2.2), mats.metal);
  forkBody.position.y = 0.65;
  const forkMast = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.18), mats.metal);
  forkMast.position.set(0, 1.3, -1.15);
  const forkGuard = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.5 }));
  forkGuard.position.y = 2.05;
  const forkSeat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 }));
  forkSeat.position.set(0, 1.2, 0.35);
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
  for (const [wx, wz] of [[-0.78, -0.7], [0.78, -0.7], [-0.78, 0.75], [0.78, 0.75]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.32, wz);
    fork.add(wheel);
  }
  fork.add(forkBody, forkMast, forkGuard, forkSeat);
  fork.position.set(-2, 0, -13);
  fork.rotation.y = 0.5;
  fork.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.matrixAutoUpdate = false; o.updateMatrix(); } });
  group.add(fork);
  colliders.push({ minX: -3.1, maxX: -0.9, minZ: -13.8, maxZ: -12.2, minY: 0, maxY: 2.2 });

  // Mooring bollards at Site B (merged cylinders + colliders).
  const bollardGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.8, 10);
  const bollardSpots = [[17, 10], [21, 10], [17, 17], [21, 17]];
  const bollards = new THREE.Mesh(
    mergeTransformed(bollardGeo, bollardSpots.map(([x, z]) => boxMatrix(x, 0.4, z, 1, 1, 1))),
    new THREE.MeshStandardMaterial({ color: 0x2e4a72, roughness: 0.55, metalness: 0.5 }),
  );
  bollards.castShadow = true;
  bollards.matrixAutoUpdate = false;
  group.add(bollards);
  for (const [x, z] of bollardSpots) {
    colliders.push({ minX: x - 0.38, maxX: x + 0.38, minZ: z - 0.38, maxZ: z + 0.38, minY: 0, maxY: 0.8 });
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
    ring.matrixAutoUpdate = false; ring.updateMatrix();
    group.add(ring);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x222222 }));
    pole.position.set(x + 3.4, 1.7, z);
    pole.matrixAutoUpdate = false; pole.updateMatrix();
    group.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffb03a }));
    lamp.position.set(x + 3.4, 3.5, z); group.add(lamp);
    beacons.push(lamp);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
    sign.position.set(x + 3.4, 2.6, z); sign.rotation.y = Math.PI / 4;
    sign.matrixAutoUpdate = false; sign.updateMatrix();
    group.add(sign);
    sites[key] = { x, z, r: 3.1 };
  }

  // Site landmarks: painted boards + a floodlight tower at Site A.
  // The warehouse board hangs on the south wall, facing the mid entrance.
  const boardA = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshBasicMaterial({ map: textures.boardWarehouse }));
  boardA.position.set(-22, 2.6, -9.4);
  boardA.rotation.y = Math.PI;
  boardA.matrixAutoUpdate = false; boardA.updateMatrix();
  group.add(boardA);
  const boardB = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75),
    new THREE.MeshBasicMaterial({ map: textures.boardPier }));
  boardB.position.set(19, 1.0, 8.4);
  boardB.rotation.y = Math.PI;
  boardB.matrixAutoUpdate = false; boardB.updateMatrix();
  group.add(boardB);
  const floodPole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.6, metalness: 0.5 }));
  floodPole.position.set(-23, 3.5, -19);
  floodPole.castShadow = true;
  floodPole.matrixAutoUpdate = false; floodPole.updateMatrix();
  group.add(floodPole);
  const floodHead = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.5 }));
  floodHead.position.set(-23, 7.1, -19);
  floodHead.rotation.x = 0.5;
  floodHead.matrixAutoUpdate = false; floodHead.updateMatrix();
  group.add(floodHead);
  const floodLamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
  floodLamp.position.set(-23, 6.9, -18.8);
  group.add(floodLamp);
  colliders.push({ minX: -23.3, maxX: -22.7, minZ: -19.3, maxZ: -18.7, minY: 0, maxY: 7 });

  // Moored hull silhouette south of the pier (outside the walls).
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x141018 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 2.5, 4), hullMat);
  hull.position.set(10, 0.8, 30);
  hull.matrixAutoUpdate = false; hull.updateMatrix();
  group.add(hull);
  const hullTop = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), hullMat);
  hullTop.position.set(7, 3, 30);
  hullTop.matrixAutoUpdate = false; hullTop.updateMatrix();
  group.add(hullTop);

  // Light poles around the yard (merged: poles one mesh, lamps one mesh).
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 6, 6);
  const poleSpots = [[-28, -18], [28, 18], [-8, -19], [8, 19], [0, -12]];
  const poles = new THREE.Mesh(
    mergeTransformed(poleGeo, poleSpots.map(([x, z]) => boxMatrix(x, 3, z, 1, 1, 1))),
    new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.6, metalness: 0.5 }),
  );
  poles.matrixAutoUpdate = false;
  group.add(poles);
  const lampGeo = new THREE.SphereGeometry(0.28, 8, 8);
  const lamps = new THREE.Mesh(
    mergeTransformed(lampGeo, poleSpots.map(([x, z]) => boxMatrix(x, 6.1, z, 1, 1, 1))),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  );
  lamps.matrixAutoUpdate = false;
  group.add(lamps);

  // Distant harbor cranes (silhouettes outside the walls, no colliders)
  const craneMat = new THREE.MeshBasicMaterial({ color: 0x1a1420 });
  for (const [x, z, h] of [[-20, -34, 16], [8, -36, 20], [26, 34, 14]]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), craneMat);
    tower.position.set(x, h / 2, z);
    tower.matrixAutoUpdate = false; tower.updateMatrix();
    group.add(tower);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 1), craneMat);
    arm.position.set(x + 4, h - 1, z);
    arm.matrixAutoUpdate = false; arm.updateMatrix();
    group.add(arm);
  }
  // Low sun disc on the horizon
  const sun = new THREE.Mesh(new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, fog: false }));
  sun.position.set(-60, 9, -30); sun.lookAt(0, 4, 0);
  sun.matrixAutoUpdate = false; sun.updateMatrix();
  group.add(sun);

  // Dusk sky dome: painted gradient, drawn behind everything.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 16),
    new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -1;
  dome.matrixAutoUpdate = false;
  group.add(dome);

  // Lighting: warm low sun + cool sky fill + dusk fog
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 110);
  const sunLight = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sunLight.position.set(-24, 30, -18);
  sunLight.castShadow = quality === 'high';
  sunLight.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
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
