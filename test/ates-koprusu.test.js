import test from 'node:test';
import assert from 'node:assert/strict';
import {io as client} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {createRoom, addPlayer, removePlayer, start, answer, tick, reveal, upload, removeQueued, view, pointsFor, STARTER_SET, MAX_QUEUE} from '../server/games/ates-koprusu/game.js';
import {adapter} from '../server/games/ates-koprusu/adapter.js';
import {parseSet, validateSet, buildPrompt, chunkText, extractJson, LIMITS} from '../public/games/ates-koprusu/questions.js';

const fast = {question: 200, reveal: 60, pause: 40, lastCall: 20, lateJoin: 50};
function room(players = ['a', 'b'], now = 0) {
  const r = createRoom({code: '1000', host: players[0], timing: {question: 12000, reveal: 4000, pause: 2000, lastCall: 1500, lateJoin: 3000}});
  for (const id of players) addPlayer(r, {id, name: id.toUpperCase()}, now);
  return r;
}
const correctFor = r => r.current.correct;
const wrongFor = r => r.current.tokens.find(t => t !== r.current.correct);
function sampleSet(count = 5, extra = {}) {
  return {schemaVersion: 1, title: 'Deneme', category: 'Test', language: 'tr', ...extra, questions: Array.from({length: count}, (_, i) => ({
    id: `q${i}`, difficulty: 1, text: `Soru ${i}?`, options: [{id: 'x', text: 'Evet'}, {id: 'y', text: 'Hayır'}, {id: 'z', text: 'Belki'}].slice(0, 2 + (i % 2)), correctOptionId: 'x', explanation: 'Çünkü.',
  }))};
}

test('starter set is valid, mixes 2/3/4 options and blends history with today', () => {
  assert.equal(STARTER_SET.questions.length, 30);
  const counts = new Set(STARTER_SET.questions.map(q => q.options.length));
  assert.deepEqual([...counts].sort(), [2, 3, 4]);
  assert.ok(STARTER_SET.questions.some(q => /20(0|1|2)\d/.test(q.text + q.explanation)), 'contains recent events');
  assert.ok(STARTER_SET.questions.some(q => /1453|1071|Hitit/.test(q.text)), 'contains history');
});

test('validation reports fixable, numbered errors and tolerates code fences', () => {
  const bad = sampleSet(5); bad.questions[2].correctOptionId = 'nope'; bad.questions[3].options = [{id: 'x', text: 'Tek'}]; bad.questions[4].options[1].id = 'x';
  const {errors} = validateSet(bad);
  assert.ok(errors.some(e => /3\. soruda doğru cevap kimliği/.test(e)));
  assert.ok(errors.some(e => /4\. soruda 2–4 seçenek/.test(e)));
  assert.ok(errors.some(e => /5\. soruda seçenek kimliği "x" tekrar/.test(e)));
  assert.ok(parseSet('{bozuk').errors[0].startsWith('Geçerli JSON değil'));
  assert.ok(parseSet('```json\n' + JSON.stringify(sampleSet()) + '\n```').set);
  assert.equal(extractJson('Buyur: {"a":1} umarım işine yarar'), '{"a":1}');
  assert.ok(validateSet(sampleSet(4)).errors[0].includes('5–80'));
  assert.ok(validateSet({...sampleSet(), schemaVersion: 2}).errors.some(e => /schemaVersion/.test(e)));
});

test('prompt carries the panel values and schema; chunks rebuild the exact text under the packet limit', () => {
  const prompt = buildPrompt({title: 'Osmanlı "Gecesi"', category: 'Tarih', count: 12, theme: 'Lale Devri'});
  assert.match(prompt, /12 soruluk/); assert.match(prompt, /Tarih/); assert.match(prompt, /Lale Devri/); assert.match(prompt, /correctOptionId/);
  assert.doesNotMatch(prompt, /Osmanlı "Gecesi"/, 'quotes are neutralised');
  const source = JSON.stringify(sampleSet(60)).repeat(3) + '"ğüşİö🔥'.repeat(500);
  const chunks = chunkText(source);
  assert.equal(chunks.join(''), source);
  for (const chunk of chunks) assert.ok(Buffer.byteLength(JSON.stringify({uploadId: 'abcd1234', index: 39, total: 40, chunk})) < 4000);
});

