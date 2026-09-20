function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateEdges(rows, cols, seed) {
  const rand = mulberry32(seed);
  const vTab = [];
  const vShape = [];
  for (let r = 0; r < rows; r++) {
    vTab[r] = [];
    vShape[r] = [];
    for (let c = 0; c < cols - 1; c++) {
      vTab[r][c] = rand() < 0.5 ? 1 : -1;
      vShape[r][c] = rand();
    }
  }
  const hTab = [];
  const hShape = [];
  for (let r = 0; r < rows - 1; r++) {
    hTab[r] = [];
    hShape[r] = [];
    for (let c = 0; c < cols; c++) {
      hTab[r][c] = rand() < 0.5 ? 1 : -1;
      hShape[r][c] = rand();
    }
  }
  return { vTab, vShape, hTab, hShape };
}

// Стили из магазина принудительно задают форму выступа на всех рёбрах
// пазла (см. PIECE_STYLE_KIND). Без стиля ("mix", бесплатный дефолт) форма
// каждого ребра выбирается случайно из bucket ниже.
const PIECE_STYLE_KIND = { triangle: 0, hexagon: 3 };

function appendEdge(path, x1, y1, x2, y2, tab, tabSize, shape, forcedKind) {
  if (tab === 0) {
    path.lineTo(x2, y2);
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const tx = dx / len;
  const ty = dy / len;
  const nx = ty * tab;
  const ny = -tx * tab;
  // Всегда ровно посередине ребра: два соседних кусочка меряют "along" от
  // разных концов одного и того же отрезка, поэтому любое смещение середины
  // (jitter) физически расходится между выступом и выемкой. Раньше это
  // приводило к несовпадению вырезов на стыке.
  const mid = len * 0.5;

  const p = (along, bulge) => [
    x1 + tx * along + nx * bulge,
    y1 + ty * along + ny * bulge,
  ];

  // Один и тот же shape даёт один и тот же вид выступа у обоих соседних
  // кусочков (они читают одно и то же значение ребра), поэтому форма
  // выступа и выемки на стыке совпадают. Явно разных силуэта — острый
  // треугольник, гранёный "квадрат", скруглённый и шестиугольный — читаются
  // легко и не спорят с минимализмом стиля.
  let kind;
  let frac;
  if (forcedKind != null) {
    // Купленный в магазине стиль — один вид на все рёбра пазла, размер
    // всё равно чуть гуляет от shape, чтобы кусочки не были клонами.
    kind = forcedKind;
    frac = shape;
  } else {
    const bucket = shape * 3;
    kind = Math.min(2, Math.floor(bucket));
    frac = bucket - kind;
  }
  const size = tabSize * (0.92 + frac * 0.16);
  const neck = size * 0.95;

  path.lineTo(...p(mid - neck, 0));
  if (kind === 0) {
    // Треугольник — острый пик, без единой кривой.
    path.lineTo(...p(mid, size * 1.2));
    path.lineTo(...p(mid + neck, 0));
  } else if (kind === 1) {
    // Квадрат — плоская "площадка" с прямыми углами.
    const shoulder = neck * 0.6;
    path.lineTo(...p(mid - shoulder, size * 1.02));
    path.lineTo(...p(mid + shoulder, size * 1.02));
    path.lineTo(...p(mid + neck, 0));
  } else if (kind === 3) {
    // Шестиугольник — гранёная "бочка" из 4 доп. точек прямыми линиями.
    const bevel = neck * 0.45;
    const topHalf = neck * 0.4;
    path.lineTo(...p(mid - neck + bevel, size * 0.58));
    path.lineTo(...p(mid - topHalf, size * 1.05));
    path.lineTo(...p(mid + topHalf, size * 1.05));
    path.lineTo(...p(mid + neck - bevel, size * 0.58));
    path.lineTo(...p(mid + neck, 0));
  } else {
    // Скруглённый выступ из двух симметричных кривых (как раньше).
    path.bezierCurveTo(
      ...p(mid - neck * 0.32, 0),
      ...p(mid - size * 0.62, size * 1.02),
      ...p(mid, size * 1.05)
    );
    path.bezierCurveTo(
      ...p(mid + size * 0.62, size * 1.02),
      ...p(mid + neck * 0.32, 0),
      ...p(mid + neck, 0)
    );
  }
  path.lineTo(x2, y2);
}

export function createPiecePath(row, col, rows, cols, cellW, cellH, edges, tabSize, pieceStyle) {
  const { vTab, vShape, hTab, hShape } = edges;
  const forcedKind = pieceStyle ? PIECE_STYLE_KIND[pieceStyle] : undefined;
  const northTab = row === 0 ? 0 : -hTab[row - 1][col];
  const northShape = row === 0 ? 0.5 : hShape[row - 1][col];
  const eastTab = col === cols - 1 ? 0 : vTab[row][col];
  const eastShape = col === cols - 1 ? 0.5 : vShape[row][col];
  const southTab = row === rows - 1 ? 0 : hTab[row][col];
  const southShape = row === rows - 1 ? 0.5 : hShape[row][col];
  const westTab = col === 0 ? 0 : -vTab[row][col - 1];
  const westShape = col === 0 ? 0.5 : vShape[row][col - 1];

  const path = new Path2D();
  path.moveTo(0, 0);
  appendEdge(path, 0, 0, cellW, 0, northTab, tabSize, northShape, forcedKind);
  appendEdge(path, cellW, 0, cellW, cellH, eastTab, tabSize, eastShape, forcedKind);
  appendEdge(path, cellW, cellH, 0, cellH, southTab, tabSize, southShape, forcedKind);
  appendEdge(path, 0, cellH, 0, 0, westTab, tabSize, westShape, forcedKind);
  path.closePath();
  return path;
}

export function createPieceBitmap(image, row, col, cellW, cellH, path, pad) {
  const w = Math.ceil(cellW + pad * 2);
  const h = Math.ceil(cellH + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(pad, pad);
  ctx.clip(path);
  ctx.translate(-col * cellW, -row * cellH);
  ctx.drawImage(image, 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(pad, pad);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.lineWidth = 3.2;
  ctx.stroke(path);
  ctx.strokeStyle = "rgba(58,42,36,0.38)";
  ctx.lineWidth = 1.35;
  ctx.stroke(path);
  ctx.restore();
  return canvas;
}

export function buildPieces(image, rows, cols, seed, pieceStyle) {
  const boardW = image.width;
  const boardH = image.height;
  const cellW = boardW / cols;
  const cellH = boardH / rows;
  const tabSize = Math.min(cellW, cellH) * 0.22;
  const pad = Math.ceil(tabSize * 1.45 + 4);
  const edges = generateEdges(rows, cols, seed);
  const pieces = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const path = createPiecePath(r, c, rows, cols, cellW, cellH, edges, tabSize, pieceStyle);
      const bitmap = createPieceBitmap(image, r, c, cellW, cellH, path, pad);
      pieces.push({
        id: r * cols + c,
        row: r,
        col: c,
        path,
        bitmap,
        pad,
      });
    }
  }
  return { pieces, cellW, cellH, boardW, boardH, tabSize };
}
