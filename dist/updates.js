export const APP_VERSION = "1.4.0";
export function initUpdates({ save, toast }) {
  let registration,
    applying = false,
    banner;
  function show(version) {
    if (banner) return;
    banner = document.createElement("aside");
    banner.className = "update-notice";
    banner.setAttribute("role", "status");
    banner.innerHTML =
      "<div><b>Доступна новая версия</b><span>Дневник сохранится перед обновлением</span></div><button data-update-app>Обновиться</button>";
    document.body.append(banner);
    document.body.classList.add("has-update");
    const measure = () =>
      document.documentElement.style.setProperty(
        "--release-height",
        banner.getBoundingClientRect().height + "px",
      );
    measure();
    new ResizeObserver(measure).observe(banner);
  }
  async function check() {
    try {
      registration ??= await navigator.serviceWorker?.getRegistration();
      registration?.update().catch(() => {});
      const versionURL = new URL("./version.json", import.meta.url);
      versionURL.searchParams.set("check", Math.floor(Date.now() / 30000));
      const response = await fetch(versionURL, {
        cache: "no-store",
      });
      if (response.ok) {
        const latest = await response.json();
        if (latest.version && latest.version !== APP_VERSION)
          show(latest.version);
      }
      if (registration?.waiting) show();
    } catch {}
  }
  async function apply() {
    if (applying) return;
    applying = true;
    try {
      await save();
      if (banner) banner.querySelector("button").textContent = "Обновляем…";
      registration ??= await navigator.serviceWorker?.getRegistration();
      await registration?.update();
      if (registration?.installing)
        await new Promise((resolve) => {
          const worker = registration.installing;
          const timer = setTimeout(resolve, 15000);
          worker.addEventListener("statechange", () => {
            if (["installed", "redundant"].includes(worker.state)) {
              clearTimeout(timer);
              resolve();
            }
          });
        });
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => location.reload(), 4000);
      } else location.reload();
    } catch {
      applying = false;
      toast("Не удалось загрузить обновление. Проверь интернет и повтори.");
      if (banner) banner.querySelector("button").textContent = "Повторить";
    }
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (applying) location.reload();
    });
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting) show();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              show();
          });
        });
      })
      .catch(() => {});
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-update-app]")) apply();
    if (e.target.closest("[data-check-updates]")) {
      check();
      toast("Проверяем обновления…");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("online", check);
  setInterval(() => {
    if (document.visibilityState === "visible") check();
  }, 30000);
  check();
  return { check, apply };
}
