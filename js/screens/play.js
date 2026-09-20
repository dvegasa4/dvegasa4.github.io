import { getPuzzle, updateProgress, isQuotaError } from "../storage/db.js";
import { PuzzleEngine } from "../puzzle/engine.js";
import { showToast } from "../ui.js";

export function renderPlay(root, id) {
  const screen = document.createElement("div");
  screen.className = "screen-play";
  screen.innerHTML = `
    <div class="play-bar">
      <a class="icon-btn" href="#/" aria-label="К списку">←</a>
      <button class="icon-btn" type="button" data-hint aria-pressed="false" aria-label="Подсказка">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3a2a24" stroke-width="2">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 8v.01M11 12h1v4h1"/>
        </svg>
      </button>
      <div class="pill" data-pct>0%</div>
    </div>
    <div class="play-stage">
      <canvas></canvas>
      <div class="win" hidden>
        <div class="win-card">
          <h2>Готово!</h2>
          <p>Картинка собралась. Можно начать другой пазл или пересмотреть этот.</p>
          <a class="btn btn-block" href="#/">К списку</a>
        </div>
      </div>
    </div>
  `;
  root.append(screen);

  const canvas = screen.querySelector("canvas");
  const pctEl = screen.querySelector("[data-pct]");
  const hintBtn = screen.querySelector("[data-hint]");
  const winEl = screen.querySelector(".win");

  let engine = null;
  let gone = false;

  const persist = async (state, extra = {}) => {
    try {
      await updateProgress(id, { ...state, ...extra });
    } catch (err) {
      if (isQuotaError(err)) showToast("Не хватает места для сохранения");
    }
  };

  const onVis = () => {
    if (document.visibilityState === "hidden") engine?.emit(true);
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onVis);

  hintBtn.addEventListener("click", () => {
    const on = hintBtn.getAttribute("aria-pressed") !== "true";
    hintBtn.setAttribute("aria-pressed", on ? "true" : "false");
    engine?.setHint(on);
  });

  (async () => {
    const puzzle = await getPuzzle(id);
    if (gone) return;
    if (!puzzle) {
      showToast("Пазл не найден");
      location.hash = "#/";
      return;
    }
    let image;
    try {
      image = await createImageBitmap(puzzle.image);
    } catch {
      image = await loadImage(puzzle.image);
    }
    if (gone) {
      image.close?.();
      return;
    }
    engine = new PuzzleEngine(canvas, puzzle, image, {
      onChange(state) {
        pctEl.textContent = `${engine.progress()}%`;
        persist(state);
      },
      onComplete() {
        winEl.hidden = false;
        pctEl.textContent = "100%";
      },
    });
    pctEl.textContent = `${engine.progress()}%`;
    if (puzzle.completed) winEl.hidden = false;
  })();

  return () => {
    gone = true;
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onVis);
    engine?.destroy();
  };
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}
