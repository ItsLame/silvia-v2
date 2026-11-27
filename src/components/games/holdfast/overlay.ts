import { type Engine, HALL } from "./engine";
import { HALL_H, type Project, ROOF_H } from "./scene";

// Everything drawn in board pixels on top of the 3D world: labels pinned to world
// points, the hall alarm, notices and the touch joystick.

/** A drag on the board: where it started and where the finger is now, in board pixels. */
export type Stick = { id: number; ox: number; oy: number; x: number; y: number };
export type Notice = { text: string; at: number };

export const STICK_R = 44;
const NOTICE_MS = 1800;
const IVORY = "245,239,225";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  e: Engine,
  w: number,
  h: number,
  now: number,
  project: Project,
  stick: Stick | null,
  notice: Notice | null,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // Text sits over a busy world, so every label gets a dark outline.
  const label = (text: string, x: number, y: number, font: string, fill: string) => {
    ctx.font = font;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(10,34,25,.85)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };

  // Build pads: what is still owed. The king would cover it while he pays, so it lifts.
  for (const p of e.pads) {
    if (!p.open || p.built) continue;
    const paying = e.activePad === p;
    const at = project(p.x, p.y, paying ? 62 : 0);
    label(String(p.cost - p.paid), at.x, at.y - (paying ? 0 : 3), `600 18px ${MONO}`, `rgb(${IVORY})`);
    if (!paying) label(p.label.toUpperCase(), at.x, at.y + 12, `9px ${MONO}`, `rgba(${IVORY},.8)`);
  }

  // The hall's health, above its roof.
  const roof = project(HALL.x, HALL.y, HALL_H + ROOF_H + 14);
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(roof.x - 33, roof.y - 4, 66, 7);
  ctx.fillStyle = e.hallHp <= HALL.maxHp / 4 ? "#ef4444" : "#86efac";
  ctx.fillRect(roof.x - 32, roof.y - 3, 64 * (e.hallHp / HALL.maxHp), 5);

  if (e.kingDown) {
    const at = project(e.king.x, e.king.y, 34);
    label(String(Math.ceil(e.king.downFor)), at.x, at.y, `600 16px ${MONO}`, `rgb(${IVORY})`);
  }

  // The hall is being hit off-screen: point back to it from the edge.
  const hall = project(HALL.x, HALL.y, HALL_H / 2);
  if (e.hallUnderAttack && (hall.x < 0 || hall.x > w || hall.y < 0 || hall.y > h)) {
    const x = Math.min(w - 22, Math.max(22, hall.x));
    const y = Math.min(h - 22, Math.max(22, hall.y));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(hall.y - y, hall.x - x));
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 90);
    ctx.fillStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -10);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (notice && now - notice.at < NOTICE_MS) {
    ctx.globalAlpha = Math.min(1, (NOTICE_MS - (now - notice.at)) / 400);
    ctx.font = `600 13px ${MONO}`;
    const width = ctx.measureText(notice.text).width + 24;
    ctx.fillStyle = "rgba(10,34,25,.8)";
    ctx.beginPath();
    ctx.roundRect(w / 2 - width / 2, 14, width, 26, 13);
    ctx.fill();
    ctx.fillStyle = "#facc15";
    ctx.fillText(notice.text, w / 2, 27.5);
    ctx.globalAlpha = 1;
  }

  if (stick) {
    const dx = stick.x - stick.ox;
    const dy = stick.y - stick.oy;
    const len = Math.max(1, Math.hypot(dx, dy) / STICK_R);
    ctx.beginPath();
    ctx.arc(stick.ox, stick.oy, STICK_R, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${IVORY},.1)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${IVORY},.35)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.ox + dx / len, stick.oy + dy / len, 18, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${IVORY},.7)`;
    ctx.fill();
  }
}
