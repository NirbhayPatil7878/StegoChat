const DB = "stegochat-e2ee";
const STORE = "identities";
const enc = new TextEncoder();
// React StrictMode can start the chat effect twice; share one create/register
// operation per account so both callers use the same private key.
const identitySetups = new Map<number, Promise<CryptoKeyPair>>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getIdentity(userId: number): Promise<CryptoKeyPair | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(String(userId));
    request.onsuccess = () => resolve(request.result as CryptoKeyPair | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function saveIdentityIfAbsent(userId: number, keys: CryptoKeyPair): Promise<CryptoKeyPair> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const request = transaction.objectStore(STORE).add(keys, String(userId));
    let inserted = false;

    request.onsuccess = () => {
      inserted = true;
    };
    request.onerror = (event) => {
      if (request.error?.name === "ConstraintError") {
        // Another tab may have created the account identity first. Keep its
        // private key instead of replacing it with this tab's generated key.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      reject(request.error ?? new Error("Could not save the encryption key."));
    };
    transaction.oncomplete = () => {
      if (inserted) {
        resolve(keys);
        return;
      }
      getIdentity(userId).then(
        (existing) => existing
          ? resolve(existing)
          : reject(new Error("Could not load the existing encryption key.")),
        reject,
      );
    };
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the encryption key."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Could not save the encryption key."));
  });
}

function b64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function unb64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function pem(bytes: Uint8Array): string {
  const body = b64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

export function ensureE2EEIdentity(userId: number, register: (key: string) => Promise<void>) {
  const pending = identitySetups.get(userId);
  if (pending) return pending;

  const setup = (async () => {
    let keys = await getIdentity(userId);
    if (!keys) {
      const generated = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
      // Keep a non-extractable private CryptoKey in IndexedDB.
      const pkcs8 = await crypto.subtle.exportKey("pkcs8", generated.privateKey);
      const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
      keys = await saveIdentityIfAbsent(userId, { publicKey: generated.publicKey, privateKey });
    }
    const exported = await crypto.subtle.exportKey("spki", keys.publicKey);
    await register(pem(new Uint8Array(exported)));
    return keys;
  })();

  identitySetups.set(userId, setup);
  const clearPending = () => {
    if (identitySetups.get(userId) === setup) identitySetups.delete(userId);
  };
  void setup.then(clearPending, clearPending);
  return setup;
}

export async function getLocalIdentity(userId: number) {
  const keys = await getIdentity(userId);
  if (!keys) throw new Error("This device has no encryption key for this account. Key recovery is not configured.");
  return keys;
}

async function randomPassword() {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

async function deriveOffset(password: string, slots: number) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(password)));
  return new DataView(digest.buffer).getUint32(0, false) % slots;
}

async function imageCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser could not open this image.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

function bit(data: Uint8ClampedArray, slot: number, value?: number): number {
  const index = slot * 4 + 2;
  if (value === undefined) return data[index] & 1;
  data[index] = (data[index] & 0xfe) | value;
  return value;
}

function bytesToBits(data: Uint8Array): number[] {
  const out: number[] = [];
  for (const value of data) for (let shift = 7; shift >= 0; shift--) out.push((value >> shift) & 1);
  return out;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  bits.forEach((v, i) => { bytes[i >> 3] |= v << (7 - (i & 7)); });
  return bytes;
}

async function blobWithPayload(cover: Blob, password: string, payload: Uint8Array): Promise<Blob> {
  const canvas = await imageCanvas(cover);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const header = new Uint8Array(4);
  new DataView(header.buffer).setUint32(0, payload.length, false);
  const bits = bytesToBits(new Uint8Array([...header, ...payload]));
  const slots = canvas.width * canvas.height;
  if (bits.length > slots) throw new Error("This cover image is too small for the encrypted message.");
  const offset = await deriveOffset(password, slots);
  bits.forEach((v, i) => bit(image.data, (offset + i) % slots, v));
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode the E2EE image.")), "image/png"));
}

async function readPayload(blob: Blob, password: string): Promise<Uint8Array> {
  const canvas = await imageCanvas(blob);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const slots = canvas.width * canvas.height;
  const offset = await deriveOffset(password, slots);
  const headerBits = Array.from({ length: 32 }, (_, i) => bit(data, (offset + i) % slots));
  const header = bitsToBytes(headerBits);
  const length = new DataView(header.buffer).getUint32(0, false);
  if (!length || 32 + length * 8 > slots) throw new Error("No valid E2EE payload was found in this image.");
  const bits = Array.from({ length: length * 8 }, (_, i) => bit(data, (offset + 32 + i) % slots));
  return bitsToBytes(bits);
}

export async function createE2EEImage(cover: Blob, message: string, recipientKeys: Array<{ user_id: number; public_key: string }>) {
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const password = await randomPassword();
  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, enc.encode(message)));
  const packed = new Uint8Array(nonce.length + ciphertext.length);
  packed.set(nonce); packed.set(ciphertext, nonce.length);
  const image = await blobWithPayload(cover, password, packed);
  const keyBundle = enc.encode(b64(contentKey));
  const passwordBundle = enc.encode(password);
  const envelopes = await Promise.all(recipientKeys.map(async (recipient) => {
    const pemText = recipient.public_key.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
    const publicKey = await crypto.subtle.importKey("spki", asArrayBuffer(unb64(pemText)), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    const [wrappedKey, wrappedPassword] = await Promise.all([
      crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, keyBundle),
      crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, passwordBundle),
    ]);
    return { user_id: recipient.user_id, envelope: JSON.stringify({ content_key: b64(wrappedKey), carrier_password: b64(wrappedPassword) }) };
  }));
  contentKey.fill(0);
  return { image, envelopes };
}

export async function decryptE2EEImage(image: Blob, envelopeText: string, privateKey: CryptoKey): Promise<string> {
  try {
    const envelope = JSON.parse(envelopeText) as { content_key: string; carrier_password: string };
    const [keyBytes, passwordBytes] = await Promise.all([
      crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, asArrayBuffer(unb64(envelope.content_key))),
      crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, asArrayBuffer(unb64(envelope.carrier_password))),
    ]);
    const packed = await readPayload(image, new TextDecoder().decode(passwordBytes));
    if (packed.length < 29) throw new Error("Encrypted payload is truncated.");
    const key = await crypto.subtle.importKey("raw", asArrayBuffer(unb64(new TextDecoder().decode(keyBytes))), "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, key, packed.slice(12));
    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw new Error("Could not decrypt this image. It may be corrupted or your device key may not match.");
  }
}

