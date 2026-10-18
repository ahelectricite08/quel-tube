const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BROKER = "wss://test.mosquitto.org:8081/mqtt";

export function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((value) => ALPHABET[value % ALPHABET.length]).join("");
}

export function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "");
}

export function formatCode(code) {
  return normalizeCode(code).replace(/(.{4})/g, "$1 ").trim();
}

async function secretKey(code) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`tournee:${normalizeCode(code)}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function topicFor(code) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`topic:${normalizeCode(code)}`));
  const hex = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `lea-tournee/v1/${hex.slice(0, 32)}`;
}

export async function encryptState(code, data) {
  const key = await secretKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data))));
  const payload = new Uint8Array(iv.length + cipher.length);
  payload.set(iv, 0);
  payload.set(cipher, iv.length);
  return payload;
}

export async function decryptState(code, payload) {
  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
  const key = await secretKey(code);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
  return JSON.parse(new TextDecoder().decode(plain));
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function remainingBytes(length) {
  const bytes = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length > 0) digit |= 0x80;
    bytes.push(digit);
  } while (length > 0);
  return new Uint8Array(bytes);
}

function field(text) {
  const body = new TextEncoder().encode(text);
  return concat([new Uint8Array([(body.length >> 8) & 255, body.length & 255]), body]);
}

function packet(type, body) {
  return concat([new Uint8Array([type]), remainingBytes(body.length), body]);
}

function connectPacket(clientId) {
  const body = concat([
    field("MQTT"),
    new Uint8Array([4, 0x02, 0x00, 30]),
    field(clientId),
  ]);
  return packet(0x10, body);
}

function subscribePacket(topic) {
  const body = concat([new Uint8Array([0x00, 0x01]), field(topic), new Uint8Array([0])]);
  return packet(0x82, body);
}

function publishPacket(topic, payload) {
  const body = concat([field(topic), payload]);
  return packet(0x31, body);
}

function readRemaining(buffer, offset) {
  let value = 0;
  let shift = 0;
  let used = 0;
  while (offset + used < buffer.length && used < 4) {
    const digit = buffer[offset + used];
    used += 1;
    value += (digit & 127) * (2 ** shift);
    shift += 7;
    if ((digit & 128) === 0) return { value, used };
  }
  return null;
}

export function chooseSide(local, remote) {
  const localPatients = local?.patients?.length || 0;
  const remotePatients = remote?.patients?.length || 0;
  if (localPatients && !remotePatients) return "local";
  if (!localPatients && remotePatients) return "remote";
  const localAt = local?.updatedAt || 0;
  const remoteAt = remote?.updatedAt || 0;
  if (remoteAt > localAt) return "remote";
  if (localAt > remoteAt) return "local";
  return "same";
}

export function openSync(code, handlers) {
  const clean = normalizeCode(code);
  let stopped = false;
  let socket = null;
  let buffer = new Uint8Array(0);
  let connected = false;
  let pending = null;
  let retry = 1000;
  let ping = 0;
  let opened = false;

  function send(bytes) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(bytes);
  }

  function publish(payload) {
    pending = payload;
    if (!connected) return;
    topicFor(clean).then((topic) => {
      if (pending === payload && connected) send(publishPacket(topic, payload));
    }).catch(() => handlers.onStatus?.("L'envoi a échoué"));
  }

  function takePacket() {
    if (buffer.length < 2) return null;
    const size = readRemaining(buffer, 1);
    if (!size) return null;
    const total = 1 + size.used + size.value;
    if (buffer.length < total) return null;
    const type = buffer[0] >> 4;
    const body = buffer.slice(1 + size.used, total);
    buffer = buffer.slice(total);
    return { type, body };
  }

  function onPacket(message) {
    const chunk = new Uint8Array(message.data);
    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer, 0);
    next.set(chunk, buffer.length);
    buffer = next;
    let packetInfo = takePacket();
    while (packetInfo) {
      if (packetInfo.type === 2 && !connected) {
        connected = true;
        opened = true;
        retry = 1000;
        handlers.onStatus?.("Relié. Un changement ici arrive sur l'autre appareil.");
        topicFor(clean).then((topic) => {
          if (!connected) return;
          send(subscribePacket(topic));
          if (pending) send(publishPacket(topic, pending));
        }).catch(() => handlers.onStatus?.("Liaison impossible"));
        clearInterval(ping);
        ping = setInterval(() => send(new Uint8Array([0xc0, 0x00])), 20000);
      }
      if (packetInfo.type === 3 && packetInfo.body.length > 2) {
        const topicLength = (packetInfo.body[0] << 8) + packetInfo.body[1];
        const payload = packetInfo.body.slice(2 + topicLength);
        decryptState(clean, payload).then((remote) => handlers.onState?.(remote)).catch(() => handlers.onStatus?.("Code incorrect, ou données illisibles"));
      }
      packetInfo = takePacket();
    }
  }

  function connect() {
    if (stopped) return;
    buffer = new Uint8Array(0);
    const clientId = `tour${Math.random().toString(16).slice(2, 10)}`;
    socket = new WebSocket(BROKER, ["mqtt"]);
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      send(connectPacket(clientId));
    });
    socket.addEventListener("message", onPacket);
    socket.addEventListener("close", () => {
      connected = false;
      clearInterval(ping);
      if (stopped) return;
      handlers.onStatus?.(opened ? "Liaison coupée, nouvelle tentative…" : "Liaison impossible pour le moment");
      setTimeout(connect, retry);
      retry = Math.min(retry * 2, 15000);
    });
    socket.addEventListener("error", () => socket.close());
  }

  connect();
  return {
    publish,
    close() {
      stopped = true;
      clearInterval(ping);
      socket?.close();
    },
  };
}
