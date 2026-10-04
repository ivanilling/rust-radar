/**
 * Локальный мок Rust-сервера: UDP, протокол A2S (A2S_INFO + A2S_PLAYER + A2S_RULES)
 * ровно в том виде, который парсит gamedig (EDF 0x01|0x80|0x10, challenge для player/rules).
 * Используется smoke-тестом, т.к. из этой сети исходящий UDP на игровые порты закрыт.
 */
import dgram from 'node:dgram';

const CHALLENGE = Buffer.from([0x11, 0x22, 0x33, 0x44]);
const SERVER_STEAMID = 90123456789012345n;

/** players: массив { name, score, durationSec } */
export const mockServerState = {
  name: 'Mock Rust Server [RU/SMOKE]',
  map: 'Procedural Map',
  maxPlayers: 200,
  players: [
    { name: 'Enemy Alpha', score: 3, durationSec: 840 },
    { name: 'Bravo Boy', score: 0, durationSec: 60 },
    { name: 'Random Dude', score: 1, durationSec: 3600 },
  ],
};

export function addPlayer(name) {
  if (!mockServerState.players.some((p) => p.name === name)) {
    mockServerState.players.push({ name, score: 0, durationSec: 30 });
  }
}

export function removePlayer(name) {
  mockServerState.players = mockServerState.players.filter((p) => p.name !== name);
}

const writeStr = (bufList, s) => {
  bufList.push(Buffer.from(String(s), 'utf8'), Buffer.from([0x00]));
};

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]); // обязательный префикс всех A2S-ответов

function infoPacket() {
  const b = [HEADER];
  b.push(Buffer.from([0x49])); // header 'I'
  b.push(Buffer.from([17])); // protocol
  writeStr(b, mockServerState.name);
  writeStr(b, mockServerState.map);
  writeStr(b, 'rust'); // folder
  writeStr(b, 'rust'); // game
  b.push(Buffer.from([0xea, 0xd9])); // appid uint16 (обрезка 252490 до 16 бит — как у реальных серверов)
  b.push(Buffer.from([mockServerState.players.length, mockServerState.maxPlayers, 0])); // players, max, bots
  b.push(Buffer.from([0x64, 0x77])); // servertype 'd', environment 'w'
  b.push(Buffer.from([0x00])); // password
  b.push(Buffer.from([0x01])); // secure (VAC)
  writeStr(b, '2352.0.107.0'); // version
  // EDF: 0x80 gameport | 0x10 server steamid | 0x01 gameid (gamedig по нему распознаёт Rust)
  b.push(Buffer.from([0x91]));
  const port = Buffer.alloc(2);
  port.writeUInt16LE(mockPort);
  b.push(port);
  const sid = Buffer.alloc(8);
  sid.writeBigUInt64LE(SERVER_STEAMID);
  b.push(sid);
  const gameId = Buffer.alloc(8);
  gameId.writeBigUInt64LE(252490n);
  b.push(gameId);
  return Buffer.concat(b);
}

function playerPacket() {
  // тело БЕЗ FFFFFFFF-префикса (его добавляет отправитель вместе с байтом типа 0x44)
  const b = [Buffer.from([0x44, mockServerState.players.length])];
  mockServerState.players.forEach((p, i) => {
    b.push(Buffer.from([i & 0xff]));
    writeStr(b, p.name);
    const score = Buffer.alloc(4);
    score.writeInt32LE(p.score);
    b.push(score);
    const dur = Buffer.alloc(4);
    dur.writeFloatLE(p.durationSec);
    b.push(dur);
  });
  return Buffer.concat(b);
}

function rulesPacket() {
  const rules = [
    ['Celsius', '15'],
    ['WorldSeed', '1337001'],
    ['WorldSize', '4000'],
  ];
  const b = [Buffer.from([0x45, rules.length])];
  for (const [k, v] of rules) {
    writeStr(b, k);
    writeStr(b, v);
  }
  return Buffer.concat(b);
}

let mockPort = 39003;

export function startMockRustServer(port = 39003) {
  mockPort = port;
  const sock = dgram.createSocket('udp4');

  sock.on('message', (msg, rinfo) => {
    if (msg.length < 5) return;
    const type = msg[4];
    const challengeIn = msg.subarray(5, 9);

    if (type === 0x54) {
      // A2S_INFO — отвечаем сразу без challenge (gamedig поддерживает)
      sock.send(infoPacket(), rinfo.port, rinfo.address);
      return;
    }

    if (type === 0x55 || type === 0x56) {
      const needChallenge = type === 0x55 ? 0x44 : 0x45;
      if (challengeIn.length < 4 || !challengeIn.equals(CHALLENGE)) {
        // ещё нет валидного challenge → отдаём challenge (0x41)
        sock.send(
          Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41]), CHALLENGE]),
          rinfo.port,
          rinfo.address
        );
        return;
      }
      const body = needChallenge === 0x44 ? playerPacket() : rulesPacket();
      sock.send(
        Buffer.concat([HEADER, body]), // тело уже содержит байт типа (0x44/0x45)
        rinfo.port,
        rinfo.address
      );
    }
  });

  return new Promise((resolve, reject) => {
    sock.on('error', reject);
    sock.bind(port, '127.0.0.1', () => resolve(sock));
  });
}
