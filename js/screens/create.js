import { savePuzzle, isQuotaError, getProfile } from "../storage/db.js";
import { DIFFICULTIES, gridFor, newId, showToast, starsForPieces, SHOP_ITEMS } from "../ui.js";

// Пикеры косметики показываются только для категорий, где куплен хотя бы
// один платный вариант — иначе просто используется бесплатный дефолт без
// лишнего UI на экране создания пазла.
const COSMETIC_GROUPS = [
  { category: "pieceStyle", title: "Стиль кусочков", defaultValue: "mix", defaultLabel: "Обычный микс" },
  { category: "colorTheme", title: "Цветовая тема", defaultValue: "classic", defaultLabel: "Классическая" },
  { category: "mergeEffect", title: "Эффект стыковки", defaultValue: "sparks", defaultLabel: "Искры" },
];

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
      <div data-cosmetics hidden></div>
      <button class="btn btn-block" type="button" data-start>Начать сборку</button>
    </div>
  `;
  root.append(screen);

  const diffsEl = screen.querySelector(".diffs");
  const cosmeticsEl = screen.querySelector("[data-cosmetics]");
  let selected = DIFFICULTIES[1];
  let file = null;
  let previewUrl = "";
  let gone = false;
  // Пока профиль не прочитан — считаем, что ничего не куплено (безопасный
  // дефолт: «Мастер» заблокирован, пикеров косметики нет).
  let profile = { stars: 0, dollars: 0, ownedItems: [] };
  const cosmetics = { pieceStyle: "mix", colorTheme: "classic", mergeEffect: "sparks" };

  function buildDiffs() {
    diffsEl.innerHTML = "";
    for (const d of DIFFICULTIES) {
      const locked = !!d.unlockId && !profile.ownedItems.includes(d.unlockId);
      if (locked && selected === d) selected = DIFFICULTIES[1];
      const el = document.createElement(locked ? "a" : "button");
      el.className = locked ? "diff diff-locked" : "diff";
      el.dataset.id = d.id;
      if (locked) {
        el.href = "#/shop";
        const price = SHOP_ITEMS.find((it) => it.id === d.unlockId)?.price ?? 0;
        el.innerHTML = `<b>🔒 ${d.label}</b><span>${d.pieces} кусочков · открыть за $${price}</span>`;
      } else {
        el.type = "button";
        el.setAttribute("aria-pressed", d === selected ? "true" : "false");
        el.innerHTML = `<b>${d.label}</b><span>${d.pieces} кусочков · +${starsForPieces(d.pieces)}★ · $${d.dollars}</span>`;
      }
      diffsEl.append(el);
    }
  }

  function buildCosmetics() {
    cosmeticsEl.innerHTML = "";
    for (const group of COSMETIC_GROUPS) {
      const owned = SHOP_ITEMS.filter(
        (item) => item.category === group.category && profile.ownedItems.includes(item.id)
      );
      if (owned.length === 0) continue;
      const wrap = document.createElement("div");
      wrap.className = "cosmetic-group";
      const title = document.createElement("p");
      title.className = "sub";
      title.style.marginBottom = "8px";
      title.textContent = group.title;
      const row = document.createElement("div");
      row.className = "diffs";
      const options = [{ value: group.defaultValue, label: group.defaultLabel }, ...owned];
      for (const opt of options) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "diff";
        b.dataset.category = group.category;
        b.dataset.value = opt.value;
        b.setAttribute("aria-pressed", cosmetics[group.category] === opt.value ? "true" : "false");
        b.innerHTML = `<b>${opt.label}</b><span>${opt.value === group.defaultValue ? "Бесплатно" : "Куплено"}</span>`;
        row.append(b);
      }
      wrap.append(title, row);
      cosmeticsEl.append(wrap);
    }
    cosmeticsEl.hidden = cosmeticsEl.children.length === 0;
  }

  buildDiffs();
  buildCosmetics();

  getProfile()
    .then((p) => {
      if (gone) return;
      profile = p;
      buildDiffs();
      buildCosmetics();
    })
    .catch((err) => console.error("Не удалось прочитать профиль", err));

  diffsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff");
    if (!btn) return;
    if (btn.classList.contains("diff-locked")) {
      showToast("Эта сложность закрыта — купите её в магазине");
      return;
    }
    selected = DIFFICULTIES.find((d) => d.id === btn.dataset.id);
    diffsEl.querySelectorAll(".diff").forEach((el) => {
      el.setAttribute("aria-pressed", el === btn ? "true" : "false");
    });
  });

  cosmeticsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".diff");
    if (!btn || !btn.dataset.category) return;
    const category = btn.dataset.category;
    cosmetics[category] = btn.dataset.value;
    cosmeticsEl.querySelectorAll(`.diff[data-category="${category}"]`).forEach((el) => {
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
        pieceStyle: cosmetics.pieceStyle,
        colorTheme: cosmetics.colorTheme,
        mergeEffect: cosmetics.mergeEffect,
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
