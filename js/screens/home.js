import { listPuzzles, deletePuzzle } from "../storage/db.js";
import { confirmModal, progressOf, formatDate } from "../ui.js";

const logoSvg = `
  <svg viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
    <path d="M8 3h3.2c0-1.7 1.2-3 2.5-3S16.2 1.3 16.2 3H19a2 2 0 0 1 2 2v3.2c1.7 0 3 1.3 3 2.6s-1.3 2.5-3 2.5V16a2 2 0 0 1-2 2h-3.2c0 1.7-1.3 3-2.6 3s-2.5-1.3-2.5-3H8a2 2 0 0 1-2-2v-3.2C4.3 10.8 3 9.5 3 8.2S4.3 5.7 6 5.7V5a2 2 0 0 1 2-2z"/>
  </svg>
`;

export function renderHome(root) {
  const urls = [];
  let gone = false;

  const screen = document.createElement("div");
  screen.className = "screen";
  root.append(screen);

  const paint = async () => {
    const puzzles = await listPuzzles();
    if (gone) return;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));

    screen.innerHTML = `
      <div class="topbar">
        <div class="logo">${logoSvg}</div>
        <h1>Пазлы</h1>
      </div>
      <p class="sub">Загрузите фото и соберите его кусочками. Прогресс остаётся на этом телефоне.</p>
      <a class="btn btn-block" href="#/new">Новый пазл</a>
      <div class="list" style="margin-top:18px"></div>
      <p class="note">Картинки и сборка хранятся только на устройстве и доступны офлайн.</p>
    `;

    const list = screen.querySelector(".list");
    if (puzzles.length === 0) {
      list.innerHTML = `
        <div class="empty">
          <div class="empty-art">${logoSvg}</div>
          <h2>Пока пусто</h2>
          <p>Сфотографируйте что-нибудь яркое или выберите снимок из галереи.</p>
          <a class="btn" href="#/new">Собрать первый пазл</a>
        </div>
      `;
      list.querySelector(".empty-art svg").setAttribute("fill", "#ff7a59");
      return;
    }

    for (const puzzle of puzzles) {
      const pct = progressOf(puzzle);
      const url = puzzle.thumbnail ? URL.createObjectURL(puzzle.thumbnail) : "";
      if (url) urls.push(url);
      const n = puzzle.cols * puzzle.rows;
      const card = document.createElement("a");
      card.className = "card";
      card.href = `#/play/${puzzle.id}`;
      card.innerHTML = `
        <img alt="" src="${url}">
        <div>
          <h2>${escapeHtml(puzzle.title)}</h2>
          <p>${n} кусочков · ${puzzle.completed ? "собран" : formatDate(puzzle.updatedAt)}</p>
          <div class="progress" aria-label="Прогресс ${pct}%"><span style="width:${pct}%"></span></div>
        </div>
        <button class="icon-btn" type="button" data-del="${puzzle.id}" aria-label="Удалить">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d564c" stroke-width="2">
            <path d="M4 7h16M9 7V5h6v2m-7 3v8m4-8v8m4-8v8M6 7l1 14h10l1-14"/>
          </svg>
        </button>
      `;
      list.append(card);
    }
  };

  screen.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const id = btn.getAttribute("data-del");
    const ok = await confirmModal(root, {
      title: "Удалить пазл?",
      text: "Картинка и прогресс исчезнут с этого телефона.",
      ok: "Удалить",
      danger: true,
    });
    if (!ok) return;
    await deletePuzzle(id);
    paint();
  });

  paint();

  return () => {
    gone = true;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
