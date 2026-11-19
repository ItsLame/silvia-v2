import { Box, Circle, Edge, RevoluteJoint, Vec2, World, type Body, type Fixture } from "planck";

// Units are metres, kilograms and seconds. The runner faces +x; the track starts at x = 0.

export const TRACK_LENGTH = 100;
export const STEP = 1 / 60;

// Body dimensions.
const FOOT = { hw: 0.15, hh: 0.04, ankleX: -0.06 }; // ankle sits over the back half of the foot
const CALF = { len: 0.48, hw: 0.05 };
const THIGH = { len: 0.5, hw: 0.065 };
const TORSO = { hw: 0.25, hh: 0.36, hipY: -0.3 }; // the card; hips sit just inside its bottom edge
const HEAD_R = 0.17;
const ARM = { len: 0.55, hw: 0.04, shoulderY: 0.28 };

// Joint limits, in radians. Hip: + swings the leg forward. Knee: − folds the calf back.
const HIP_LIMIT = [-0.7, 1.5] as const;
const KNEE_LIMIT = [-2.3, 0] as const;
const ANKLE_LIMIT = [-0.5, 0.6] as const;

// Motors. While a key is held a joint is driven at SPEED with the active torque;
// otherwise it is held still with a weaker one, so the runner stays stiff but floppy.
// Tuned headlessly: standing still holds, mashing falls over, and a steady rhythm
// covers roughly a metre a second.
export const TUNING = {
  hipSpeed: 3.2,
  kneeSpeed: 3.8,
  hip: { drive: 10, hold: 3.5 },
  knee: { drive: 7, hold: 2.5 },
  ankle: 2.5,
};

export type Controls = {
  /** Left thigh forward, right thigh back. */
  thighsA: boolean;
  /** Right thigh forward, left thigh back. */
  thighsB: boolean;
  /** Left knee folds, right knee straightens. */
  calvesA: boolean;
  /** Right knee folds, left knee straightens. */
  calvesB: boolean;
};

export const NO_CONTROLS: Controls = { thighsA: false, thighsB: false, calvesA: false, calvesB: false };

type Leg = { thigh: Body; calf: Body; foot: Body; hip: RevoluteJoint; knee: RevoluteJoint; ankle: RevoluteJoint };

export type Part = { body: Body; kind: "torso" | "thigh" | "calf" | "foot" | "arm"; side: "near" | "far" | "mid" };

export type Runner = {
  world: World;
  torso: Body;
  parts: Part[];
  near: Leg;
  far: Leg;
  /** Set once the head or the card hits the ground. */
  fallen: boolean;
  /** Seconds simulated so far. */
  time: number;
};

const rot = (a: number, x: number, y: number) =>
  Vec2(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));

const add = (a: Vec2, b: Vec2) => Vec2(a.x + b.x, a.y + b.y);

// Every part of the runner shares a negative group so its limbs pass through each other.
const BODY_GROUP = -1;

function dynamic(world: World, pos: Vec2, angle: number, damping = 0.4) {
  return world.createBody({ type: "dynamic", position: pos, angle, angularDamping: damping, linearDamping: 0.05 });
}

/** A limited, motorised hinge whose angle reads 0 when both bodies are straight. */
function hinge(
  world: World,
  bodyA: Body,
  bodyB: Body,
  anchor: Vec2,
  opt: { lowerAngle: number; upperAngle: number; maxMotorTorque: number },
) {
  return world.createJoint(
    new RevoluteJoint({
      bodyA,
      bodyB,
      localAnchorA: bodyA.getLocalPoint(anchor),
      localAnchorB: bodyB.getLocalPoint(anchor),
      referenceAngle: 0,
      enableLimit: true,
      enableMotor: true,
      motorSpeed: 0,
      ...opt,
    }),
  )!;
}

/**
 * Builds the runner mid-stride: near leg slightly forward, far leg slightly back.
 * Joint reference angles are fixed at zero, so 0 always means "straight".
 */
