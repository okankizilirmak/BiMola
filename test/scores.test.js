import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io as client} from 'socket.io-client';
import {createScores, playerToken} from '../server/platform/scores.js';
import {createGameServer} from '../server.js';
import {chunkText} from '../public/games/ates-koprusu/questions.js';

const event = (profileId, extra = {}) => ({profileId, name: 'Ada', matchId: 'match1', round: 1, points: 150, score: 150, streak: 1, correct: 1, answered: 1, ...extra});

test('durable scores survive restart, deduplicate rounds, compact and recover a truncated tail', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bimola-scores-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const logger = {warn() {}, error(error) { throw error; }};
  const store = createScores({directory, logger}), identity = store.identity();
  store.record('ates-koprusu', [event(identity.id), event(identity.id), event(identity.id, {round: 2, completed: true})]);
  const games = 1100;
  for (let i = 0; i < games; i++) store.record('ates-koprusu', [event(identity.id, {matchId: `other-${i}`, score: 400, streak: 5})]);
  await store.flush();
  const before = store.profile(identity.id);
  assert.equal(before.games['ates-koprusu'].total, 150 * (games + 1)); assert.equal(before.games['ates-koprusu'].played, 1);
  assert.equal(before.games['ates-koprusu'].best, 400); assert.equal(before.games['ates-koprusu'].streak, 5);
  await appendFile(join(directory, 'scores.jsonl'), '{"partial":');
  const reopened = createScores({directory, logger});
  assert.equal(reopened.resolve(identity.token), identity.id); assert.deepEqual(reopened.profile(identity.id), before);
  reopened.record('ates-koprusu', [event(identity.id, {matchId: 'last', score: 200})]); await reopened.flush();
  assert.equal(createScores({directory, logger}).profile(identity.id).games['ates-koprusu'].total, 150 * (games + 2));
  assert.equal(reopened.resolve('a'.repeat(64)), null);
  assert.equal(reopened.leaderboard('ates-koprusu', identity.id).rows[0].mine, true);
  assert.equal(reopened.leaderboard('ates-koprusu', identity.id).rows[0].key, undefined, 'private profile ids are never public');
  assert.equal(playerToken(`something=x; bimola-player=${identity.token}; another=y`), identity.token);
  assert.equal(playerToken('bimola-player=not-a-token'), null);
});

test('HTTP identity binds socket scores; custom-set points cannot be submitted by the browser', async t => {
  const server = createGameServer(); await new Promise(resolve => server.http.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.http.address().port}`;
  const identityResponse = await fetch(url + '/api/player'), cookie = identityResponse.headers.get('set-cookie').split(';')[0];
  const identity = await identityResponse.json(); assert.equal(identity.durable, false);
  const socket = client(url + '/games/ates-koprusu', {transports: ['websocket'], extraHeaders: {Cookie: cookie}, reconnection: false});
  t.after(() => socket.disconnect()); await new Promise(resolve => socket.once('connect', resolve));
  const joined = await socket.emitWithAck('join', {name: 'Ada'}), room = server.rooms.get(joined.code);
  const set = {schemaVersion: 1, title: 'Özel set', category: 'Test', language: 'tr', questions: Array.from({length: 3}, (_, i) => ({id: `q${i}`, text: `Soru ${i}?`, options: [{id: 'a', text: 'Evet'}, {id: 'b', text: 'Hayır'}], correctOptionId: 'a', difficulty: 1}))};
  const parts = chunkText(JSON.stringify(set));
  for (let index = 0; index < parts.length; index++) { if (index) await new Promise(resolve => setTimeout(resolve, 25)); assert.ok((await socket.emitWithAck('upload', {uploadId: 'test123', index, total: parts.length, chunk: parts[index]})).ok); }
  room.timing = {...room.timing, countdown: 10, question: 300, reveal: 15, pause: 15, lastCall: 15};
  const ended = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('game did not end')), 5000); t.after(() => clearTimeout(timeout));
    socket.on('state', state => {
      if (state.phase === 'question' && !state.question.choice) socket.emit('answer', room.current.correct);
      if (state.podium) { clearTimeout(timeout); resolve(state); }
    });
  });
  assert.ok((await socket.emitWithAck('ready', true)).ok); const result = await ended;
  const board = await (await fetch(url + '/api/games/ates-koprusu/scores', {headers: {Cookie: cookie}})).json();
  assert.equal(board.me.total, result.podium.ranking[0].score); assert.equal(board.me.correct, 3); assert.equal(board.me.played, 1);
  assert.equal(board.me.streak, 3); assert.equal(board.rows[0].name, 'Ada');
  assert.equal((await fetch(url + '/api/games/ates-koprusu/scores', {method: 'POST', headers: {'Content-Type': 'application/json', Cookie: cookie}, body: '{"total":999999}'})).status, 404);
  assert.equal((await fetch(url + '/api/games/unknown/scores')).status, 404);
});
