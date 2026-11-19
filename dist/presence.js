const safe = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export class PresenceUI {
  constructor(getRoom, getStatus, modal) {
    this.getRoom = getRoom;
    this.getStatus = getStatus;
    this.modal = modal;
    this.state = "connecting";
    this.candidate = null;
    this.seen = new Set();
    try {
      this.seen = new Set(
        JSON.parse(sessionStorage.getItem("zhmi:welcomed") || "[]"),
      );
    } catch {}
    setInterval(() => this.refresh(), 1500);
  }
  members() {
    const r = this.getRoom();
    if (!r) return [];
    const online = new Set([...r.online].map((id) => r.access.canonical(id)));
    return r.access.members().filter((p) => online.has(p.id));
  }
  label() {
    return {
      online: "На связи",
      solo: "Комната готова",
      offline: "Офлайн · всё сохранено",
      connecting: "Подключаемся",
    }[this.state];
  }
  html() {
    return `<button class="connection connection-compact" data-action="connection" data-status="${this.state}" aria-label="Связь: ${this.label()}"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg><i></i><span id="connection-text" class="sr-only">${safe(this.getStatus())}</span></button>`;
  }
  refresh() {
    const r = this.getRoom();
    if (!r) return;
    const members = this.members();
    const raw = this.getStatus();
    const next =
      members.length >= 2
        ? "online"
        : !navigator.onLine || /Офлайн|Нет связи|недоступна/.test(raw)
          ? "offline"
          : /ждём|не в сети/.test(raw)
            ? "solo"
            : "connecting";
    const key = r.code + ":" + next;
    if (this.candidate !== key) {
      this.candidate = key;
      this.changedAt = Date.now();
    }
    if (Date.now() - this.changedAt > (next === "online" ? 900 : 2800))
      this.state = next;
    for (const el of document.querySelectorAll('[data-action="connection"]')) {
      el.dataset.status = this.state;
      el.setAttribute("aria-label", "Связь: " + this.label());
    }
    const detail = document.querySelector("#connection-text");
    if (detail) detail.textContent = raw;
    for (const el of document.querySelectorAll("[data-room-status]")) {
      el.textContent = this.label();
      el.dataset.status = this.state;
    }
    if (
      members.length >= 2 &&
      this.state === "online" &&
      !document.querySelector("dialog[open]") &&
      !document.activeElement?.matches("input,textarea,select") &&
      !document.querySelector(".pack-welcome")
    ) {
      const signature =
        r.code +
        ":" +
        members
          .map((p) => p.id)
          .sort()
          .join(",");
      if (this.seen.has(signature)) return;
      this.seen.add(signature);
      try {
        sessionStorage.setItem(
          "zhmi:welcomed",
          JSON.stringify([...this.seen].slice(-60)),
        );
      } catch {}
      if (this.lastWelcome && Date.now() - this.lastWelcome < 30000) return;
      this.lastWelcome = Date.now();
      const overlay = document.createElement("button");
      overlay.className = "pack-welcome";
      overlay.setAttribute("aria-label", "Стая в сборе. Продолжить");
      overlay.innerHTML = `<span class="pack-avatars">${members.map((p) => `<i>${safe(p.avatar)}</i>`).join("")}</span><strong>Стая в сборе</strong><span>Свои на связи. Можно жать вместе.</span><small>Тапни, чтобы продолжить</small>`;
      document.body.append(overlay);
      overlay.addEventListener("click", () => overlay.remove());
      setTimeout(() => overlay.remove(), 3800);
    }
  }
  open() {
    const members = this.members();
    this.modal(
      `<h2>Связь со стаей</h2><div class="connection-summary" data-status="${this.state}"><i></i><strong>${this.label()}</strong></div><p>${this.state === "online" ? `Сейчас на связи: ${members.map((p) => safe(p.name)).join(", ")}. Записи передаются автоматически.` : this.state === "offline" ? "Тренировки сохраняются на этом устройстве. Когда интернет вернётся, комната сверит записи." : "Комнатой можно пользоваться одному. Для встречи откройте одну комнату одновременно."}</p><details><summary>Подробности соединения</summary><p>${safe(this.getStatus())}</p><button class="secondary" data-action="reconnect">Переподключить</button></details>`,
    );
  }
}
