const toasts = document.getElementById("toasts");

export function showToast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toasts.append(el);
  setTimeout(() => el.remove(), 3200);
}

export function confirmModal(root, { title, text, ok, danger }) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-no>Отмена</button>
          <button class="btn ${danger ? "" : "btn-mint"}" type="button" data-yes>${ok}</button>
        </div>
      </div>
    `;
    const done = (value) => {
      back.remove();
      resolve(value);
    };
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-no]")) done(false);
      else if (e.target.closest("[data-yes]")) done(true);
    });
    root.append(back);
  });
}

export const DIFFICULTIES = [
  { id: "easy", label: "Лёгкий", pieces: 12, cols: 4, rows: 3, dollars: 50 },
  { id: "medium", label: "Средний", pieces: 24, cols: 6, rows: 4, dollars: 100 },
  { id: "hard", label: "Сложный", pieces: 48, cols: 8, rows: 6, dollars: 200 },
  { id: "expert", label: "Эксперт", pieces: 80, cols: 10, rows: 8, dollars: 300 },
  // Разблокируется в магазине за difficulty:master.
  { id: "master", label: "Мастер", pieces: 130, cols: 13, rows: 10, dollars: 500, unlockId: "difficulty:master" },
];

export function gridFor(diff, width, height) {
  let { cols, rows } = diff;
  if (height > width && cols > rows) {
    [cols, rows] = [rows, cols];
  }
  return { cols, rows };
}

export function progressOf(puzzle) {
  const n = puzzle.cols * puzzle.rows;
  if (puzzle.completed) return 100;
  if (!puzzle.groups || puzzle.groups.length === 0) return 0;
  if (n <= 1) return 100;
  return Math.round(((n - puzzle.groups.length) / (n - 1)) * 100);
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
}

const STAR_REWARDS = { 12: 1, 24: 2, 48: 4, 80: 7, 130: 12 };

export function starsForPieces(n) {
  if (STAR_REWARDS[n] != null) return STAR_REWARDS[n];
  return Math.max(1, Math.round((n / 80) * 7));
}

const DOLLAR_BUDGET = { 12: 50, 24: 100, 48: 200, 80: 300, 130: 500 };

export function dollarsForPieces(n) {
  if (DOLLAR_BUDGET[n] != null) return DOLLAR_BUDGET[n];
  return Math.max(0, Math.round((n / 80) * 300));
}

// --- Магазин -----------------------------------------------------------

// Стоимость и продолжительность одной активации подсказки. Списывается с
// живого счётчика $ текущего пазла (не с общего банка).
export const HINT_COST = 50;
export const HINT_DURATION_MS = 5000;

// Единый каталог всего, что продаётся в магазине. category + value —
// то, что записывается в пазл (pieceStyle/mergeEffect/colorTheme) или
// используется как unlockId у сложности (см. DIFFICULTIES).
export const SHOP_ITEMS = [
  {
    id: "style:hexagon",
    category: "pieceStyle",
    value: "hexagon",
    label: "Шестиугольные кусочки",
    price: 1000,
    desc: "Все кусочки пазла — с гранёным шестиугольным выступом вместо обычного микса форм.",
  },
  {
    id: "style:triangle",
    category: "pieceStyle",
    value: "triangle",
    label: "Треугольные кусочки",
    price: 5000,
    desc: "Все кусочки пазла — с острым треугольным выступом.",
  },
  {
    id: "effect:bubbles",
    category: "mergeEffect",
    value: "bubbles",
    label: "Пузырьки",
    price: 300,
    desc: "При стыковке кусочков — пузырьки и тихий \"поп\" вместо искр.",
  },
  {
    id: "effect:bell",
    category: "mergeEffect",
    value: "bell",
    label: "Колокольчик",
    price: 500,
    desc: "Золотые искры и звон колокольчика при каждой стыковке.",
  },
  {
    id: "effect:fart",
    category: "mergeEffect",
    value: "fart",
    label: "Пёрдёж",
    price: 5000,
    desc: "Комичный неприличный звук при каждой стыковке кусочков.",
  },
  {
    id: "theme:mint",
    category: "colorTheme",
    value: "mint",
    label: "Мятная тема",
    price: 500,
    desc: "Мятный цвет доски пазла.",
  },
  {
    id: "theme:sunset",
    category: "colorTheme",
    value: "sunset",
    label: "Тема «Закат»",
    price: 500,
    desc: "Тёплый закатный цвет доски пазла.",
  },
  {
    id: "theme:night",
    category: "colorTheme",
    value: "night",
    label: "Ночная тема",
    price: 500,
    desc: "Тёмная доска с золотыми линиями.",
  },
  {
    id: "difficulty:master",
    category: "difficulty",
    value: "master",
    label: "Сложность «Мастер»",
    price: 10000,
    desc: "Открывает уровень «Мастер» — 130 кусочков.",
  },
];

// Палитра доски пазла по colorTheme (см. PuzzleEngine.drawBoard).
export const COLOR_THEMES = {
  classic: { fill: "rgba(255, 247, 238, 0.92)", stroke: "rgba(255, 122, 89, 0.55)" },
  mint: { fill: "rgba(230, 250, 244, 0.92)", stroke: "rgba(60, 184, 154, 0.6)" },
  sunset: { fill: "rgba(255, 236, 222, 0.92)", stroke: "rgba(255, 138, 76, 0.62)" },
  night: { fill: "rgba(40, 42, 62, 0.92)", stroke: "rgba(255, 213, 107, 0.55)" },
};

// Цвета частиц и звук по mergeEffect (см. PuzzleEngine.spawnBurst).
export const MERGE_EFFECTS = {
  sparks: { colors: ["#ff7a59", "#ffd56b", "#7ee0c6", "#ff5fa2", "#ffffff"], sound: "snap" },
  bubbles: { colors: ["#8fd6ff", "#bfeaff", "#5cc2e6", "#ffffff"], sound: "bubble" },
  bell: { colors: ["#ffd56b", "#fff1c2", "#ffb347", "#ffffff"], sound: "bell" },
  fart: { colors: ["#8a9a3b", "#c8d16b", "#5c4a2e", "#dfe6a8"], sound: "fart" },
};

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
