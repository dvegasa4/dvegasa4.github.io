import { savePuzzle, isQuotaError } from "../storage/db.js";
import { DIFFICULTIES, gridFor, newId, showToast, starsForPieces } from "../ui.js";

export function renderCreate(root) {
  const screen = document.createElement("div");
  screen.className = "screen";
  screen.innerHTML = `
    <div class="topbar">
      <a class="icon-btn" href="#/" aria-label="Назад">←</a>
      <h1>Новый пазл</h1>
    </div>
    <p class="sub">Выберите фото и сложность. Чем больше кусочков, тем дольше собирать.</p>
    <input class="hidden-input" id="camera" type="file" accept="image/*" capture="environment">
    <input class="hidden-input" id="gallery" type="file" accept="image/*">
    <div class="picker">
      <label class="pick" for="camera">Снять фото<small>Камера телефона</small></label>
      <label class="pick" for="gallery">Из галереи<small>Любое изображение</small></label>
    </div>
    <div data-preview></div>
    <div data-rest hidden>
      <p class="sub" style="margin-bottom:8px">Сложность</p>
      <div class="diffs"></div>
      <button class="btn btn-block" type="button" data-start>Начать сборку</button>
    </div>
  `;
  root.append(screen);

  const diffsEl = screen.querySelector(".diffs");
  let selected = DIFFICULTIES[1];
  let file = null;
  let previewUrl = "";
  let gone = false;

  for (const d of DIFFICULTIES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "diff";
    b.dataset.id = d.id;
    b.setAttribute("aria-pressed", d === selected ? "true" : "false");
    b.innerHTML = `<b>${d.label}</b><span>${d.pieces} кусочков · +${starsForPieces(d.pieces)}★ · $${d.dollars}</span>`;
    diffsEl.append(b);
  }

  diffsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff");
    if (!btn) return;
    selected = DIFFICULTIES.find((d) => d.id === btn.dataset.id);
    diffsEl.querySelectorAll(".diff").forEach((el) => {
      el.setAttribute("aria-pressed", el === btn ? "true" : "false");
    });
  });

  const onFile = (input) => {
    const next = input.files && input.files[0];
    input.value = "";
    if (!next) return;
    file = next;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(next);
    screen.querySelector("[data-preview]").innerHTML = `
      <div class="preview-wrap"><img alt="Выбранное фото" src="${previewUrl}"></div>
    `;
    screen.querySelector("[data-rest]").hidden = false;
  };

  screen.querySelector("#camera").addEventListener("change", (e) => onFile(e.target));
  screen.querySelector("#gallery").addEventListener("change", (e) => onFile(e.target));

  screen.querySelector("[data-start]").addEventListener("click", async () => {
    if (!file) {
      showToast("Сначала выберите фото");
      return;
    }
    const btn = screen.querySelector("[data-start]");
    btn.disabled = true;
    btn.textContent = "Готовим картинку…";
    try {
      const prepared = await prepareImages(file);
      const grid = gridFor(selected, prepared.width, prepared.height);
      const title = (file.name || "Пазл").replace(/\.[^.]+$/, "").slice(0, 40) || "Пазл";
      const now = Date.now();
      const puzzle = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        title,
        cols: grid.cols,
        rows: grid.rows,
        seed: (Math.random() * 2 ** 32) >>> 0,
        thumbnail: prepared.thumbnail,
        groups: [],
        viewport: null,
        completed: false,
        dollars: selected.dollars,
        image: prepared.image,
      };
      await savePuzzle(puzzle);
      if (gone) return;
      location.hash = `#/play/${puzzle.id}`;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Начать сборку";
      if (isQuotaError(err)) {
        showToast("Не хватает места. Удалите старый пазл.");
      } else {
        showToast("Не получилось обработать фото");
      }
    }
  });

  return () => {
    gone = true;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };
}

async function blobToBitmap(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      return createImageBitmap(blob);
    }
  }
  return loadImage(blob);
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

async function resizeToJpeg(source, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(source, 0, 0, w, h);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", quality);
  });
  return { blob, width: w, height: h };
}

async function prepareImages(file) {
  const original = await blobToBitmap(file);
  const main = await resizeToJpeg(original, 1600, 0.86);
  if (original.close) original.close();
  const mainBmp = await blobToBitmap(main.blob);
  const thumb = await resizeToJpeg(mainBmp, 360, 0.8);
  if (mainBmp.close) mainBmp.close();
  return { image: main.blob, thumbnail: thumb.blob, width: main.width, height: main.height };
}
