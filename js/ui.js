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
  { id: "easy", label: "Лёгкий", pieces: 12, cols: 4, rows: 3 },
  { id: "medium", label: "Средний", pieces: 24, cols: 6, rows: 4 },
  { id: "hard", label: "Сложный", pieces: 48, cols: 8, rows: 6 },
  { id: "expert", label: "Эксперт", pieces: 80, cols: 10, rows: 8 },
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

const STAR_REWARDS = { 12: 1, 24: 2, 48: 4, 80: 7 };

export function starsForPieces(n) {
  if (STAR_REWARDS[n] != null) return STAR_REWARDS[n];
  return Math.max(1, Math.round((n / 80) * 7));
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
