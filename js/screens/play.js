import { getPuzzle, updateProgress, isQuotaError, getProfile, awardCompletion } from "../storage/db.js";
import { PuzzleEngine } from "../puzzle/engine.js";
import { showToast, progressOf, starsForPieces } from "../ui.js";
import { playWin } from "../audio.js";

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
      <div class="pill pill-stars" data-stars>★ 0</div>
      <div class="pill pill-dollars" data-dollars>$ 0</div>
      <div class="pill" data-pct>0%</div>
    </div>
    <div class="play-stage">
      <canvas></canvas>
      <div class="win" data-loading hidden>
        <div class="win-card">
          <h2>Готовим пазл…</h2>
          <p>Разрезаем фото на кусочки, это быстро.</p>
        </div>
      </div>
      <div class="win" data-error hidden>
        <div class="win-card">
          <h2>Не получилось открыть пазл</h2>
          <p data-error-text>Попробуйте ещё раз или вернитесь к списку.</p>
          <div class="modal-actions">
            <a class="btn btn-ghost" href="#/">К списку</a>
            <button class="btn" type="button" data-retry>Повторить</button>
          </div>
        </div>
      </div>
      <div class="win" data-win hidden>
        <div class="win-card">
          <h2>Готово!</h2>
          <p>Картинка собралась. Можно начать другой пазл или пересмотреть этот.</p>
          <p class="earned-stars" data-earned hidden>+<span data-earned-amount>0</span> ★ и +<span data-earned-dollars>0</span> $</p>
          <a class="btn btn-block" href="#/">К списку</a>
        </div>
      </div>
    </div>
  `;
  root.append(screen);

  const canvas = screen.querySelector("canvas");
  const pctEl = screen.querySelector("[data-pct]");
  const starsEl = screen.querySelector("[data-stars]");
  const dollarsEl = screen.querySelector("[data-dollars]");
  const hintBtn = screen.querySelector("[data-hint]");
  const loadingEl = screen.querySelector("[data-loading]");
  const errorEl = screen.querySelector("[data-error]");
  const errorTextEl = screen.querySelector("[data-error-text]");
  const winEl = screen.querySelector("[data-win]");
  const earnedEl = screen.querySelector("[data-earned]");
  const earnedAmountEl = screen.querySelector("[data-earned-amount]");
  const earnedDollarsEl = screen.querySelector("[data-earned-dollars]");

  let engine = null;
  let gone = false;
  let winTimer = 0;
  let wakeLock = null;

  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  };

  const requestWakeLock = async () => {
    if (gone || !("wakeLock" in navigator)) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      // недоступно (например, режим экономии батареи) — не критично
    }
  };

  const persist = async (state, extra = {}) => {
    try {
      await updateProgress(id, { ...state, ...extra });
    } catch (err) {
      if (isQuotaError(err)) showToast("Не хватает места для сохранения");
    }
  };

  const onVis = () => {
    if (document.visibilityState === "hidden") {
      engine?.emit(true);
    } else if (document.visibilityState === "visible" && engine && !wakeLock) {
      requestWakeLock();
    }
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onVis);

  hintBtn.addEventListener("click", () => {
    const on = hintBtn.getAttribute("aria-pressed") !== "true";
    hintBtn.setAttribute("aria-pressed", on ? "true" : "false");
    engine?.setHint(on);
  });

  const showError = (message) => {
    loadingEl.hidden = true;
    errorTextEl.textContent = message;
    errorEl.hidden = false;
  };

  const load = async () => {
    engine?.destroy();
    engine = null;
    clearTimeout(winTimer);
    releaseWakeLock();
    errorEl.hidden = true;
    winEl.hidden = true;
    earnedEl.hidden = true;
    loadingEl.hidden = false;

    getProfile()
      .then((profile) => {
        if (!gone) starsEl.textContent = `★ ${profile.stars}`;
      })
      .catch((err) => console.error("Не удалось прочитать звёзды", err));

    let puzzle;
    try {
      puzzle = await getPuzzle(id);
    } catch (err) {
      console.error("Не удалось прочитать пазл из хранилища", err);
      if (gone) return;
      showError("Хранилище недоступно. Проверьте место на устройстве и повторите попытку.");
      return;
    }
    if (gone) return;
    if (!puzzle) {
      loadingEl.hidden = true;
      showToast("Пазл не найден");
      location.hash = "#/";
      return;
    }

    let image;
    try {
      try {
        image = await createImageBitmap(puzzle.image);
      } catch (err) {
        image = await loadImage(puzzle.image);
      }
    } catch (err) {
      console.error("Не удалось decode фото пазла", err);
      if (gone) return;
      showError("Не получилось открыть фото этого пазла.");
      return;
    }
    if (gone) {
      image.close?.();
      return;
    }

    const updatePct = (state) => {
      const pct = progressOf({ cols: puzzle.cols, rows: puzzle.rows, groups: state.groups, completed: state.completed });
      pctEl.textContent = `${pct}%`;
      if (typeof state.dollars === "number") dollarsEl.textContent = `$ ${state.dollars}`;
    };

    try {
      engine = new PuzzleEngine(canvas, puzzle, image, {
        onChange(state) {
          updatePct(state);
          persist(state);
        },
        onComplete() {
          pctEl.textContent = "100%";
          clearTimeout(winTimer);
          // Начисляем сразу и надёжно (не зависит от того, останется ли
          // пользователь на экране всю секунду до появления "Готово!").
          const starsAmount = starsForPieces(puzzle.cols * puzzle.rows);
          const dollarsAmount = engine.dollars;
          const awardPromise = awardCompletion(puzzle.id, {
            stars: starsAmount,
            dollars: dollarsAmount,
          }).catch((err) => {
            console.error("Не удалось начислить награду", err);
            return null;
          });
          winTimer = setTimeout(async () => {
            const result = await awardPromise;
            if (gone) return;
            if (result?.awarded) {
              starsEl.textContent = `★ ${result.profile.stars}`;
              dollarsEl.textContent = `$ ${dollarsAmount}`;
              starsEl.classList.remove("bump");
              void starsEl.offsetWidth;
              starsEl.classList.add("bump");
              earnedAmountEl.textContent = String(starsAmount);
              earnedDollarsEl.textContent = String(dollarsAmount);
              earnedEl.hidden = false;
            }
            engine?.celebrate();
            playWin();
            winEl.hidden = false;
          }, 1000);
        },
      });
    } catch (err) {
      console.error("Не удалось собрать сцену пазла", err);
      if (gone) return;
      showError("Не получилось собрать пазл на экране.");
      return;
    }

    loadingEl.hidden = true;
    updatePct(engine.snapshot());
    if (puzzle.completed) winEl.hidden = false;
    requestWakeLock();
  };

  screen.querySelector("[data-retry]").addEventListener("click", load);

  load();

  return () => {
    gone = true;
    clearTimeout(winTimer);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onVis);
    engine?.destroy();
    releaseWakeLock();
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
