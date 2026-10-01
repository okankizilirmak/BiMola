import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server.js';

test('Snake appears in the BiMola catalog with its own game entry', async t => {
  const server = createGameServer();
  await new Promise((resolve, reject) => {
    server.http.once('error', reject);
    server.http.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.http.address().port}`;
  const catalog = await (await fetch(`${base}/api/games`)).json();
  const snake = catalog.find(game => game.id === 'snake');
  assert.ok(snake, 'Snake must be registered as an available game');
  assert.equal(snake.name, 'Yılan Meydanı');
  assert.equal(snake.entry, '/games/snake/');
  assert.equal((await fetch(`${base}${snake.entry}`)).status, 200);
});

async function setup(t) {
  const {io: client} = await import('socket.io-client');
  const server = createGameServer();
  await new Promise((resolve, reject) => {
    server.http.once('error', reject);
    server.http.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.http.address().port}`;
  async function connect() {
    const socket = client(`${base}/games/snake`, {transports: ['websocket'], reconnection: false, timeout: 1500});
    t.after(() => socket.disconnect());
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  return {server, base, connect};
}

test('Snake rooms isolate state, expose links, and transfer host on leave', async t => {
  const {server, base, connect} = await setup(t);
  const a = await connect(), b = await connect(), c = await connect();
  const first = await a.emitWithAck('join', {name: 'Ada'});
  const second = await b.emitWithAck('join', {name: 'Bora'});
  assert.notEqual(first.code, second.code);
  assert.equal((await c.emitWithAck('join', {code: first.code, name: 'Cem'})).code, first.code);
  assert.equal((await fetch(`${base}/api/rooms/${first.code}`).then(r => r.json())).entry, `/games/snake/?room=${first.code}`);
  const roomA = server.rooms.get(first.code), roomB = server.rooms.get(second.code);
  assert.equal(roomA.state.playerOrder.length, 2);
  assert.equal(roomB.state.playerOrder.length, 1);
  assert.equal(roomA.host, a.id);
  a.emit('leave');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(roomA.host, c.id);
  assert.equal(roomB.host, b.id);
  c.disconnect(); b.disconnect();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(server.rooms.size, 0);
});

test('Snake host controls and direction commands are room-scoped and validated', async t => {
  const {server, connect} = await setup(t);
  const host = await connect(), guest = await connect();
  const joined = await host.emitWithAck('join', {name: 'Ada'});
  await guest.emitWithAck('join', {name: 'Bora', code: joined.code});
  const room = server.rooms.get(joined.code);
  assert.ok((await guest.emitWithAck('set_grid_size', {gridSize: 32})).error);
  assert.equal(room.state.gridSize, 64);
  assert.ok((await host.emitWithAck('set_grid_size', {gridSize: 32})).ok);
  assert.equal(room.state.gridSize, 32);
  assert.ok((await guest.emitWithAck('turn', {direction: 'SIDEWAYS'})).error);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.ok((await guest.emitWithAck('turn', {direction: 'LEFT'})).ok);
  assert.ok((await host.emitWithAck('set_bot_count', {botCount: 2})).ok);
  assert.equal(room.state.playerOrder.filter(id => room.state.players[id].isBot).length, 2);
  assert.equal((await guest.emitWithAck('restart')).error != null, true);
});

test('invited human replaces a bot in a full Snake room', async t => {
  const {server, connect} = await setup(t);
  const host = await connect(), guest = await connect();
  const joined = await host.emitWithAck('join', {name: 'Ada'});
  assert.ok((await host.emitWithAck('set_bot_count', {botCount: 3})).ok);
  const room = server.rooms.get(joined.code);
  assert.equal(room.state.playerOrder.length, 4);
  assert.equal(room.state.playerOrder.filter(id => room.state.players[id].isBot).length, 3);
  const result = await guest.emitWithAck('join', {code: joined.code, name: 'Bora'});
  assert.equal(result.code, joined.code);
  assert.equal(room.state.playerOrder.filter(id => room.state.players[id].isBot).length, 2);
  assert.equal(room.state.playerOrder.length, 4);
});

test('Snake state packets retain each player identity and protocol metadata', async t => {
  const {connect} = await setup(t);
  const socket = await connect();
  const state = new Promise(resolve => socket.once('state', resolve));
  const joined = await socket.emitWithAck('join', {name: 'Ada'});
  const packet = await state;
  assert.equal(packet.gameId, 'snake');
  assert.equal(packet.protocolVersion, 1);
  assert.equal(packet.me, socket.id);
  assert.equal(packet.hostId, socket.id);
  assert.equal(packet.code, joined.code);
  assert.ok(packet.players.some(player => player.id === socket.id && player.name === 'Ada'));
});

test('Snake enforces the platform player and arena limits for direct socket commands', async t => {
  const {server, base, connect} = await setup(t);
  const catalog = await (await fetch(`${base}/api/games`)).json();
  assert.equal(catalog.find(game => game.id === 'snake').maxPlayers, 12);
  const host = await connect();
  const joined = await host.emitWithAck('join', {name: 'Ada'});
  const room = server.rooms.get(joined.code);
  assert.ok((await host.emitWithAck('set_grid_size', {gridSize: 512})).ok);
  assert.equal(room.state.gridSize, 128);
  assert.ok((await host.emitWithAck('set_max_players', {maxPlayers: 100})).ok);
  assert.equal(room.state.maxPlayers, 12);
  assert.ok((await host.emitWithAck('set_bot_count', {botCount: 100})).ok);
  assert.equal(room.state.botCount, 11);
  assert.equal(room.state.playerOrder.length, 12);
});
