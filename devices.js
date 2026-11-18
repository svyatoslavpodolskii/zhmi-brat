import { mergeDiaries } from "./sync-state.js";
const encode = (x) => new TextEncoder().encode(JSON.stringify(x));
const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function fingerprint(pub) {
  const key = await crypto.subtle.importKey(
    "jwk",
    pub,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return digest(await crypto.subtle.exportKey("raw", key));
}
export async function signFrame(ident, payload) {
  return {
    payload,
    public: ident.public,
    signature: b64(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        ident.key,
        encode(payload),
      ),
    ),
  };
}
export async function verifyFrame(frame) {
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      frame.public,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      bytes(frame.signature),
      encode(frame.payload),
    );
  } catch {
    return false;
  }
}
export async function pairingCode(frame) {
  const h = await digest(encode(frame.payload));
  return (
    [
      "💪",
      "🐻",
      "🦍",
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
    ][parseInt(h[0], 16)] +
    " " +
    [
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
      "🐯",
      "🦁",
      "🐙",
      "🌵",
      "🏋️",
    ][parseInt(h[1], 16)] +
    " " +
    h.slice(2, 6).toUpperCase()
  );
}
export class DeviceAccess {
  constructor(room) {
    this.room = room;
    this.links = {};
    this.requests = {};
    this.codes = {};
    this.mode = "new";
    try {
      this.links =
        JSON.parse(localStorage.getItem("zhmi:device-links:" + room.code)) ||
        {};
      this.ownRequest = JSON.parse(
        localStorage.getItem("zhmi:device-request:" + room.code),
      );
      if (this.ownRequest) {
        this.mode = "existing";
        this.requests[this.ownRequest.payload.requestId] = this.ownRequest;
        pairingCode(this.ownRequest)
          .then((code) => {
            this.codes[this.ownRequest.payload.requestId] = code;
            room.onChange();
          })
          .catch(() => {});
      }
    } catch {}
  }
  canonical(id) {
    return this.links[id]?.payload.memberId || id;
  }
  get ownId() {
    return this.canonical(this.room.ident.id);
  }
  members() {
    const groups = {};
    for (const r of Object.values(this.room.records)) {
      const id = this.canonical(r.payload.id);
      (groups[id] ??= []).push(r.payload);
    }
    return Object.entries(groups).map(([id, states]) => ({
      id,
      ...mergeDiaries(states),
      id,
    }));
  }
  member(id) {
    return this.members().find((p) => p.id === this.canonical(id));
  }
  online(id) {
    const root = this.canonical(id);
    return [...this.room.online].some((d) => this.canonical(d) === root);
  }
  packet() {
    return {
      links: Object.values(this.links),
      requests: Object.values(this.requests)
        .filter((r) => r.payload.expiresAt > Date.now())
        .slice(0, 12),
    };
  }
  persist() {
    localStorage.setItem(
      "zhmi:device-links:" + this.room.code,
      JSON.stringify(this.links),
    );
    if (this.ownRequest)
      localStorage.setItem(
        "zhmi:device-request:" + this.room.code,
        JSON.stringify(this.ownRequest),
      );
    else localStorage.removeItem("zhmi:device-request:" + this.room.code);
  }
  async request(target, label) {
    const p = {
      kind: "device-request",
      room: this.room.code,
      requestId: crypto.randomUUID(),
      requester: this.room.ident.id,
      target,
      label: label.slice(0, 40),
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60000,
    };
    const f = await signFrame(this.room.ident, p);
    this.ownRequest = f;
    this.mode = "existing";
    this.requests[p.requestId] = f;
    this.codes[p.requestId] = await pairingCode(f);
    this.persist();
    this.room.broadcast({
      type: "sync",
      records: Object.values(this.room.records),
    });
    this.room.onChange();
    return f;
  }
  async validRequest(f, live = true) {
    const p = f?.payload;
    return (
      !!p &&
      p.kind === "device-request" &&
      p.room === this.room.code &&
      typeof p.requestId === "string" &&
      typeof p.target === "string" &&
      p.requester !== p.target &&
      typeof p.label === "string" &&
      p.label.length <= 40 &&
      Number.isFinite(p.createdAt) &&
      Number.isFinite(p.expiresAt) &&
      p.expiresAt - p.createdAt <= 600001 &&
      p.expiresAt >= p.createdAt &&
      (!live ||
        (p.expiresAt > Date.now() && p.createdAt < Date.now() + 60000)) &&
      (await fingerprint(f.public)) === p.requester &&
      (await verifyFrame(f))
    );
  }
  async receive(m) {
    let changed = false;
    for (const f of (m.requests || []).slice(0, 12))
      if (await this.validRequest(f)) {
        const id = f.payload.requestId;
        if (!this.requests[id]) {
          this.requests[id] = f;
          this.codes[id] = await pairingCode(f);
          changed = true;
        }
      }
    const links = (m.links || []).slice(0, 64);
    for (let pass = 0; pass < Math.min(links.length + 1, 8); pass++) {
      let accepted = false;
      for (const l of links)
        if (!this.links[l?.payload?.deviceId] && (await this.acceptLink(l))) {
          accepted = true;
          changed = true;
        }
      if (!accepted) break;
    }
    if (changed) this.persist();
    return changed;
  }
  canApprove(request) {
    const p = request?.payload,
      target = this.member(p?.target);
    if (!target || this.mode === "existing") return false;
    return (
      this.ownId === p.target ||
      (target.recoveryEnabled !== false &&
        target.recoveryMembers?.includes(this.ownId))
    );
  }
  async approve(requestId) {
    await this.room.signing;
    const request = this.requests[requestId];
    if (!(await this.validRequest(request)) || !this.canApprove(request))
      throw Error("Это устройство не может подтвердить восстановление");
    const target = this.member(request.payload.target);
    const targetProof = Object.values(this.room.records)
      .filter((r) => this.canonical(r.payload.id) === target.id)
      .sort((a, b) => b.payload.rev - a.payload.rev)
      .find(
        (r) =>
          this.ownId === target.id ||
          (r.payload.recoveryEnabled !== false &&
            r.payload.recoveryMembers?.includes(this.ownId)),
      );
    const issuerProof = this.room.records[this.room.ident.id];
    if (!targetProof || !issuerProof)
      throw Error("Дождитесь синхронизации профиля");
    const payload = {
      kind: "device-link",
      room: this.room.code,
      memberId: request.payload.target,
      deviceId: request.payload.requester,
      issuer: this.room.ident.id,
      issuedAt: Date.now(),
      mode: this.ownId === target.id ? "self" : "recovery",
      request,
      targetProof,
      issuerProof,
    };
    const frame = await signFrame(this.room.ident, payload);
    if (!(await this.acceptLink(frame)))
      throw Error("Не удалось проверить разрешение");
    this.persist();
    this.room.broadcast({
      type: "sync",
      records: Object.values(this.room.records),
    });
    this.room.onChange();
    return frame;
  }
  async acceptLink(f) {
    try {
      const p = f?.payload;
      if (
        p?.kind !== "device-link" ||
        p.room !== this.room.code ||
        p.deviceId === p.issuer ||
        p.deviceId === p.memberId ||
        this.links[p.deviceId] ||
        !(await this.validRequest(p.request, false)) ||
        p.request.payload.requester !== p.deviceId ||
        p.request.payload.target !== p.memberId ||
        p.issuedAt < p.request.payload.createdAt ||
        p.issuedAt > p.request.payload.expiresAt ||
        (await fingerprint(f.public)) !== p.issuer ||
        !(await verifyFrame(f))
      )
        return false;
      for (const proof of [p.targetProof, p.issuerProof])
        if (
          proof?.payload?.room !== this.room.code ||
          (await fingerprint(proof.public)) !== proof.payload.id ||
          !(await verifyFrame(proof))
        )
          return false;
      if (
        p.issuerProof.payload.id !== p.issuer ||
        this.canonical(p.targetProof.payload.id) !== p.memberId
      )
        return false;
      const issuer = this.canonical(p.issuer);
      if (p.mode === "self") {
        if (issuer !== p.memberId) return false;
      } else if (p.mode === "recovery") {
        if (
          issuer === p.memberId ||
          p.targetProof.payload.recoveryEnabled === false ||
          !p.targetProof.payload.recoveryMembers?.includes(issuer)
        )
          return false;
      } else return false;
      this.links[p.deviceId] = f;
      return true;
    } catch {
      return false;
    }
  }
  get approved() {
    return (
      this.ownRequest &&
      this.links[this.room.ident.id]?.payload.memberId ===
        this.ownRequest.payload.target
    );
  }
  confirm() {
    if (!this.approved) throw Error("Сначала нужно подтверждение");
    this.mode = "new";
    this.ownRequest = null;
    this.persist();
    return this.member(this.ownId);
  }
  cancel() {
    if (!this.links[this.room.ident.id]) {
      this.ownRequest = null;
      this.mode = "new";
      this.persist();
    }
  }
}
