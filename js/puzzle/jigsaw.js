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

function appendEdge(path, x1, y1, x2, y2, tab, tabSize, shape) {
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
  // выступа и выемки на стыке совпадают. Три явно разных силуэта — острый
  // треугольник, гранёный "квадрат" и текущий скруглённый — читаются легко
  // и не спорят с минимализмом стиля.
  const bucket = shape * 3;
  const kind = Math.min(2, Math.floor(bucket));
  const frac = bucket - kind;
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

export function createPiecePath(row, col, rows, cols, cellW, cellH, edges, tabSize) {
  const { vTab, vShape, hTab, hShape } = edges;
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
  appendEdge(path, 0, 0, cellW, 0, northTab, tabSize, northShape);
  appendEdge(path, cellW, 0, cellW, cellH, eastTab, tabSize, eastShape);
  appendEdge(path, cellW, cellH, 0, cellH, southTab, tabSize, southShape);
  appendEdge(path, 0, cellH, 0, 0, westTab, tabSize, westShape);
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

export function buildPieces(image, rows, cols, seed) {
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
      const path = createPiecePath(r, c, rows, cols, cellW, cellH, edges, tabSize);
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
