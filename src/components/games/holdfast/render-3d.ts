import * as THREE from "three";
import { COIN_LIFE, type Engine, GRUNT, HALL, KING, PAD_R, PATH, TOWER, WORLD } from "./engine";
import { FLASH_TIME, FLIGHT_TIME, Fx, PUFF_TIME, RISE_TIME } from "./fx";
import {
  HALL_H,
  POSTS,
  POST_H,
  type Project,
  ROOF_H,
  TOWER_H,
  TREES,
  clamp,
  easeOutBack,
  shotFrom,
} from "./scene";

// Draws the board in 3D: low-poly models built from primitives, lit by one sun with
// shadows, seen through a tilted camera that follows the king. A world point (x, y) sits at
// (x, 0, y) here: three's y axis is up.

const QUARTER = Math.PI / 2;
const FOV = 30;
const IVORY = 0xf5efe1;
const GOLD = 0xfacc15;

const solid = (color: number, more: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...more });
const flat = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1, side: THREE.DoubleSide });
const part = (geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) => {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  return m;
};
/** Lay a flat shape (built facing the camera) down on the ground. */
const laid = <T extends THREE.Object3D>(o: T, heading = 0) => {
  o.rotation.order = "YXZ";
  o.rotation.x = -QUARTER;
  o.rotation.y = -heading;
  return o;
};

type EnemyView = { group: THREE.Group; body: THREE.Mesh; head: THREE.Mesh };
type PadView = { group: THREE.Group; fill: THREE.Mesh };

