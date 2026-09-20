import { buildPieces } from "./jigsaw.js";
import { playSnap } from "../audio.js";
import { dollarsForPieces } from "../ui.js";

const MIN_SCALE = 0.18;
const MAX_SCALE = 5.5;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function neighbors(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

export class PuzzleEngine {
  constructor(canvas, puzzle, image, { onChange, onComplete }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.hitCtx = document.createElement("canvas").getContext("2d");
    this.puzzle = puzzle;
    this.image = image;
    this.onChange = onChange;
    this.onComplete = onComplete;

    const built = buildPieces(image, puzzle.rows, puzzle.cols, puzzle.seed);
    this.pieces = built.pieces;
    this.pieceById = new Map(built.pieces.map((p) => [p.id, p]));
    this.cellW = built.cellW;
    this.cellH = built.cellH;
    this.boardW = built.boardW;
    this.boardH = built.boardH;
    this.snapDist = Math.min(built.cellW, built.cellH) * 0.2;

    this.hint = false;
    this.completed = !!puzzle.completed;
    this.view = puzzle.viewport
      ? { ...puzzle.viewport }
      : { x: 0, y: 0, scale: 1 };
    this.groups = this.restoreGroups(puzzle.groups);
    this.dollars =
      typeof puzzle.dollars === "number" ? puzzle.dollars : dollarsForPieces(this.pieces.length);
    this.dollarTickAt = performance.now();
    this.dirty = true;
    this.raf = 0;
    this.sparks = [];
    this.rings = [];
    this.confetti = [];
    this.floaters = [];
    this.pointers = new Map();
    this.drag = null;
    this.panning = false;
    this.pinch = null;
    this.saveTimer = 0;

    this.boundDown = (e) => this.onDown(e);
    this.boundMove = (e) => this.onMove(e);
    this.boundUp = (e) => this.onUp(e);
    this.boundWheel = (e) => this.onWheel(e);
    this.boundResize = () => this.resize();

    canvas.addEventListener("pointerdown", this.boundDown);
    canvas.addEventListener("pointermove", this.boundMove);
    canvas.addEventListener("pointerup", this.boundUp);
    canvas.addEventListener("pointercancel", this.boundUp);
    canvas.addEventListener("wheel", this.boundWheel, { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("resize", this.boundResize);

    this.resize();
    if (!puzzle.groups || puzzle.groups.length === 0) {
      this.scatter();
      this.fitAll();
      this.emit(true);
    } else if (!puzzle.viewport) {
      this.fitAll();
    }

    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.tickDollars(now);
      const animating =
        this.sparks.length > 0 ||
        this.rings.length > 0 ||
        this.confetti.length > 0 ||
        this.floaters.length > 0;
      if (this.dirty || animating) {
        this.draw(now);
        this.dirty = animating;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  restoreGroups(saved) {
    const n = this.puzzle.rows * this.puzzle.cols;
    if (!saved || saved.length === 0) {
      return Array.from({ length: n }, (_, id) => ({
        pieceIds: [id],
        originX: 0,
        originY: 0,
      }));
    }
    return saved.map((g) => ({
      pieceIds: [...g.pieceIds],
      originX: g.x,
      originY: g.y,
    }));
  }

  scatter() {
    const rand = () => Math.random();
    this.groups = this.pieces.map((piece) => {
      const side = rand();
      let px;
      let py;
      if (side < 0.34) {
        px = -this.cellW * (0.4 + rand() * 1.6);
        py = rand() * this.boardH * 1.15 - this.cellH * 0.2;
      } else if (side < 0.68) {
        px = this.boardW + this.cellW * (0.2 + rand() * 1.4);
        py = rand() * this.boardH * 1.15 - this.cellH * 0.2;
      } else {
        px = rand() * this.boardW - this.cellW * 0.2;
        py = this.boardH + this.cellH * (0.3 + rand() * 1.5);
      }
      return {
        pieceIds: [piece.id],
        originX: px - piece.col * this.cellW,
        originY: py - piece.row * this.cellH,
      };
    });
  }

  bounds() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const group of this.groups) {
      for (const id of group.pieceIds) {
        const p = this.pieceById.get(id);
        const x = group.originX + p.col * this.cellW - p.pad;
        const y = group.originY + p.row * this.cellH - p.pad;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + p.bitmap.width);
        maxY = Math.max(maxY, y + p.bitmap.height);
      }
    }
    minX = Math.min(minX, -40);
    minY = Math.min(minY, -40);
    maxX = Math.max(maxX, this.boardW + 40);
    maxY = Math.max(maxY, this.boardH + 40);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  fitAll() {
    const b = this.bounds();
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const pad = 28;
    const scale = clamp(Math.min((w - pad * 2) / b.w, (h - pad * 2) / b.h) * 0.96, MIN_SCALE, 1.4);
    this.view.scale = scale;
    this.view.x = (w - b.w * scale) / 2 - b.x * scale;
    this.view.y = (h - b.h * scale) / 2 - b.y * scale;
    this.dirty = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dirty = true;
  }

  screenToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return {
      x: (sx - this.view.x) / this.view.scale,
      y: (sy - this.view.y) / this.view.scale,
      sx,
      sy,
    };
  }

  piecePos(group, piece) {
    return {
      x: group.originX + piece.col * this.cellW,
      y: group.originY + piece.row * this.cellH,
    };
  }

  hitTest(wx, wy) {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const group = this.groups[i];
      for (const id of group.pieceIds) {
        const piece = this.pieceById.get(id);
        const pos = this.piecePos(group, piece);
        const lx = wx - pos.x;
        const ly = wy - pos.y;
        if (this.hitCtx.isPointInPath(piece.path, lx, ly)) {
          return { group, index: i, piece };
        }
      }
    }
    return null;
  }

  bringToFront(group) {
    const i = this.groups.indexOf(group);
    if (i >= 0 && i !== this.groups.length - 1) {
      this.groups.splice(i, 1);
      this.groups.push(group);
    }
  }

  findNeighborPair(a, b) {
    for (const idA of a.pieceIds) {
      const pa = this.pieceById.get(idA);
      for (const idB of b.pieceIds) {
        const pb = this.pieceById.get(idB);
        if (neighbors(pa, pb)) return [pa, pb];
      }
    }
    return null;
  }

  groupsNeighbor(a, b) {
    return !!this.findNeighborPair(a, b);
  }

  isLoneCorner(group) {
    if (group.pieceIds.length !== 1) return false;
    const piece = this.pieceById.get(group.pieceIds[0]);
    const lastRow = this.puzzle.rows - 1;
    const lastCol = this.puzzle.cols - 1;
    return (piece.row === 0 || piece.row === lastRow) && (piece.col === 0 || piece.col === lastCol);
  }

  trySnap(group) {
    let changed = false;
    let guard = 0;
    while (guard++ < 80) {
      let merged = false;
      for (const other of this.groups) {
        if (other === group) continue;
        const pair = this.findNeighborPair(group, other);
        if (!pair) continue;
        if (dist(group.originX, group.originY, other.originX, other.originY) > this.snapDist) {
          continue;
        }
        const [pa, pb] = pair;
        const posA = this.piecePos(other, pa);
        const posB = this.piecePos(other, pb);
        const contactX = (posA.x + posB.x) / 2 + this.cellW / 2;
        const contactY = (posA.y + posB.y) / 2 + this.cellH / 2;
        group.originX = other.originX;
        group.originY = other.originY;
        group.pieceIds.push(...other.pieceIds);
        this.groups = this.groups.filter((g) => g !== other);
        merged = true;
        changed = true;
        this.dollars += 5;
        this.spawnBurst(contactX, contactY);
        playSnap();
        break;
      }
      if (this.isLoneCorner(group)) {
        const toBoard = dist(group.originX, group.originY, 0, 0);
        if (toBoard > 0.01 && toBoard <= this.snapDist) {
          group.originX = 0;
          group.originY = 0;
          changed = true;
          continue;
        }
      }
      if (!merged) break;
    }
    if (changed) {
      try {
        navigator.vibrate?.(14);
      } catch {
        /* ignore */
      }
      this.checkComplete();
      if (!this.completed) this.emit(true);
    }
    return changed;
  }

  checkComplete() {
    const n = this.pieces.length;
    if (this.groups.length === 1 && this.groups[0].pieceIds.length === n) {
      this.groups[0].originX = 0;
      this.groups[0].originY = 0;
      if (!this.completed) {
        this.completed = true;
        this.drag = null;
        this.panning = false;
        this.emit(true);
        this.onComplete?.();
      }
    }
  }

  progress() {
    const n = this.pieces.length;
    if (this.completed) return 100;
    if (n <= 1) return 100;
    return Math.round(((n - this.groups.length) / (n - 1)) * 100);
  }

  snapshot() {
    return {
      groups: this.groups.map((g) => ({
        pieceIds: [...g.pieceIds],
        x: g.originX,
        y: g.originY,
      })),
      viewport: { ...this.view },
      completed: this.completed,
      dollars: this.dollars,
    };
  }

  emit(immediate = false) {
    const send = () => {
      this.saveTimer = 0;
      this.onChange?.(this.snapshot());
    };
    if (immediate) {
      clearTimeout(this.saveTimer);
      send();
      return;
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(send, 300);
  }

  setHint(on) {
    this.hint = on;
    this.dirty = true;
  }

  // Бюджет $ тикает вниз раз в секунду, но только пока пазл не собран и
  // экран реально открыт и виден (иначе — просто сбрасываем якорь времени,
  // чтобы не "нагонять" секунды за время, когда вкладка была свёрнута).
  tickDollars(now) {
    if (this.completed || document.visibilityState !== "visible") {
      this.dollarTickAt = now;
      return;
    }
    let ticked = false;
    while (now - this.dollarTickAt >= 1000) {
      this.dollarTickAt += 1000;
      if (this.dollars > 0) {
        this.dollars = Math.max(0, this.dollars - 1);
        ticked = true;
      }
    }
    if (ticked) this.emit();
  }

  spawnBurst(x, y) {
    const now = performance.now();
    const colors = ["#ff7a59", "#ffd56b", "#7ee0c6", "#ff5fa2", "#ffffff"];
    const cellMin = Math.min(this.cellW, this.cellH);
    const travel = Math.max(14, cellMin * 0.32);
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const d = travel * (0.55 + Math.random() * 0.6);
      this.sparks.push({
        x,
        y,
        dx: Math.cos(angle) * d,
        dy: Math.sin(angle) * d,
        start: now,
        life: 460 + Math.random() * 240,
        size: Math.max(1.6, cellMin * 0.05) * (0.7 + Math.random() * 0.6),
        color: colors[i % colors.length],
      });
    }
    this.rings.push({ x, y, start: now, life: 400, maxR: travel * 0.95 });
    this.floaters.push({ x, y, text: "+5 $", start: now, life: 900 });
    this.dirty = true;
  }

  // Полноэкранный залп конфетти в экранных координатах (не зависит от
  // текущего zoom/pan сцены). Вызывается снаружи (play.js) в момент, когда
  // нужно показать финальное празднование.
  celebrate() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const colors = ["#ff7a59", "#ffd56b", "#7ee0c6", "#ff5fa2", "#7aa7ff", "#ffffff"];
    const now = performance.now();
    const count = 90;
    for (let i = 0; i < count; i++) {
      const size = 5 + Math.random() * 5;
      this.confetti.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.4,
        vx: (Math.random() - 0.5) * 0.09,
        vy: 0.15 + Math.random() * 0.14,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.01,
        sway: Math.random() * Math.PI * 2,
        size,
        color: colors[i % colors.length],
        shape: Math.random() < 0.5 ? "rect" : "circle",
        start: now,
        life: 2400 + Math.random() * 1400,
      });
    }
    this.dirty = true;
  }

  drawFx(ctx, now) {
    if (this.rings.length) {
      this.rings = this.rings.filter((r) => now - r.start < r.life);
      for (const r of this.rings) {
        const t = (now - r.start) / r.life;
        const radius = r.maxR * (0.25 + t * 0.85);
        ctx.save();
        ctx.globalAlpha = Math.max(0, (1 - t) * 0.55);
        ctx.strokeStyle = "#fff8ec";
        ctx.lineWidth = Math.max(1, radius * 0.12);
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.sparks.length) {
      const rise = Math.min(this.cellW, this.cellH) * 0.06;
      this.sparks = this.sparks.filter((s) => now - s.start < s.life);
      for (const s of this.sparks) {
        const t = (now - s.start) / s.life;
        const ease = 1 - (1 - t) * (1 - t) * (1 - t);
        const x = s.x + s.dx * ease;
        const y = s.y + s.dy * ease - rise * t;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.4, s.size * (1 - t * 0.35)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (this.floaters.length) {
      const rise = Math.min(this.cellW, this.cellH) * 0.9;
      const fontSize = Math.max(11, this.cellH * 0.24);
      this.floaters = this.floaters.filter((f) => now - f.start < f.life);
      for (const f of this.floaters) {
        const t = (now - f.start) / f.life;
        const ease = 1 - (1 - t) * (1 - t);
        const y = f.y - rise * ease;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t * t);
        ctx.font = `800 ${fontSize}px ui-rounded, "Trebuchet MS", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, fontSize * 0.16);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = "#2f9e5b";
        ctx.fillText(f.text, f.x, y);
        ctx.restore();
      }
    }
  }

  // Рисуется в экранных координатах (после ctx.restore() трансформации
  // сцены), поэтому конфетти всегда покрывает весь видимый экран.
  drawConfetti(ctx, now) {
    if (!this.confetti.length) return;
    const h = this.canvas.clientHeight || 1;
    this.confetti = this.confetti.filter((c) => now - c.start < c.life && c.y < h + 40);
    for (const c of this.confetti) {
      const elapsed = now - c.start;
      const t = elapsed / 1000;
      const x = c.x + c.vx * elapsed + Math.sin(c.sway + t * 3) * 10;
      const y = c.y + c.vy * elapsed;
      const rot = c.rot + c.vr * elapsed;
      const fadeStart = c.life - 400;
      const alpha = elapsed > fadeStart ? Math.max(0, (c.life - elapsed) / 400) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.fillStyle = c.color;
      if (c.shape === "rect") {
        ctx.fillRect(-c.size / 2, -c.size * 0.35, c.size, c.size * 0.7);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, c.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  onDown(e) {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: w.sx, sy: w.sy });

    if (this.pointers.size === 2) {
      this.drag = null;
      this.panning = false;
      this.startPinch();
      return;
    }

    if (this.completed) {
      this.panning = true;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
      return;
    }

    const hit = this.hitTest(w.x, w.y);
    if (hit) {
      this.bringToFront(hit.group);
      this.panning = false;
      this.drag = {
        pointerId: e.pointerId,
        group: hit.group,
        lastX: w.x,
        lastY: w.y,
      };
      this.dirty = true;
    } else {
      this.panning = true;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
    }
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const w = this.screenToWorld(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: w.sx, sy: w.sy });

    if (this.pointers.size >= 2 && this.pinch) {
      this.updatePinch();
      return;
    }

    if (this.drag && e.pointerId === this.drag.pointerId) {
      const dx = w.x - this.drag.lastX;
      const dy = w.y - this.drag.lastY;
      this.drag.group.originX += dx;
      this.drag.group.originY += dy;
      this.drag.lastX = w.x;
      this.drag.lastY = w.y;
      this.dirty = true;
      return;
    }

    if (this.panning && this.pointers.size === 1) {
      this.view.x += e.clientX - this._lastPanX;
      this.view.y += e.clientY - this._lastPanY;
      this._lastPanX = e.clientX;
      this._lastPanY = e.clientY;
      this.dirty = true;
    }
  }

  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      if (this.drag) this.trySnap(this.drag.group);
      this.drag = null;
      this.panning = false;
      this._lastPanX = null;
      this._lastPanY = null;
      this.emit();
    } else if (this.pointers.size === 1) {
      const left = [...this.pointers.values()][0];
      this.panning = true;
      this._lastPanX = left.x;
      this._lastPanY = left.y;
    }
    this.dirty = true;
  }

  startPinch() {
    const pts = [...this.pointers.values()];
    const d = dist(pts[0].sx, pts[0].sy, pts[1].sx, pts[1].sy);
    const cx = (pts[0].sx + pts[1].sx) / 2;
    const cy = (pts[0].sy + pts[1].sy) / 2;
    this.pinch = {
      dist: d || 1,
      wx: (cx - this.view.x) / this.view.scale,
      wy: (cy - this.view.y) / this.view.scale,
    };
  }

  updatePinch() {
    const pts = [...this.pointers.values()];
    if (pts.length < 2 || !this.pinch) return;
    const d = dist(pts[0].sx, pts[0].sy, pts[1].sx, pts[1].sy) || 1;
    const cx = (pts[0].sx + pts[1].sx) / 2;
    const cy = (pts[0].sy + pts[1].sy) / 2;
    const scale = clamp(this.view.scale * (d / this.pinch.dist), MIN_SCALE, MAX_SCALE);
    this.view.scale = scale;
    this.view.x = cx - this.pinch.wx * scale;
    this.view.y = cy - this.pinch.wy * scale;
    this.pinch.dist = d;
    this.pinch.wx = (cx - this.view.x) / this.view.scale;
    this.pinch.wy = (cy - this.view.y) / this.view.scale;
    this.dirty = true;
  }

  onWheel(e) {
    e.preventDefault();
    const w = this.screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.09 : 0.91;
    const scale = clamp(this.view.scale * factor, MIN_SCALE, MAX_SCALE);
    this.view.scale = scale;
    this.view.x = w.sx - w.x * scale;
    this.view.y = w.sy - w.y * scale;
    this.dirty = true;
    this.emit();
  }

  draw(now = performance.now()) {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(this.view.scale, this.view.scale);

    this.drawBoard(ctx);

    for (const group of this.groups) {
      const dragging = this.drag && this.drag.group === group;
      for (const id of group.pieceIds) {
        const piece = this.pieceById.get(id);
        const pos = this.piecePos(group, piece);
        if (dragging) {
          ctx.save();
          ctx.shadowColor = "rgba(58,42,36,0.32)";
          ctx.shadowBlur = 16 / this.view.scale;
          ctx.shadowOffsetY = 6 / this.view.scale;
          ctx.drawImage(piece.bitmap, pos.x - piece.pad, pos.y - piece.pad);
          ctx.restore();
        } else {
          ctx.drawImage(piece.bitmap, pos.x - piece.pad, pos.y - piece.pad);
        }
      }
    }

    this.drawFx(ctx, now);
    ctx.restore();

    this.drawConfetti(ctx, now);
  }

  drawBoard(ctx) {
    const r = Math.min(this.cellW, this.cellH) * 0.08;
    ctx.save();
    ctx.fillStyle = "rgba(255, 247, 238, 0.92)";
    ctx.strokeStyle = "rgba(255, 122, 89, 0.55)";
    ctx.lineWidth = Math.max(4, Math.min(this.cellW, this.cellH) * 0.045);
    roundRect(ctx, 0, 0, this.boardW, this.boardH, r);
    ctx.fill();
    ctx.stroke();
    if (this.hint) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(this.image, 0, 0, this.boardW, this.boardH);
      ctx.restore();
    }
    ctx.restore();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.saveTimer);
    this.canvas.removeEventListener("pointerdown", this.boundDown);
    this.canvas.removeEventListener("pointermove", this.boundMove);
    this.canvas.removeEventListener("pointerup", this.boundUp);
    this.canvas.removeEventListener("pointercancel", this.boundUp);
    this.canvas.removeEventListener("wheel", this.boundWheel);
    window.removeEventListener("resize", this.boundResize);
    this.emit(true);
    if (this.image && this.image.close) this.image.close();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