export function createRunner(): Runner {
  const world = new World({ gravity: Vec2(0, -10) });

  const ground = world.createBody({ type: "static" });
  ground.createFixture(new Edge(Vec2(-20, 0), Vec2(TRACK_LENGTH + 40, 0)), { friction: 1 });

  // Pose: [hip, knee, ankle] per leg, torso leaning a touch forward.
  const torsoAngle = -0.04;
  const poses = { near: [0.28, -0.12, -0.16], far: [-0.22, -0.18, 0.4] } as const;

  // Lay out the leg from the hip down to find where the feet land, then lift the body
  // so the lowest foot rests on the ground.
  const torsoCenter0 = Vec2(0, 0);
  const hip0 = add(torsoCenter0, rot(torsoAngle, 0, TORSO.hipY));
  const layout = (pose: readonly number[]) => {
    const thighA = torsoAngle + pose[0];
    const knee = add(hip0, rot(thighA, 0, -THIGH.len));
    const calfA = thighA + pose[1];
    const ankle = add(knee, rot(calfA, 0, -CALF.len));
    const footA = calfA + pose[2];
    const footC = add(ankle, rot(footA, -FOOT.ankleX, -FOOT.hh));
    const low = Math.min(...[-FOOT.hw, FOOT.hw].map((x) => add(footC, rot(footA, x, -FOOT.hh)).y));
    return { thighA, knee, calfA, ankle, footA, footC, low };
  };
  const nearL = layout(poses.near);
  const farL = layout(poses.far);
  const lift = Vec2(0, -Math.min(nearL.low, farL.low) + 0.002);

  const torsoCenter = add(torsoCenter0, lift);
  const torso = dynamic(world, torsoCenter, torsoAngle, 1.2);
  torso.createFixture(new Box(TORSO.hw, TORSO.hh), { density: 1.4, friction: 0.6, filterGroupIndex: BODY_GROUP });
  torso.createFixture(new Circle(Vec2(0, TORSO.hh + HEAD_R * 0.85), HEAD_R), {
    density: 1,
    friction: 0.6,
    filterGroupIndex: BODY_GROUP,
  });

  const parts: Part[] = [];

  const makeLeg = (side: "near" | "far", l: ReturnType<typeof layout>): Leg => {
    const hip = add(hip0, lift);
    const knee = add(l.knee, lift);
    const ankle = add(l.ankle, lift);

    const thigh = dynamic(world, add(hip, rot(l.thighA, 0, -THIGH.len / 2)), l.thighA);
    thigh.createFixture(new Box(THIGH.hw, THIGH.len / 2), { density: 1, friction: 0.6, filterGroupIndex: BODY_GROUP });

    const calf = dynamic(world, add(knee, rot(l.calfA, 0, -CALF.len / 2)), l.calfA);
    calf.createFixture(new Box(CALF.hw, CALF.len / 2), { density: 1, friction: 0.6, filterGroupIndex: BODY_GROUP });

    const foot = dynamic(world, add(l.footC, lift), l.footA);
    foot.createFixture(new Box(FOOT.hw, FOOT.hh), { density: 1.5, friction: 1.6, filterGroupIndex: BODY_GROUP });

    const joint = (
      a: Body,
      b: Body,
      anchor: Vec2,
      [lowerAngle, upperAngle]: readonly [number, number],
      maxMotorTorque: number,
    ) => hinge(world, a, b, anchor, { lowerAngle, upperAngle, maxMotorTorque });

    parts.push({ body: thigh, kind: "thigh", side }, { body: calf, kind: "calf", side }, { body: foot, kind: "foot", side });

    return {
      thigh,
      calf,
      foot,
      hip: joint(torso, thigh, hip, HIP_LIMIT, TUNING.hip.hold),
      knee: joint(thigh, calf, knee, KNEE_LIMIT, TUNING.knee.hold),
      ankle: joint(calf, foot, ankle, ANKLE_LIMIT, TUNING.ankle),
    };
  };

  const far = makeLeg("far", farL);

  // Floppy arms, unpowered apart from a little friction in the shoulder.
  const makeArm = (side: "near" | "far", swing: number) => {
    const shoulder = add(torsoCenter, rot(torsoAngle, 0, ARM.shoulderY));
    const a = torsoAngle + swing;
    const arm = dynamic(world, add(shoulder, rot(a, 0, -ARM.len / 2)), a, 0.8);
    arm.createFixture(new Box(ARM.hw, ARM.len / 2), { density: 0.6, friction: 0.6, filterGroupIndex: BODY_GROUP });
    hinge(world, torso, arm, shoulder, { lowerAngle: -2.6, upperAngle: 2.6, maxMotorTorque: 0.6 });
    parts.push({ body: arm, kind: "arm", side });
  };

  makeArm("far", 0.35);
  parts.push({ body: torso, kind: "torso", side: "mid" });
  const near = makeLeg("near", nearL);
  makeArm("near", -0.3);

  const runner: Runner = { world, torso, parts, near, far, fallen: false, time: 0 };

  // The run is over once the head or card touches the track.
  const isTorso = (f: Fixture) => f.getBody() === torso;
  const isGround = (f: Fixture) => f.getBody() === ground;
  world.on("begin-contact", (contact) => {
    const a = contact.getFixtureA();
    const b = contact.getFixtureB();
    if ((isTorso(a) && isGround(b)) || (isTorso(b) && isGround(a))) runner.fallen = true;
  });

  return runner;
}

function drive(joint: RevoluteJoint, dir: number, speed: number, torque: { drive: number; hold: number }) {
  joint.setMotorSpeed(dir * speed);
  joint.setMaxMotorTorque(dir === 0 ? torque.hold : torque.drive);
}

/** Advances the simulation by one fixed step. */
export function step(r: Runner, c: Controls) {
  const thighs = (c.thighsA ? 1 : 0) - (c.thighsB ? 1 : 0);
  const calves = (c.calvesA ? 1 : 0) - (c.calvesB ? 1 : 0);

  drive(r.near.hip, thighs, TUNING.hipSpeed, TUNING.hip);
  drive(r.far.hip, -thighs, TUNING.hipSpeed, TUNING.hip);
  drive(r.near.knee, -calves, TUNING.kneeSpeed, TUNING.knee);
  drive(r.far.knee, calves, TUNING.kneeSpeed, TUNING.knee);

  r.world.step(STEP, 8, 3);
  r.time += STEP;
}

/** How far the runner has got, measured at the card's centre. */
export const distance = (r: Runner) => r.torso.getPosition().x;

export const SHAPES = { FOOT, CALF, THIGH, TORSO, HEAD_R, ARM };
