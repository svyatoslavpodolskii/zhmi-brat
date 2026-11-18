import { DeviceAccess } from "./devices.js";
import { mergeDiaries } from "./sync-state.js";
export const EMOJIS = [
  "💪",
  "🐻",
  "🦍",
  "🏋️",
  "🔥",
  "🍌",
  "🥦",
  "🦈",
  "🐸",
  "🦖",
  "⚡",
  "🚀",
  "🍉",
  "🧀",
  "🥇",
  "🦊",
  "🐼",
  "🐯",
  "🦁",
  "🐙",
  "🌵",
  "🍄",
  "🌙",
  "⭐",
  "🎯",
  "🎲",
  "🛸",
  "🧠",
  "🦾",
  "🍑",
  "🥑",
  "🐳",
];
const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
export const newCode = () =>
  [...crypto.getRandomValues(new Uint8Array(10))]
    .map((x) => EMOJIS[x % 32])
    .join("");
export const normalizeCode = (s) => s.replace(/[\s\uFE0F]/g, "");
export function validDiary(p) {
  const obj = (x) => x && typeof x === "object" && !Array.isArray(x);
  const position = (x) =>
    obj(x) &&
    ["prep", "test", "meso", "rest"].includes(x.phase) &&
    Number.isInteger(x.week) &&
    x.week >= 0 &&
    x.week <= 8 &&
    Number.isInteger(x.day) &&
    x.day >= 0 &&
    x.day <= 2;
  if (
    !obj(p) ||
    typeof p.name !== "string" ||
    p.name.length > 32 ||
    typeof p.avatar !== "string" ||
    !EMOJIS.includes(p.avatar) ||
    !Array.isArray(p.cycles) ||
    !p.cycles.length ||
    p.cycles.length > 100 ||
    typeof p.activeCycle !== "string" ||
    (p.recoveryEnabled !== undefined &&
      typeof p.recoveryEnabled !== "boolean") ||
    (p.recoveryMembers !== undefined &&
      (!Array.isArray(p.recoveryMembers) ||
        p.recoveryMembers.length > 64 ||
        !p.recoveryMembers.every(
          (id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id),
        )))
  )
    return false;
  return p.cycles.every(
    (c) =>
      obj(c) &&
      typeof c.id === "string" &&
      /^[a-zA-Z0-9-]{1,100}$/.test(c.id) &&
      typeof c.name === "string" &&
      c.name.length <= 100 &&
      Number.isFinite(c.createdAt) &&
      obj(c.overrides) &&
      Object.entries(c.overrides).every(
        ([k, v]) =>
          k.length < 200 &&
          (v === null ||
            (typeof v === "string" && v.length < 200) ||
            (typeof v === "number" && Number.isFinite(v))),
      ) &&
      position(c.position) &&
      Array.isArray(c.done) &&
      c.done.length <= 100 &&
      c.done.every((k) => typeof k === "string" && k.length < 50) &&
      obj(c.logs) &&
      Object.values(c.logs).every(
        (l) =>
          obj(l) &&
          typeof l.name === "string" &&
          l.name.length < 200 &&
          Number.isInteger(l.reps) &&
          l.reps >= 1 &&
          l.reps <= 100 &&
          (l.weight === null ||
            (typeof l.weight === "number" &&
              Number.isFinite(l.weight) &&
              l.weight >= 0 &&
              l.weight <= 1500)) &&
          (l.rpe === null ||
            [6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].includes(l.rpe)) &&
          typeof l.date === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(l.date) &&
          Number.isFinite(l.at),
      ),
  );
}
export function validCode(s) {
  let rest = normalizeCode(s),
    n = 0;
  for (; rest; ) {
    const e = EMOJIS.map(normalizeCode).find((x) => rest.startsWith(x));
    if (!e) return false;
    rest = rest.slice(e.length);
    n++;
  }
  return n === 10;
}
async function hash(s) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof s === "string" ? new TextEncoder().encode(s) : s,
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function identity() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("zhmi:identity"));
  } catch {}
  if (saved) {
    const key = await crypto.subtle.importKey(
      "jwk",
      saved.private,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"],
    );
    return { ...saved, key };
  }
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pub = await crypto.subtle.exportKey("jwk", kp.publicKey),
    priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const id = await hash(await crypto.subtle.exportKey("raw", kp.publicKey));
  saved = { id, public: pub, private: priv };
  localStorage.setItem("zhmi:identity", JSON.stringify(saved));
  return { ...saved, key: kp.privateKey };
}
export class Room {
  constructor(code, ident, onChange, onStatus) {
    this.code = normalizeCode(code);
    this.ident = ident;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.records = {};
    this.connections = new Map();
    this.stopped = false;
    this.started = false;
    this.peers = new Set();
    this.online = new Set([ident.id]);
    this.access = new DeviceAccess(this);
    this.signing = Promise.resolve();
    try {
      this.records =
        JSON.parse(localStorage.getItem("zhmi:room:" + this.code)) || {};
    } catch {}
    this.onOnline = () => this.restart();
    this.onVisible = () => {
      if (document.visibilityState === "visible") this.restart();
    };
    window.addEventListener("online", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.start();
  }
  async start() {
    this.prefix = "zhmi-v1-" + (await hash(this.code)).slice(0, 32);
    if (this.stopped) return;
    this.claim();
    this.interval = setInterval(() => {
      this.lastTick = Date.now();
      if (!navigator.onLine) {
        this.onStatus("Офлайн · записи сохранены");
        return;
      }
      if (!this.peer || this.peer.destroyed) return this.claim();
      if (this.peer.disconnected) {
        try {
          this.peer.reconnect();
        } catch {
          this.restart();
        }
      }
      if (this.peer.open && !this.isHub && !this.connections.size)
        this.connectHub();
      for (const c of [...this.connections.values()]) {
        if (c.open && Date.now() - (c.lastSeen || Date.now()) > 16000) {
          c.close();
          this.connections.delete(c.peer);
          continue;
        }
        if (c.open) {
          try {
            c.send({ type: "ping" });
          } catch {
            c.close();
          }
        }
      }
      if (Date.now() - (this.lastBroadcast || 0) > 12000) {
        this.lastBroadcast = Date.now();
        this.broadcast({ type: "sync", records: Object.values(this.records) });
      }
    }, 4000);
  }
  claim() {
    if (this.stopped || !navigator.onLine)
      return this.onStatus("Офлайн · записи сохранены");
    if (!window.Peer)
      return this.onStatus("Связь недоступна · можно тренироваться");
    for (const c of this.connections.values()) {
      clearTimeout(c.connectionTimeout);
      c.close();
    }
    this.connections.clear();
    this.peer?.destroy();
    this.isHub = true;
    this.onStatus("Подключаем комнату…");
    this.makePeer(this.prefix);
  }
  makePeer(id) {
    const p = (this.peer = new window.Peer(id, { debug: 0 }));
    p.on("open", () => {
      if (this.stopped) return;
      p === this.peer &&
        this.onStatus(
          this.isHub ? "Вы в комнате · ждём друзей" : "Ищем напарников…",
        );
      if (!this.isHub) this.connectHub();
    });
    p.on("connection", (c) => this.attach(c));
    p.on("error", (e) => {
      if (p !== this.peer || this.stopped) return;
      if (e.type === "unavailable-id" && this.isHub) {
        p.destroy();
        this.isHub = false;
        this.makePeer(this.prefix + "-" + crypto.randomUUID());
      } else if (e.type === "peer-unavailable" && !this.isHub) {
        this.onStatus("Напарник не в сети · ждём подключения");
        clearTimeout(this.retry);
        this.retry = setTimeout(
          () => this.claim(),
          2000 + Math.random() * 5000,
        );
      } else if (
        e.type === "network" ||
        e.type === "server-error" ||
        e.type === "socket-error"
      )
        this.onStatus("Нет связи · записи сохранены");
    });
    p.on("disconnected", () => {
      if (p === this.peer) this.onStatus("Восстанавливаем соединение…");
    });
  }
  connectHub() {
    if (this.stopped || !this.peer?.open || this.connections.has(this.prefix))
      return;
    this.attach(
      this.peer.connect(this.prefix, {
        reliable: true,
        serialization: "binary",
      }),
    );
  }
  attach(c) {
    this.connections.set(c.peer, c);
    const ownerPeer = this.peer;
    const timeout = setTimeout(() => {
      if (!c.open) {
        c.close();
        if (this.connections.get(c.peer) === c) this.connections.delete(c.peer);
        if (!this.stopped && !this.isHub && this.peer === ownerPeer) {
          this.onStatus("Пробуем соединиться заново…");
          this.claim();
        }
      }
    }, 10000);
    c.connectionTimeout = timeout;
    c.on("open", () => {
      c.lastSeen = Date.now();
      clearTimeout(timeout);
      c.send({
        type: "sync",
        sender: this.ident.id,
        online: [...this.online],
        records: Object.values(this.records),
        ...this.access.packet(),
      });
      this.onStatus("Соединение установлено");
    });
    c.on("data", async (m) => {
      c.lastSeen = Date.now();
      if (m?.type === "ping") {
        if (c.open) c.send({ type: "pong" });
        return;
      }
      if (m?.type === "pong") return;
      if (!m || JSON.stringify(m).length > 4000000) return;
      if (m.type === "sync" && Array.isArray(m.records)) {
        let changed = false;
        for (const rec of m.records.slice(0, 64))
          if (await this.accept(rec)) {
            changed = true;
            if (this.isHub)
              this.broadcast({ type: "sync", records: [rec] }, c.peer);
          }
        if (await this.access.receive(m)) {
          changed = true;
          if (this.isHub)
            this.broadcast(
              { type: "sync", records: Object.values(this.records) },
              c.peer,
            );
        }
        if (changed) {
          this.persist();
          this.onChange();
        }
        const ids = [
          m.sender,
          ...(Array.isArray(m.online) ? m.online : []),
        ].filter((id) => typeof id === "string" && this.records[id]);
        c.memberIds = ids;
        this.refreshOnline();
      }
      if (
        m.type === "reaction" &&
        typeof m.emoji === "string" &&
        ["💪", "🔥", "👏", "🦍"].includes(m.emoji)
      ) {
        this.onReaction?.(m.emoji);
        if (this.isHub) this.broadcast(m, c.peer);
      }
    });
    c.on("close", () => {
      clearTimeout(timeout);
      if (this.connections.get(c.peer) === c) this.connections.delete(c.peer);
      this.refreshOnline();
      if (!this.stopped && !this.connections.size)
        this.onStatus(
          this.isHub ? "Вы в комнате · ждём друзей" : "Напарники не в сети",
        );
      if (!this.stopped && !this.isHub && !this.connections.size) {
        clearTimeout(this.connectionRetry);
        this.connectionRetry = setTimeout(
          () => {
            if (
              !this.stopped &&
              this.peer === ownerPeer &&
              !this.isHub &&
              !this.connections.size
            )
              this.claim();
          },
          600 + Math.random() * 1000,
        );
      }
    });
    c.on("error", () => {
      this.lastConnectionError = "Data channel error";
      c.close();
    });
  }
  refreshOnline() {
    this.online = new Set([
      this.ident.id,
      ...[...this.connections.values()]
        .filter((c) => c.open)
        .flatMap((c) => c.memberIds || []),
    ]);
    this.onChange();
  }
  async accept(rec) {
    try {
      const p = rec?.payload;
      if (
        !validDiary(p) ||
        p.room !== this.code ||
        typeof p.id !== "string" ||
        typeof p.rev !== "number" ||
        !Number.isSafeInteger(p.rev) ||
        p.rev < 0 ||
        !Array.isArray(p.cycles) ||
        p.cycles.length > 100
      )
        return false;
      if ((this.records[p.id]?.payload.rev ?? -1) >= p.rev) return false;
      if (p.registers) {
        if (
          typeof p.registers !== "object" ||
          Array.isArray(p.registers) ||
          Object.keys(p.registers).length > 50000 ||
          !Object.values(p.registers).every(
            (r) =>
              r &&
              Number.isSafeInteger(r.n) &&
              r.n >= 0 &&
              typeof r.d === "string" &&
              /^[a-f0-9]{64}$/.test(r.d) &&
              (r.deleted === true || Object.hasOwn(r, "v")),
          ) ||
          !validDiary(mergeDiaries([p]))
        )
          return false;
      }
      const pub = await crypto.subtle.importKey(
        "jwk",
        rec.public,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"],
      );
      if ((await hash(await crypto.subtle.exportKey("raw", pub))) !== p.id)
        return false;
      if (
        !(await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          pub,
          bytes(rec.signature),
          new TextEncoder().encode(JSON.stringify(p)),
        ))
      )
        return false;
      this.records[p.id] = rec;
      return true;
    } catch {
      return false;
    }
  }
  publish(payload) {
    this.signing = this.signing.then(async () => {
      if (this.stopped || this.access.mode === "existing") return;
      const p = { ...payload, room: this.code, id: this.ident.id };
      const signature = b64(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          this.ident.key,
          new TextEncoder().encode(JSON.stringify(p)),
        ),
      );
      const rec = { payload: p, public: this.ident.public, signature };
      this.records[p.id] = rec;
      this.persist();
      this.broadcast({ type: "sync", records: [rec] });
    });
    return this.signing;
  }
  broadcast(m, except) {
    if (m.type === "sync") m = { ...m, ...this.access.packet() };
    m = {
      ...m,
      sender: this.ident.id,
      online: this.isHub ? [...this.online] : [this.ident.id],
    };
    for (const c of this.connections.values())
      if (c.open && c.peer !== except) {
        try {
          this.lastWireBytes = new TextEncoder().encode(
            JSON.stringify(m),
          ).length;
          this.lastMaxMessageSize = c.peerConnection?.sctp?.maxMessageSize;
          c.send(m);
        } catch (e) {
          this.lastConnectionError = e.message;
        }
      }
  }
  react(emoji) {
    this.broadcast({ type: "reaction", emoji });
    this.onReaction?.(emoji);
  }
  persist() {
    try {
      localStorage.setItem(
        "zhmi:room:" + this.code,
        JSON.stringify(this.records),
      );
    } catch {
      this.onStatus("Память заполнена · экспортируйте резервную копию");
    }
  }
  restart() {
    if (
      !this.stopped &&
      (!this.peer?.open || (!this.connections.size && !this.isHub))
    )
      this.claim();
  }
  stop() {
    this.stopped = true;
    clearInterval(this.interval);
    clearTimeout(this.retry);
    clearTimeout(this.connectionRetry);
    this.peer?.destroy();
    window.removeEventListener("online", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisible);
  }
}
