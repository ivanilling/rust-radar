/**
 * Поиск живых Rust-серверов (Steam master-server выведен Valve из эксплуатации,
 * поэтому список берём из открытого каталога gamemonitoring.net) и проверка A2S:
 *  1) gamedig (как в a2sScanner) — что видим мы;
 *  2) сырой A2S_PLAYER — есть ли 8-байтовое расширение со SteamID у Facepunch-серверов.
 * Запуск: npm run find-servers
 */
import dgram from 'node:dgram';
import { GameDig } from 'gamedig';

const LIST_URL = 'https://api.gamemonitoring.net/servers?game=252490&limit=15';

async function fetchServerList() {
  const res = await fetch(LIST_URL, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  const json = await res.json();
  const items = json?.response?.items || [];
  return [...new Set(items.map((s) => `${s.ip}:${s.port}`))];
}

/** Прямой A2S_PLAYER-запрос с разбором сырых байтов. */
function a2sPlayerRaw(host, port, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    let finished = false;
    const done = (fn) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('a2s timeout'))), timeoutMs);

    sock.on('message', (msg) => {
      if (msg[4] === 0x41) {
        const out = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55]), msg.subarray(5, 9)]);
        sock.send(out, port, host);
        return;
      }
      if (msg[4] === 0x44) {
        let pos = 5;
        const count = msg[pos++];
        const players = [];
        for (let i = 0; i < count; i++) {
          const index = msg[pos++];
          let end = pos;
          while (end < msg.length && msg[end] !== 0) end++;
          const name = msg.subarray(pos, end).toString('utf8');
          pos = end + 1;
          if (pos + 8 > msg.length) { players.push({ name, truncated: true }); break; }
          const score = msg.readInt32LE(pos); pos += 4;
          const duration = msg.readFloatLE(pos); pos += 4;
          const bytesLeft = msg.length - pos;
          // если после duration идут ещё 8 байт перед следующим игроком — это SteamID (расширение Rust)
          let steamId64 = null;
          if (bytesLeft >= 8 && i < count - 1) {
            const sid = msg.readBigUInt64LE(pos);
            if (sid >= 76561196000000000n && sid < 80000000000000000n) {
              steamId64 = sid.toString();
              pos += 8;
            }
          } else if (bytesLeft === 8 && i === count - 1) {
            const sid = msg.readBigUInt64LE(pos);
            if (sid >= 76561196000000000n && sid < 80000000000000000n) {
              steamId64 = sid.toString();
              pos += 8;
            }
          }
          players.push({ name, score, duration, steamId64 });
        }
        done(() => resolve({ count, players, consumed: pos, totalLen: msg.length }));
      }
    });

    sock.bind(() => {
      sock.send(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55, 0xff, 0xff, 0xff, 0xff]), port, host);
    });
  });
}

const list = await fetchServerList();
console.log(`Каталог вернул ${list.length} Rust-серверов\n`);
if (list.length === 0) process.exit(1);

let answered = [];
for (const addr of list.slice(0, 12)) {
  const [host, port] = addr.split(':');
  try {
    const state = await GameDig.query({
      type: 'rust', host, port: Number(port),
      givenPortOnly: true, socketTimeout: 2500, maxRetries: 1,
    });
    answered.push(addr);
    const names = (state.players || []).map((p) => p.name).filter(Boolean).slice(0, 6);
    console.log(`[gamedig] ${addr} OK  "${String(state.name).slice(0, 45)}"  players=${state.numplayers}/${state.maxplayers}`);
    if (names.length) console.log(`          имена: ${JSON.stringify(names)}`);
  } catch (err) {
    console.log(`[gamedig] ${addr} FAIL ${err.message.split('\n')[0]}`);
  }
}

for (const addr of answered.slice(0, 3)) {
  const [host, port] = addr.split(':');
  try {
    const raw = await a2sPlayerRaw(host, Number(port));
    console.log(`\n[raw A2S_PLAYER] ${addr} count=${raw.count} parsedBytes=${raw.consumed}/${raw.totalLen}`);
    for (const p of raw.players.slice(0, 8)) {
      console.log(`  ${JSON.stringify(p)}`);
    }
  } catch (err) {
    console.log(`[raw A2S_PLAYER] ${addr} FAIL ${err.message}`);
  }
}
