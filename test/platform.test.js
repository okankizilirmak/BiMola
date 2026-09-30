import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {io as client} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {createRegistry} from '../server/platform/registry.js';
import {games} from '../server/games/registry.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function event(socket, name, match = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out: ${name}`)); }, 3000);
    function receive(data) {
      if (!match(data)) return socket.once(name, receive);
      clearTimeout(timer); resolve(data);
    }
    socket.once(name, receive);
  });
}
async function setup(t, options = {}) {
  const server = createGameServer(options);
  await new Promise((resolve, reject) => { server.http.once('error', reject); server.http.listen(0, '127.0.0.1', resolve); });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.http.address().port}`;
  return {...server, url, async connect(id = 'prop-hunt') {
    const socket = client(`${url}/games/${id}`, {transports: ['websocket'], reconnection: false, forceNew: true});
    t.after(() => socket.disconnect());
    await event(socket, 'connect');
    return socket;
  }};
}
// A second, turn-based game with no teams, maps, physics or prop-hunt imports.
function counterGame(id, overrides = {}) {
  let loads = 0;
  const adapter = {
    snapshotInterval: 50,
    create: ({code, host}) => ({code, host, players: {}, phase: 'lobby', count: 0}),
    members: room => Object.values(room.players),
    canJoin: room => Object.keys(room.players).length < 2 ? {ok: true} : {error: 'full'},
    addPlayer: (room, {id, name}) => { room.players[id] = {id, name}; return {}; },
    removePlayer: (room, id) => { delete room.players[id]; },
    summary: room => ({players: Object.keys(room.players).length, capacity: 2, phase: room.phase, joinable: Object.keys(room.players).length < 2}),
    view: room => ({count: room.count}),
    tickInterval: () => 0,
    tick: () => ({}),
    commands: {increment: {interval: 100, publish: true, handle: room => { room.count++; return {ok: true}; }}},
    ...overrides,
  };
  return {manifest: {id, name: id, entry: `/games/${id}/`, namespace: `/games/${id}`, status: 'available', protocolVersion: 1}, load: async () => { loads++; return adapter; }, get loads() { return loads; }};
}

test('registry is lazy, deduplicates simultaneous loads and rejects invalid adapters', async () => {
  const game = counterGame('counter'), registry = createRegistry([game]);
  registry.list(); assert.equal(game.loads, 0);
  const [a, b] = await Promise.all([registry.load('counter'), registry.load('counter')]);
  assert.equal(a, b); assert.equal(game.loads, 1);
  assert.throws(() => createRegistry([game, game]), /duplicate/);
  const broken = counterGame('broken', {tick: null});
  const invalid = createRegistry([broken]);
  await assert.rejects(invalid.load('broken'), /tick/);
  await assert.rejects(invalid.load('broken'), /tick/);
  assert.equal(broken.loads, 2, 'failed loads are retryable');
});

test('catalog and lobby do not load an engine; shell stays below 40 KiB uncompressed', async t => {
  const g = await setup(t);
  const catalog = await (await fetch(g.url + '/api/games')).json();
  assert.equal(catalog[0].id, 'prop-hunt'); assert.equal(g.registry.adapter('prop-hunt'), undefined);
  const paths = ['public/index.html', 'public/platform/lobby.js', 'public/platform/lobby.css', 'public/platform/profile.js'];
  let size = 0;
  for (const path of paths) {
    size += (await stat(path)).size;
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /three\.module|socket\.io|createScene|WebGLRenderer/);
  }
  assert.ok(size < 40 * 1024, `${size} bytes exceeds lobby budget`);
  const html = await (await fetch(g.url)).text();
  assert.match(html, /BiMola/); assert.doesNotMatch(html, /<canvas/);
  for (const path of ['/platform/lobby.js', '/platform/profile.js', '/games/prop-hunt/', '/games/prop-hunt/app.js', catalog[0].cover]) assert.equal((await fetch(g.url + path)).status, 200, path);
});

test('two independent games: catalog, global codes, room filters and cross-game isolation', async t => {
  const counter = counterGame('counter'), g = await setup(t, {games: [...games, counter]});
  const a = await g.connect(), b = await g.connect('counter'), c = await g.connect('counter');
  const first = await a.emitWithAck('join', {name: 'Ada', settings: {botMode: 'off'}});
  const second = await b.emitWithAck('join', {name: 'Bora'});
  assert.notEqual(first.code, second.code);
  assert.equal(counter.loads, 1);
  assert.ok((await c.emitWithAck('join', {code: first.code})).error);
  const packet = event(b, 'state');
  assert.ok((await b.emitWithAck('increment')).ok);
  assert.equal((await packet).count, 1);
  assert.equal(g.rooms.get(first.code).count, undefined);
  const list = await (await fetch(g.url + '/api/rooms')).json();
  assert.deepEqual(new Set(list.map(room => room.gameId)), new Set(['prop-hunt', 'counter']));
  const filtered = await (await fetch(g.url + '/api/rooms?gameId=counter')).json();
  assert.equal(filtered.length, 1); assert.equal(filtered[0].code, second.code);
  const link = await (await fetch(g.url + '/api/rooms/' + second.code)).json();
  assert.equal(link.entry, `/games/counter/?room=${second.code}`);
  assert.equal((await fetch(g.url + '/api/rooms?gameId=missing')).status, 400);
  assert.equal((await fetch(g.url + '/api/rooms/invalid')).status, 404);
});

test('idle rooms have no ticks or recurring snapshots; commands publish immediately', async t => {
  const g = await setup(t, {games: [counterGame('counter')]});
  const socket = await g.connect('counter');
  const firstState = event(socket, 'state');
  await socket.emitWithAck('join', {}); await firstState;
  const before = {...g.metrics}; await delay(140);
  assert.equal(g.metrics.ticks, 0); assert.equal(g.metrics.snapshots, before.snapshots);
  const changed = event(socket, 'state');
  await socket.emitWithAck('increment'); assert.equal((await changed).count, 1);
  assert.ok((await socket.emitWithAck('increment')).error, 'burst is rate limited');
  socket.disconnect(); await delay(30); assert.equal(g.rooms.size, 0);
});

test('room limit preserves current membership; full and practice rooms cannot be joined through lookup', async t => {
  const g = await setup(t, {maxRooms: 1}); const a = await g.connect(), b = await g.connect();
  const made = await a.emitWithAck('join', {practice: true});
  assert.equal((await fetch(g.url + '/api/rooms/' + made.code)).status, 404);
  assert.ok((await b.emitWithAck('join', {})).error);
  await delay(360);
  assert.ok((await a.emitWithAck('join', {})).error);
  assert.ok(g.rooms.get(made.code).players[a.id], 'capacity rejection must not eject current player');
  a.disconnect(); await delay(30); assert.equal(g.rooms.size, 0);
});

test('active room schedules stop on last departure; room engine failures leave other games alive', async t => {
  const broken = counterGame('broken', {tickInterval: () => 25, tick() { throw new Error('fixture failure'); }});
  const g = await setup(t, {games: [broken, counterGame('counter')], logger: {error() {}}});
  const bad = await g.connect('broken'), good = await g.connect('counter');
  const failure = event(bad, 'room-error');
  await bad.emitWithAck('join', {}); const made = await good.emitWithAck('join', {});
  assert.match((await failure).error, /Oda/); assert.equal(g.metrics.failedRooms, 1);
  assert.ok((await good.emitWithAck('increment')).ok); assert.equal(g.rooms.size, 1);
  assert.ok(g.rooms.has(made.code));
  good.disconnect(); await delay(50); const ticks = g.metrics.ticks;
  await delay(70); assert.equal(g.metrics.ticks, ticks); assert.equal(g.rooms.size, 0);
});

test('real-time room broadcasts are bounded and a stopped voting clock still publishes its result', async t => {
  const g = await setup(t), socket = await g.connect();
  const made = await socket.emitWithAck('join', {practice: true});
  const first = event(socket, 'state'); await socket.emitWithAck('ready'); await first;
  const before = g.metrics.snapshots; await delay(230);
  assert.ok(g.metrics.snapshots > before); assert.ok(g.metrics.snapshots - before <= 6);
  const room = g.rooms.get(made.code);
  room.phase = 'end'; room.vote = {options: ['market', 'greenhouse'], until: Date.now(), votes: {}, closed: false, winner: null};
  const result = await event(socket, 'state', packet => packet.vote?.closed === true);
  assert.equal(result.vote.closed, true);
  const snapshots = g.metrics.snapshots; await delay(100);
  assert.equal(g.metrics.snapshots, snapshots, 'closed vote has no periodic work');
  socket.disconnect(); await delay(30); assert.equal(g.rooms.size, 0);
});
