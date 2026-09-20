import { renderHome } from "./screens/home.js";
import { renderCreate } from "./screens/create.js";
import { renderPlay } from "./screens/play.js";
import { renderShop } from "./screens/shop.js";

const app = document.getElementById("app");
let cleanup = null;

function parseHash() {
  const raw = (location.hash || "#/").replace(/^#/, "") || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "new") return { name: "new" };
  if (parts[0] === "shop") return { name: "shop" };
  if (parts[0] === "play" && parts[1]) return { name: "play", id: parts[1] };
  return { name: "home" };
}

function route() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  app.replaceChildren();
  const view = parseHash();
  if (view.name === "new") cleanup = renderCreate(app);
  else if (view.name === "shop") cleanup = renderShop(app);
  else if (view.name === "play") cleanup = renderPlay(app, view.id);
  else cleanup = renderHome(app);
}

window.addEventListener("hashchange", route);
route();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