test('options are shuffled per player, tokens hide ids, and nothing leaks before reveal', () => {
  const orders = new Set();
  for (let i = 0; i < 20; i++) {
    const r = room(['a', 'b', 'c']); start(r, 'a', 0);
    const va = view(r, 'a', 1), vb = view(r, 'b', 1);
    orders.add(va.question.options.map(o => o.text).join('|') + '#' + vb.question.options.map(o => o.text).join('|'));
    assert.equal(va.question.correct, undefined); assert.equal(va.question.results, undefined);
    const optionIds = r.current.question.options.map(o => o.id);
    for (const o of va.question.options) assert.ok(!optionIds.includes(o.id), 'original option ids are not sent');
    answer(r, 'b', vb.question.options[0].id, 5);
    const again = view(r, 'a', 6);
    assert.equal(JSON.stringify(again).includes(vb.question.options[0].id) && again.question.options.every(o => o.id !== vb.question.options[0].id) ? 'leak' : 'ok', 'ok');
    assert.equal(again.players.find(p => p.id === 'b').ready, true, 'only readiness is public');
    assert.equal(view(r, 'b', 6).question.choice, vb.question.options[0].id);
  }
  assert.ok(orders.size > 1, 'different players get different orders');
});

test('same physical lane can be right for one player and wrong for another', () => {
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const r = room(); start(r, 'a', 0);
    const oa = r.current.orders.a, ob = r.current.orders.b;
    const lane = oa.indexOf(correctFor(r));
    if (ob[lane] === correctFor(r)) continue;
    answer(r, 'a', oa[lane], 1); answer(r, 'b', ob[lane], 1);
    reveal(r, 2);
    const res = view(r, 'a', 2).question.results;
    assert.deepEqual([res.a.lane, res.a.correct, res.b.lane, res.b.correct], [lane, true, lane, false]);
    found = true;
  }
  assert.ok(found);
});

test('scoring: streak curve caps at 200, wrong resets streak and falls back one step, never below zero', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(pointsFor), [0, 100, 125, 150, 175, 200, 200]);
  const r = room(['a']); start(r, 'a', 0);
  const play = (ok, now) => { answer(r, 'a', ok ? correctFor(r) : wrongFor(r), now); r.until = now; tick(r, now); tick(r, r.until); tick(r, r.until); };
  let now = 0;
  for (let i = 0; i < 6; i++) play(true, now += 100);
  const p = r.players.a;
  assert.deepEqual([p.score, p.streak, p.position, p.bestStreak], [100 + 125 + 150 + 175 + 200 + 200, 6, 6, 6]);
  play(false, now += 100);
  assert.deepEqual([p.score, p.streak, p.position, p.bestStreak], [950, 0, 5, 6]);
  play(true, now += 100); assert.equal(p.score, 1050, 'next correct is worth 100 again');
  const fresh = room(['z']); start(fresh, 'z', 0); fresh.until = 0; tick(fresh, 0);
  assert.deepEqual([fresh.players.z.position, fresh.players.z.score, fresh.current.results.z.answered], [0, 0, false], 'blank answer is wrong, position floors at 0');
  assert.equal(p.recent.length, 8); assert.deepEqual(p.recent.slice(-2), [false, true]);
});

test('a result is written once; late answers, foreign tokens and late joiners are handled', () => {
  const r = room(['a']); start(r, 'a', 0);
  assert.ok(answer(r, 'a', 'deadbeef', 1).error);
  answer(r, 'a', correctFor(r), 1);
  reveal(r, 2); reveal(r, 3);
  assert.equal(r.players.a.score, 100);
  assert.ok(answer(r, 'a', correctFor(r), 4).error, 'no answers after lock');
  r.phase = 'question'; r.until = 12000; addPlayer(r, {id: 'late', name: 'L'}, 10000);
  assert.ok(answer(r, 'late', r.current.orders.late[0], 10001).error, 'last-second joiner sits out');
  reveal(r, 12000); assert.equal(r.current.results.late.skip, true); assert.equal(r.players.late.streak, 0);
  addPlayer(r, {id: 'mid', name: 'M'}, 12001); assert.ok(r.current.orders.mid, 'joiner during reveal still gets an order');
});

test('everyone answered shortens the wait; phases cycle endlessly and reshuffle the set', () => {
  const r = room(['a', 'b']); start(r, 'a', 0);
  answer(r, 'a', correctFor(r), 100); assert.equal(r.until, 12000);
  answer(r, 'b', wrongFor(r), 200); assert.equal(r.until, 1700);
  let now = 0; const seen = [];
  for (let i = 0; i < 31 * 3; i++) { now = r.until; tick(r, now); if (r.phase === 'question') seen.push(r.current.question.id); }
  assert.equal(new Set(seen.slice(0, 29)).size, 29);
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], 'no immediate repeats');
  assert.ok(seen.length >= 30);
});

test('only the host starts; host role moves on leave', () => {
  const r = room(['a', 'b']);
  assert.ok(start(r, 'b', 0).error); assert.ok(start(r, 'a', 0).ok); assert.ok(start(r, 'a', 1).error);
  removePlayer(r, 'a'); assert.equal(r.host, 'b'); assert.equal(r.current.orders.a, undefined);
});

