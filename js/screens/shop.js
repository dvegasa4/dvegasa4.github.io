import { getProfile, purchaseItem } from "../storage/db.js";
import { SHOP_ITEMS, showToast } from "../ui.js";

const CATEGORY_TITLES = {
  pieceStyle: "Стиль кусочков",
  mergeEffect: "Эффект стыковки",
  colorTheme: "Цветовая тема доски",
  difficulty: "Новая сложность",
};

export function renderShop(root) {
  const screen = document.createElement("div");
  screen.className = "screen";
  screen.innerHTML = `
    <div class="topbar">
      <a class="icon-btn" href="#/" aria-label="Назад">←</a>
      <h1>Магазин</h1>
      <div class="pill pill-dollars" data-bank>$ 0</div>
    </div>
    <p class="sub">Постоянные разблокировки покупаются один раз с общего банка $, накопленного за собранные пазлы. Стиль/тема/эффект выбираются на экране создания нового пазла.</p>
    <div data-sections></div>
  `;
  root.append(screen);

  const bankEl = screen.querySelector("[data-bank]");
  const sectionsEl = screen.querySelector("[data-sections]");
  let gone = false;
  let profile = { stars: 0, dollars: 0, ownedItems: [] };
  let busy = false;

  const render = () => {
    bankEl.textContent = `$ ${profile.dollars}`;
    sectionsEl.innerHTML = "";
    const categories = [...new Set(SHOP_ITEMS.map((item) => item.category))];
    for (const category of categories) {
      const items = SHOP_ITEMS.filter((item) => item.category === category);
      const section = document.createElement("div");
      section.className = "shop-section";

      const title = document.createElement("h2");
      title.className = "shop-section-title";
      title.textContent = CATEGORY_TITLES[category] || category;
      section.append(title);

      const list = document.createElement("div");
      list.className = "list";
      for (const item of items) {
        const owned = profile.ownedItems.includes(item.id);
        const affordable = profile.dollars >= item.price;
        const row = document.createElement("div");
        row.className = "shop-item";
        row.innerHTML = `
          <div>
            <h3>${escapeHtml(item.label)}</h3>
            <p>${escapeHtml(item.desc)}</p>
          </div>
          <button
            class="btn ${owned || !affordable ? "btn-ghost" : "btn-mint"}"
            type="button"
            data-buy="${item.id}"
            data-price="${item.price}"
            ${owned || busy ? "disabled" : ""}
          >${owned ? "Куплено" : `Купить $${item.price}`}</button>
        `;
        list.append(row);
      }
      section.append(list);
      sectionsEl.append(section);
    }
  };

  const load = () => {
    getProfile()
      .then((p) => {
        if (gone) return;
        profile = p;
        render();
      })
      .catch((err) => {
        console.error("Не удалось прочитать профиль", err);
        if (!gone) showToast("Не получилось открыть магазин");
      });
  };

  screen.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-buy]");
    if (!btn || btn.disabled || busy) return;
    const itemId = btn.getAttribute("data-buy");
    const price = Number(btn.getAttribute("data-price"));
    busy = true;
    try {
      const result = await purchaseItem(itemId, price);
      if (gone) return;
      profile = result.profile;
      if (result.ok) {
        showToast("Покупка совершена! Доступно на новом пазле.");
      } else if (result.reason === "insufficient") {
        showToast("Не хватает $ на эту покупку");
      }
    } catch (err) {
      console.error("Не удалось выполнить покупку", err);
      if (!gone) showToast("Не получилось купить");
    } finally {
      busy = false;
      if (!gone) render();
    }
  });

  render();
  load();

  return () => {
    gone = true;
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
