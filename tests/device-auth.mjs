import assert from "node:assert/strict";
import { DeviceAccess, fingerprint, signFrame } from "../dist/devices.js";
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
};
async function ident() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    id: await fingerprint(publicKey),
    public: publicKey,
    key: pair.privateKey,
  };
}
const owner = await ident(),
  friend = await ident(),
  outsider = await ident(),
  phone = await ident(),
  code = "room-fixture";
const snapshot = async (who, contacts = []) =>
  signFrame(who, {
    id: who.id,
    room: code,
    rev: 1,
    recoveryMembers: contacts,
    recoveryEnabled: true,
  });
const ownerProof = await snapshot(owner, [friend.id]),
  friendProof = await snapshot(friend),
  outsiderProof = await snapshot(outsider);
const request = await signFrame(phone, {
  kind: "device-request",
  room: code,
  requestId: crypto.randomUUID(),
  requester: phone.id,
  target: owner.id,
  label: "Телефон",
  createdAt: Date.now() - 100,
  expiresAt: Date.now() + 599000,
});
async function grant(issuer, mode, issuerProof) {
  return signFrame(issuer, {
    kind: "device-link",
    room: code,
    memberId: owner.id,
    deviceId: phone.id,
    issuer: issuer.id,
    issuedAt: Date.now(),
    mode,
    request,
    targetProof: ownerProof,
    issuerProof,
  });
}
const room = {
  code,
  ident: owner,
  records: {
    [owner.id]: ownerProof,
    [friend.id]: friendProof,
    [outsider.id]: outsiderProof,
  },
};
const self = await grant(owner, "self", ownerProof),
  recovery = await grant(friend, "recovery", friendProof),
  attack = await grant(outsider, "recovery", outsiderProof);
let access = new DeviceAccess(room);
assert.equal(await access.acceptLink(self), true);
assert.equal(access.canonical(phone.id), owner.id);
assert.equal(await access.acceptLink(self), false);
access = new DeviceAccess(room);
assert.equal(await access.acceptLink(recovery), true);
access = new DeviceAccess(room);
assert.equal(await access.acceptLink(attack), false);
const tampered = structuredClone(self);
tampered.payload.memberId = outsider.id;
assert.equal(await access.acceptLink(tampered), false);
const other = new DeviceAccess({ ...room, code: "another-room" });
assert.equal(await other.acceptLink(self), false);
console.log(
  "Device approvals, trusted recovery, tampering, replay and room binding passed",
);