test('chunked uploads: lobby replaces the starter, running game queues without interrupting, limits hold', () => {
  const send = (r, id, text, uploadId = 'up01') => { const parts = chunkText(text); let result; parts.forEach((chunk, index) => { result = upload(r, id, {uploadId, index, total: parts.length, chunk}); }); return result; };
  const r = room(['a', 'b']);
  const first = send(r, 'b', JSON.stringify(sampleSet(40)));
  assert.equal(first.done, true); assert.equal(first.active, true); assert.equal(r.active.set.title, 'Deneme');
  start(r, 'a', 0); const currentId = r.current.question.id;
  assert.equal(send(r, 'b', JSON.stringify(sampleSet(6, {title: 'Sıradaki'})), 'up02').active, false);
  assert.equal(r.current.question.id, currentId, 'current question is untouched');
  assert.equal(view(r, 'b', 1).queue[0].title, 'Sıradaki'); assert.equal(view(r, 'b', 1).queue[0].mine, true);
  const invalid = send(r, 'a', JSON.stringify(sampleSet(3)), 'up03');
  assert.ok(invalid.error && invalid.errors.length);
  assert.ok(upload(r, 'a', {uploadId: 'up04', index: 1, total: 2, chunk: 'x'}).error, 'out-of-order chunk');
  assert.ok(upload(r, 'a', {uploadId: 'up05', index: 0, total: 999, chunk: 'x'}).error);
  assert.ok(removeQueued(r, 'x', {index: 0}).error); assert.ok(removeQueued(r, 'b', {index: 0}).ok);
  for (let i = 0; i < MAX_QUEUE; i++) assert.ok(send(r, 'a', JSON.stringify(sampleSet(5, {title: `S${i}`})), `qq${i}x`).done);
  assert.ok(send(r, 'a', JSON.stringify(sampleSet(5)), 'full1').error, 'queue is bounded');
  for (let i = 0; i < 40 * 3 + 3; i++) { r.until = 0; tick(r, 0); }
  assert.equal(r.active.set.title, 'S0', 'queued set starts at the set boundary');
  const big = upload(r, 'a', {uploadId: 'big1', index: 0, total: 40, chunk: 'x'.repeat(LIMITS.bytes + 1)});
  assert.ok(big.error);
});

test('adapter contract: capacity, summary, idle rooms do not tick', () => {
  const r = adapter.create({code: '1234', host: 'a', data: {}});
  for (let i = 0; i < 12; i++) adapter.addPlayer(r, {id: `p${i}`, name: `P${i}`, data: {}});
  assert.ok(adapter.canJoin(r).error);
  assert.equal(adapter.tickInterval(r), 0);
  assert.deepEqual([adapter.summary(r).phase, adapter.summary(r).joinable, adapter.summary(r).capacity], ['lobby', false, 12]);
});

test('network: two players, separate rooms, per-player order and a full question cycle', async t => {
  const g = createGameServer();
  await new Promise(resolve => g.http.listen(0, '127.0.0.1', resolve)); t.after(() => g.close());
  const url = `http://127.0.0.1:${g.http.address().port}/games/ates-koprusu`;
  const connect = async () => { const s = client(url, {transports: ['websocket'], reconnection: false, forceNew: true}); t.after(() => s.disconnect()); await new Promise(r => s.once('connect', r)); return s; };
  const a = await connect(), b = await connect(), c = await connect();
  const made = await a.emitWithAck('join', {name: 'Ada'});
  assert.ok((await b.emitWithAck('join', {name: 'Bora', code: made.code})).code);
  const other = await c.emitWithAck('join', {name: 'Cem'});
  assert.notEqual(other.code, made.code);
  const rooms = await (await fetch(url.replace('/games/ates-koprusu', '/api/rooms?gameId=ates-koprusu'))).json();
  assert.equal(rooms.length, 2);
  const room = g.rooms.get(made.code); room.timing = {...fast};
  const stateB = new Promise(resolve => b.on('state', s => { if (s.phase === 'question') resolve(s); }));
  assert.ok((await b.emitWithAck('start')).error, 'guest cannot start');
  assert.ok((await a.emitWithAck('start')).ok);
  const sb = await stateB;
  assert.equal(sb.gameId, 'ates-koprusu'); assert.equal(sb.question.correct, undefined);
  assert.equal(g.rooms.get(other.code).phase, 'lobby', 'other room is untouched');
  const revealed = new Promise(resolve => b.on('state', s => { if (s.phase === 'reveal') resolve(s); }));
  assert.ok((await b.emitWithAck('answer', sb.question.options[0].id)).ok);
  const rv = await revealed;
  assert.ok(rv.question.correct); assert.equal(rv.question.results[b.id].lane, 0);
  a.disconnect(); b.disconnect(); await new Promise(r => setTimeout(r, 60));
  assert.equal(g.rooms.has(made.code), false, 'empty room is removed');
});