export class Renderer3 {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 20, 8000);
  private sun = new THREE.DirectionalLight(0xfff1d0, 2.0);
  private fx = new Fx();
  private w = 1;
  private h = 1;
  private last = 0;
  private settled = false;
  private focus = new THREE.Vector3();
  private v = new THREE.Vector3();
  private prev = { x: 0, y: 0 };
  private lean = { x: 0, y: 0 };
  private walked = 0;

  // Shared shapes and paints for things that come and go.
  private geo = {
    body: new THREE.CapsuleGeometry(7.5, 8, 4, 10),
    head: new THREE.SphereGeometry(5.4, 10, 8),
    coin: new THREE.CylinderGeometry(5, 5, 1.8, 14),
    puff: new THREE.SphereGeometry(5, 8, 6),
    shot: new THREE.BoxGeometry(1, 1, 1),
    reach: new THREE.RingGeometry(TOWER.range - 1.4, TOWER.range, 72),
    shaft: new THREE.CylinderGeometry(TOWER.r - 1, TOWER.r + 2, TOWER_H, 10),
    deck: new THREE.CylinderGeometry(TOWER.r + 5, TOWER.r + 2, 8, 10),
    archer: new THREE.CapsuleGeometry(4.6, 6, 4, 8),
  };
  private paint = {
    red: solid(0xe5484d),
    hurt: solid(0xa61e25),
    flash: solid(0xffd9d9, { emissive: 0xff8a8a, emissiveIntensity: 0.6 }),
    gold: solid(GOLD, { roughness: 0.45, emissive: 0x7a5600, emissiveIntensity: 0.35 }),
    wall: solid(0xe9e1cf),
    stone: solid(0x9fb0c0),
    deck: solid(0xc9d6e2),
    archer: solid(0x60a5fa),
    reach: flat(0x93c5fd, 0.18),
  };

  private kingRoot = new THREE.Group();
  private kingRig = new THREE.Group();
  private kingMarks = new THREE.Group();
  private stack: THREE.Mesh[] = [];
  private chevrons: THREE.Mesh[] = [];
  private shots: THREE.Mesh[] = [];
  private puffs: THREE.Mesh[] = [];
  private flights: THREE.Mesh[] = [];
  private enemies = new Map<number, EnemyView>();
  private coins = new Map<number, THREE.Mesh>();
  private pads = new Map<number, PadView>();
  private towers: THREE.Group[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.gl.setClearColor(0x000000, 0);
    this.gl.shadowMap.enabled = true;

    const { scene, sun } = this;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb5a8, 2.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    Object.assign(sun.shadow.camera, { left: -720, right: 720, top: 720, bottom: -720, near: 10, far: 2600 });
    sun.shadow.camera.updateProjectionMatrix();
    scene.add(sun, sun.target);

    this.buildGround();
    this.buildBase();
    this.buildKing();

    for (let i = 0; i < 6; i++) {
      const tip = new THREE.BufferGeometry();
      tip.setAttribute("position", new THREE.Float32BufferAttribute([7, 0, 0, -4, 0, -7, -4, 0, 7], 3));
      const chevron = new THREE.Mesh(tip, flat(0x38bdf8));
      chevron.position.y = 1.5;
      this.chevrons.push(chevron);
    }
    for (let i = 0; i < 16; i++) this.shots.push(new THREE.Mesh(this.geo.shot, flat(0xfde047)));
    for (let i = 0; i < 8; i++) this.puffs.push(new THREE.Mesh(this.geo.puff, flat(IVORY, 0.8)));
    for (let i = 0; i < 16; i++) this.flights.push(this.coinMesh());
    for (const m of [...this.chevrons, ...this.shots, ...this.puffs, ...this.flights]) {
      m.visible = false;
      scene.add(m);
    }
  }

  private buildGround() {
    const felt = part(new THREE.PlaneGeometry(WORLD.w, WORLD.h), solid(0x1a5a3e));
    felt.castShadow = false;
    laid(felt).position.set(WORLD.w / 2, 0, WORLD.h / 2);
    // Beyond the edge of the world: darker ground, so the board reads as a table top.
    const beyond = part(new THREE.PlaneGeometry(9000, 9000), solid(0x0f3325), false);
    laid(beyond).position.set(WORLD.w / 2, -0.6, WORLD.h / 2);
    this.scene.add(felt, beyond);

    const dirt = solid(0xb9a77f);
    PATH.forEach((b, i) => {
      const joint = part(new THREE.CircleGeometry(23, 24), dirt);
      joint.castShadow = false;
      laid(joint).position.set(b.x, 0.4, b.y);
      this.scene.add(joint);
      if (i === 0) return;
      const a = PATH[i - 1];
      const stretch = part(new THREE.PlaneGeometry(Math.hypot(b.x - a.x, b.y - a.y), 46), dirt);
      stretch.castShadow = false;
      laid(stretch, Math.atan2(b.y - a.y, b.x - a.x)).position.set((a.x + b.x) / 2, 0.4, (a.y + b.y) / 2);
      this.scene.add(stretch);
    });

    // Trees and fence posts repeat one shape many times, so each is a single draw.
    const spot = new THREE.Object3D();
    const many = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, place: (i: number) => void) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      for (let i = 0; i < count; i++) {
        spot.scale.setScalar(1);
        place(i);
        spot.updateMatrix();
        mesh.setMatrixAt(i, spot.matrix);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };
    many(new THREE.CylinderGeometry(2.6, 3, POST_H, 6), solid(0xb08d62), POSTS.length, (i) => {
      spot.position.set(POSTS[i].x, POST_H / 2, POSTS[i].y);
    });
    const tree = (geometry: THREE.BufferGeometry, material: THREE.Material, height: number) =>
      many(geometry, material, TREES.length, (i) => {
        const t = TREES[i];
        spot.position.set(t.x, height * t.s, t.y);
        spot.scale.setScalar(t.s);
      });
    tree(new THREE.CylinderGeometry(3, 4, 14, 6), solid(0x6b4a2f), 7);
    tree(new THREE.ConeGeometry(19, 34, 7), solid(0x2a7a52), 29);
    tree(new THREE.ConeGeometry(14, 28, 7), solid(0x379465), 46);
  }

  private buildBase() {
    const r = HALL.r;
    const walls = part(new THREE.BoxGeometry(r * 2, HALL_H, r * 2), this.paint.wall);
    walls.position.set(HALL.x, HALL_H / 2, HALL.y);
    // A four-sided cone, turned an eighth, is a pyramid roof with a small overhang.
    const roof = part(new THREE.ConeGeometry(r * 1.6, ROOF_H, 4), solid(0x8a5a44));
    roof.rotation.y = Math.PI / 4;
    roof.position.set(HALL.x, HALL_H + ROOF_H / 2, HALL.y);
    const door = part(new THREE.BoxGeometry(16, 24, 2), solid(0x3a2a20), false);
    door.position.set(HALL.x, 12, HALL.y + r + 0.6);
    this.scene.add(walls, roof, door);
  }

  private buildKing() {
    const ivory = solid(IVORY);
    const body = part(new THREE.CapsuleGeometry(9.5, 11, 4, 12), ivory);
    body.position.y = 15;
    const head = part(new THREE.SphereGeometry(6.8, 12, 10), ivory);
    head.position.y = 35;
    const band = part(new THREE.CylinderGeometry(6, 5, 5, 8, 1, true), solid(GOLD, { side: THREE.DoubleSide, emissive: 0x7a5600, emissiveIntensity: 0.35 }));
    band.position.y = 42.5;
    this.kingRig.add(body, head, band);
    for (let i = 0; i < 4; i++) {
      const spike = part(new THREE.ConeGeometry(1.7, 4.5, 4), this.paint.gold);
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      spike.position.set(Math.cos(a) * 5.4, 47, Math.sin(a) * 5.4);
      this.kingRig.add(spike);
    }
    // Carried coins stack beside him.
    const disc = new THREE.CylinderGeometry(5.6, 5.6, 2.3, 12);
    for (let i = 0; i < 16; i++) {
      const c = part(disc, this.paint.gold);
      c.position.set(15, 2 + i * 2.8, 3);
      this.stack.push(c);
      this.kingRig.add(c);
    }
    const ring = laid(new THREE.Mesh(new THREE.RingGeometry(KING.r + 3, KING.r + 6, 32), flat(0x38bdf8)));
    ring.position.y = 1;
    const reach = laid(new THREE.Mesh(new THREE.RingGeometry(KING.range - 1.4, KING.range, 72), flat(IVORY, 0.16)));
    reach.position.y = 0.9;
    this.kingMarks.add(ring, reach);
    this.kingRoot.add(this.kingRig, this.kingMarks);
    this.scene.add(this.kingRoot);
  }

  private coinMesh() {
    const c = part(this.geo.coin, this.paint.gold);
    // Stand it on its edge, then spin it about the vertical.
    c.rotation.order = "YXZ";
    c.rotation.x = QUARTER;
    return c;
  }

  private padView(id: number, x: number, y: number): PadView {
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    const size = PAD_R * 2;
    const floor = laid(new THREE.Mesh(new THREE.PlaneGeometry(size, size), flat(0x0a2219, 0.4)));
    floor.position.y = 0.5;
    const fill = laid(new THREE.Mesh(new THREE.PlaneGeometry(size, size), flat(GOLD, 0.55)));
    // Four dashes along each side of the square.
    const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(9, 1.2, 2.6), flat(IVORY), 16);
    const spot = new THREE.Object3D();
    [-22.5, -7.5, 7.5, 22.5].forEach((along, i) => {
      [-1, 1].forEach((side, j) => {
        spot.rotation.y = 0;
        spot.position.set(along, 1, side * PAD_R);
        spot.updateMatrix();
        dashes.setMatrixAt(i * 4 + j * 2, spot.matrix);
        spot.rotation.y = QUARTER;
        spot.position.set(side * PAD_R, 1, along);
        spot.updateMatrix();
        dashes.setMatrixAt(i * 4 + j * 2 + 1, spot.matrix);
      });
    });
    group.add(floor, fill, dashes);
    this.scene.add(group);
    const view = { group, fill };
    this.pads.set(id, view);
    return view;
  }

  private towerView(x: number, y: number) {
    const group = new THREE.Group();
    group.position.set(x, 0, y);
    const shaft = part(this.geo.shaft, this.paint.stone);
    shaft.position.y = TOWER_H / 2;
    const deck = part(this.geo.deck, this.paint.deck);
    deck.position.y = TOWER_H + 4;
    const archer = part(this.geo.archer, this.paint.archer);
    archer.position.y = TOWER_H + 8 + 7.6;
    const reach = laid(new THREE.Mesh(this.geo.reach, this.paint.reach));
    reach.position.y = 0.8;
    group.add(shaft, deck, archer, reach);
    this.scene.add(group);
    this.towers.push(group);
    return group;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.gl.setPixelRatio(Math.min(dpr, 2));
    this.gl.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  project: Project = (x, y, z = 0) => {
    this.v.set(x, z, y).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * this.w, y: (-this.v.y * 0.5 + 0.5) * this.h };
  };

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const material of [m.material].flat()) material?.dispose();
    });
    for (const g of Object.values(this.geo)) g.dispose();
    for (const p of Object.values(this.paint)) p.dispose();
    this.gl.dispose();
  }

  draw(e: Engine, now: number) {
    const { fx, scene } = this;
    const k = e.king;
    const t = e.time;
    fx.sync(e);

    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const stepX = k.x - this.prev.x;
    const stepY = k.y - this.prev.y;
    const moved = this.settled ? Math.hypot(stepX, stepY) : 0;
    this.prev = { x: k.x, y: k.y };
    // A respawn is a jump, not a walk: ignore it.
    if (moved < 20) {
      this.walked += moved;
      const speed = dt > 0 ? 1 / (dt * KING.speed) : 0;
      this.lean.x += (clamp(stepX * speed, -1, 1) - this.lean.x) * 0.2;
      this.lean.y += (clamp(stepY * speed, -1, 1) - this.lean.y) * 0.2;
    }

    // The camera glides after the king. It sits far enough back to show the same
    // width of world as the flat board did: about one world unit per pixel.
    const ease = this.settled ? 1 - Math.exp(-dt * 8) : 1;
    this.settled = true;
    this.focus.x += (k.x - this.focus.x) * ease;
    this.focus.z += (k.y - this.focus.z) * ease;
    const across = clamp(this.w, 340, 560);
    const back = across / (2 * Math.tan((FOV * Math.PI) / 360) * this.camera.aspect);
    this.camera.position.set(this.focus.x, back * 0.8, this.focus.z + back * 0.6);
    this.camera.lookAt(this.focus.x, 0, this.focus.z - 40);
    this.camera.updateMatrixWorld();
    this.sun.position.set(this.focus.x - 300, 700, this.focus.z + 520);
    this.sun.target.position.copy(this.focus);

    const struck = e.hallUnderAttack && Math.floor(now / 120) % 2 === 0;
    this.paint.wall.emissive.setHex(struck ? 0xef4444 : 0x000000);

    // The king.
    this.kingRoot.position.set(k.x, 0, k.y);
    this.kingMarks.visible = !e.kingDown;
    if (e.kingDown) {
      this.kingRig.rotation.set(0, 0, QUARTER);
      this.kingRig.position.set(20, 8, 0);
    } else {
      this.kingRig.rotation.set(this.lean.y * 0.22, 0, -this.lean.x * 0.22);
      this.kingRig.position.set(0, Math.abs(Math.sin(this.walked * 0.09)) * 2.5, 0);
    }
    this.stack.forEach((c, i) => (c.visible = !e.kingDown && i < k.coins));

    // Guide trail.
    const g = e.guide;
    const far = g ? Math.hypot(g.x - k.x, g.y - k.y) : 0;
    const count = g ? Math.min(6, Math.floor((far - 34) / 20)) : 0;
    const heading = g ? Math.atan2(g.y - k.y, g.x - k.x) : 0;
    const march = ((now / 500) % 1) * 20;
    this.chevrons.forEach((c, i) => {
      c.visible = i < count;
      const along = 24 + i * 20 + march;
      c.position.set(k.x + Math.cos(heading) * along, 1.5, k.y + Math.sin(heading) * along);
      c.rotation.y = -heading;
    });

    // Build pads.
    for (const p of e.pads) {
      const view = this.pads.get(p.id) ?? this.padView(p.id, p.x, p.y);
      view.group.visible = p.open && !p.built;
      const share = p.paid / p.cost;
      view.fill.visible = share > 0;
      view.fill.scale.y = Math.max(0.001, share);
      // The fill grows from the edge nearest the camera.
      view.fill.position.set(0, 0.7, PAD_R * (1 - share));
    }

    // Towers rise out of the ground when built.
    while (this.towers.length > e.towers.length) scene.remove(this.towers.pop()!);
    e.towers.forEach((tw, i) => {
      const group = this.towers[i] ?? this.towerView(tw.x, tw.y);
      group.position.set(tw.x, 0, tw.y);
      group.scale.setScalar(Math.max(0.001, easeOutBack((t - fx.builtAt[i]) / RISE_TIME)));
    });

    // Enemies hop along, squash when hit and darken once wounded.
    const alive = new Set<number>();
    for (const en of e.enemies) {
      alive.add(en.id);
      let view = this.enemies.get(en.id);
      if (!view) {
        const group = new THREE.Group();
        const body = part(this.geo.body, this.paint.red);
        body.position.y = 11.5;
        const head = part(this.geo.head, this.paint.red);
        head.position.y = 27;
        group.add(body, head);
        scene.add(group);
        view = { group, body, head };
        this.enemies.set(en.id, view);
      }
      const hit = t - (fx.hitAt.get(en.id) ?? -1) < FLASH_TIME;
      const squash = hit ? 0.78 : 1;
      view.group.position.set(en.x, Math.abs(Math.sin(t * 9 + en.id * 1.7)) * 3, en.y);
      view.group.scale.set(1 / squash, squash, 1 / squash);
      view.body.material = view.head.material = hit ? this.paint.flash : en.hp < GRUNT.hp ? this.paint.hurt : this.paint.red;
    }
    for (const [id, view] of this.enemies) {
      if (alive.has(id)) continue;
      scene.remove(view.group);
      this.enemies.delete(id);
    }

    // Loose coins spin on their edge, and blink through their last three seconds.
    const loose = new Set<number>();
    for (const c of e.coins) {
      loose.add(c.id);
      let mesh = this.coins.get(c.id);
      if (!mesh) {
        mesh = this.coinMesh();
        scene.add(mesh);
        this.coins.set(c.id, mesh);
      }
      const age = t - c.bornAt;
      const left = COIN_LIFE - age;
      mesh.visible = !(left < 3 && Math.floor(left * 6) % 2 === 0);
      mesh.position.set(c.x, 6 + (age < 0.3 ? Math.sin((age / 0.3) * Math.PI) * 12 : 0), c.y);
      mesh.rotation.y = t * 4 + c.id;
    }
    for (const [id, mesh] of this.coins) {
      if (loose.has(id)) continue;
      scene.remove(mesh);
      this.coins.delete(id);
    }

    this.shots.forEach((m, i) => {
      const s = e.shots[i];
      m.visible = !!s;
      if (!s) return;
      const from = shotFrom(e, s);
      m.position.set((s.x1 + s.x2) / 2, (from + 12) / 2, (s.y1 + s.y2) / 2);
      m.lookAt(s.x2, 12, s.y2);
      m.scale.set(2.4, 2.4, Math.hypot(s.x2 - s.x1, from - 12, s.y2 - s.y1));
    });
    this.puffs.forEach((m, i) => {
      const p = fx.puffs[i];
      m.visible = !!p;
      if (!p) return;
      const q = (t - p.at) / PUFF_TIME;
      m.position.set(p.x, 12 + q * 10, p.y);
      m.scale.setScalar(1 + q * 2.4);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - q);
    });
    this.flights.forEach((m, i) => {
      const f = fx.flights[i];
      m.visible = !!f;
      if (!f) return;
      const q = (t - f.at) / FLIGHT_TIME;
      const to = f.to === "king" ? k : f.to;
      const lift = f.to === "king" ? 20 * q : 0;
      m.position.set(f.from.x + (to.x - f.from.x) * q, 6 + lift + Math.sin(q * Math.PI) * 28, f.from.y + (to.y - f.from.y) * q);
      m.rotation.y = t * 14;
    });

    this.gl.render(scene, this.camera);
  }
}
