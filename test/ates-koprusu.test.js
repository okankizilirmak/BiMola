import test from 'node:test';
import assert from 'node:assert/strict';
import {io as client} from 'socket.io-client';
import {createGameServer} from '../server.js';
import {createRoom, addPlayer, removePlayer, setReady, answer, useJoker, tick, reveal, upload, removeSet, view, pointsFor, speedBonus, STARTER_SET, MAX_POOL_SETS, TIMING} from '../server/games/ates-koprusu/game.js';
import {adapter} from '../server/games/ates-koprusu/adapter.js';
import {parseSet, validateSet, buildPrompt, chunkText, extractJson, LIMITS} from '../public/games/ates-koprusu/questions.js';

function room(players = ['a', 'b'], now = 0) {
  const r = createRoom({code: '1000', host: players[0]});
  for (const id of players) addPlayer(r, {id, name: id.toUpperCase()}, now);
  return r;
}
// Herkes hazır → geri sayım → oyun başlar.
function begin(r, now = 0) {
  for (const id of Object.keys(r.players)) setReady(r, id, true, now);
  assert.equal(r.phase, 'countdown');
  tick(r, r.until); assert.equal(r.phase, 'question');
  return r.until - r.timing.question;
}
const correctFor = r => r.current.correct;
const wrongFor = r => r.current.tokens.find(t => t !== r.current.correct);
const finish = r => { r.until = 0; tick(r, 0); };          // soru → sonuç
const next = r => { r.until = 0; tick(r, 0); r.until = 0; tick(r, 0); }; // sonuç → ara → sonraki soru
function sampleSet(count = 5, extra = {}) {
  return {schemaVersion: 1, title: 'Deneme', category: 'Test', language: 'tr', ...extra, questions: Array.from({length: count}, (_, i) => ({
    id: `q${i}`, difficulty: 1, text: `${extra.title || 'Deneme'} sorusu ${i}?`, options: [{id: 'x', text: 'Evet'}, {id: 'y', text: 'Hayır'}, {id: 'z', text: 'Belki'}, {id: 'w', text: 'Asla'}].slice(0, 2 + (i % 3)), correctOptionId: 'x', explanation: 'Çünkü.',
  }))};
}
function send(r, id, set, uploadId = 'up01') {
  const parts = chunkText(JSON.stringify(set)); let result;
  parts.forEach((chunk, index) => { result = upload(r, id, {uploadId, index, total: parts.length, chunk}); });
  return result;
}

test('starter set is valid, mixes 2/3/4 options and blends history with today', () => {
  assert.equal(STARTER_SET.questions.length, 30);
  assert.deepEqual([...new Set(STARTER_SET.questions.map(q => q.options.length))].sort(), [2, 3, 4]);
  assert.ok(STARTER_SET.questions.some(q => /20(0|1|2)\d/.test(q.text + q.explanation)));
  assert.ok(STARTER_SET.questions.some(q => /1453|1071|Hitit/.test(q.text)));
});

test('validation: numbered errors, fences tolerated, small sets (3+) allowed', () => {
  const bad = sampleSet(5); bad.questions[2].correctOptionId = 'nope'; bad.questions[3].options = [{id: 'x', text: 'Tek'}]; bad.questions[4].options[1].id = 'x';
  const {errors} = validateSet(bad);
  assert.ok(errors.some(e => /3\. soruda doğru cevap kimliği/.test(e)));
  assert.ok(errors.some(e => /4\. soruda 2–4 seçenek/.test(e)));
  assert.ok(errors.some(e => /5\. soruda seçenek kimliği "x" tekrar/.test(e)));
  assert.ok(parseSet('{bozuk').errors[0].startsWith('Geçerli JSON değil'));
  assert.ok(parseSet('```json\n' + JSON.stringify(sampleSet()) + '\n```').set);
  assert.equal(extractJson('Buyur: {"a":1} umarım işine yarar'), '{"a":1}');
  assert.ok(validateSet(sampleSet(3)).set, '3 soruluk set geçerli');
  assert.ok(validateSet(sampleSet(2)).errors[0].includes('3–80'));
  assert.match(buildPrompt({}), /10 soruluk/, 'varsayılan 10 soru');
});

test('prompt carries the panel values; chunks rebuild the exact text under the packet limit', () => {
  const prompt = buildPrompt({title: 'Osmanlı "Gecesi"', category: 'Tarih', count: 12, theme: 'Lale Devri'});
  assert.match(prompt, /12 soruluk/); assert.match(prompt, /Lale Devri/); assert.doesNotMatch(prompt, /Osmanlı "Gecesi"/);
  const source = JSON.stringify(sampleSet(60)).repeat(3) + '"ğüşİö🔥'.repeat(500);
  const chunks = chunkText(source);
  assert.equal(chunks.join(''), source);
  for (const chunk of chunks) assert.ok(Buffer.byteLength(JSON.stringify({uploadId: 'abcd1234', index: 39, total: 40, chunk})) < 4000);
});

test('ready check: nothing starts until everyone is ready; unready cancels the countdown; a leaver can complete it', () => {
  const r = room(['a', 'b', 'c']);
  setReady(r, 'a', true, 0); setReady(r, 'b', true, 0);
  assert.equal(r.phase, 'lobby'); assert.equal(adapter.tickInterval(r), 0, 'idle lobby does not tick');
  setReady(r, 'c', true, 0); assert.equal(r.phase, 'countdown'); assert.equal(r.until, TIMING.countdown);
  setReady(r, 'b', false, 10); assert.equal(r.phase, 'lobby');
  removePlayer(r, 'b', 20); assert.equal(r.phase, 'countdown', 'the only unready player left');
  tick(r, 100); assert.equal(r.phase, 'countdown'); tick(r, r.until); assert.equal(r.phase, 'question');
  assert.ok(setReady(r, 'a', false, 0).error, 'ready toggles are closed while playing');
  addPlayer(r, {id: 'late', name: 'Late'}, 0); assert.equal(r.players.late.ready, false);
});

test('pool: everyone uploads (even during ready or a game); all sets merge into one game; empty pool uses the starter', () => {
  const r = room(['a', 'b']);
  setReady(r, 'a', true, 0);
  assert.ok(send(r, 'a', sampleSet(10, {title: 'Ada seti'})).done, 'ready player can still upload');
  assert.ok(send(r, 'b', sampleSet(4, {title: 'Bora seti'}), 'up02').done);
  assert.equal(view(r, 'a', 0).poolTotal, 14);
  assert.equal(view(r, 'b', 0).pool[1].mine, true);
  assert.ok(removeSet(r, 'b', {index: 0}).error, 'only uploader or host removes');
  setReady(r, 'b', true, 0); tick(r, r.until);
  assert.equal(r.current.total, 14); assert.equal(r.pool.length, 0, 'pool is consumed by the game');
  assert.deepEqual(new Set(r.deck.questions.map(q => q.setTitle)), new Set(['Ada seti', 'Bora seti']));
  const during = send(r, 'a', sampleSet(3, {title: 'Sonraki'}), 'up03');
  assert.equal(during.nextGame, true); assert.equal(r.current.total, 14, 'current game is untouched');
  const fresh = room(['z']); begin(fresh); assert.equal(fresh.current.total, 30, 'starter set when pool is empty');
  for (let i = 0; i < MAX_POOL_SETS - 1; i++) assert.ok(send(r, 'b', sampleSet(3, {title: `S${i}`}), `qq${i}x`).done);
  assert.ok(send(r, 'b', sampleSet(3, {title: 'Fazla'}), 'full1').error, 'pool is bounded');
  assert.ok(upload(r, 'a', {uploadId: 'up04', index: 1, total: 2, chunk: 'x'}).error, 'out-of-order chunk');
  assert.ok(send(room(['q']), 'q', sampleSet(2), 'bad1').errors, 'invalid sets report errors');
});

test('game ends when the pool is exhausted, shows a podium with awards and returns to the ready lobby', () => {
  const r = room(['a', 'b']);
  send(r, 'a', sampleSet(5, {title: 'Kısa'}));
  begin(r);
  for (let i = 0; i < 5; i++) { answer(r, 'a', correctFor(r), 1); answer(r, 'b', wrongFor(r), 1); finish(r); if (i < 4) next(r); }
  r.until = 0; tick(r, 0); r.until = 0; tick(r, 0);
  assert.equal(r.phase, 'lobby', 'no restart of the same set');
  const v = view(r, 'b', 0);
  assert.equal(v.podium.ranking[0].name, 'A'); assert.equal(v.podium.total, 5);
  assert.ok(v.podium.awards.some(a => a.title === 'En uzun ateş' && a.name === 'A'));
  assert.ok(v.podium.awards.some(a => a.title === 'Kütük mıknatısı' && a.name === 'B'));
  assert.equal(v.question, null); assert.ok(v.players.every(p => !p.ready));
  begin(r); assert.equal(r.players.a.score, 0, 'a new game resets scores'); assert.equal(r.podium, null);
});

test('options are shuffled per player, tokens hide ids, and nothing leaks before reveal', () => {
  const orders = new Set();
  for (let i = 0; i < 20; i++) {
    const r = room(['a', 'b', 'c']); begin(r);
    const va = view(r, 'a', 1), vb = view(r, 'b', 1);
    orders.add(va.question.options.map(o => o.text).join('|') + '#' + vb.question.options.map(o => o.text).join('|'));
    assert.equal(va.question.correct, undefined); assert.equal(va.question.results, undefined);
    const ids = r.current.question.options.map(o => o.id);
    for (const o of va.question.options) assert.ok(!ids.includes(o.id));
    answer(r, 'b', vb.question.options[0].id, 5);
    const again = view(r, 'a', 6);
    assert.equal(again.players.find(p => p.id === 'b').hasAnswered, true, 'only readiness is public');
    assert.ok(!JSON.stringify(again.players).includes(vb.question.options[0].id));
  }
  assert.ok(orders.size > 1);
});

test('same physical lane can be right for one player and wrong for another', () => {
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const r = room(); begin(r);
    const oa = r.current.orders.a, ob = r.current.orders.b, lane = oa.indexOf(correctFor(r));
    if (ob[lane] === correctFor(r)) continue;
    answer(r, 'a', oa[lane], 1); answer(r, 'b', ob[lane], 1); reveal(r, 2);
    const res = view(r, 'a', 2).question.results;
    assert.deepEqual([res.a.lane, res.a.correct, res.b.lane, res.b.correct], [lane, true, lane, false]);
    found = true;
  }
  assert.ok(found);
});

test('scoring: streak curve + graded speed bonus; wrong resets streak and falls back one step', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(pointsFor), [0, 100, 125, 150, 175, 200, 200]);
  assert.deepEqual([0, 3000, 6000, 11000, 12000, 15000].map(t => speedBonus(t, 12000)), [50, 40, 25, 5, 0, 0]);
  const r = room(['a', 'b']); const start = begin(r);
  answer(r, 'a', correctFor(r), start + 0); answer(r, 'b', correctFor(r), start + 9000); finish(r);
  const res = r.current.results;
  assert.ok(res.a.points > res.b.points, 'faster player earns a little more');
  assert.equal(res.a.points - res.b.points, res.a.speed - res.b.speed);
  assert.ok(res.a.points - res.b.points <= 50);
  next(r); answer(r, 'a', wrongFor(r), 1); finish(r);
  assert.deepEqual([r.players.a.streak, r.players.a.position, r.current.results.a.points], [0, 0, 0]);
  next(r); finish(r); assert.equal(r.current.results.b.answered, false, 'blank answer counts as wrong');
  assert.equal(r.players.b.position, 0, 'position floors at zero');
});

test('a result is written once; late answers and last-second joiners are handled', () => {
  const r = room(['a']); begin(r);
  assert.ok(answer(r, 'a', 'deadbeef', 1).error);
  answer(r, 'a', correctFor(r), 1); reveal(r, 2); const score = r.players.a.score; reveal(r, 3);
  assert.equal(r.players.a.score, score);
  assert.ok(answer(r, 'a', correctFor(r), 4).error);
  r.phase = 'question'; r.until = 12000; addPlayer(r, {id: 'late', name: 'L'}, 10000);
  assert.ok(answer(r, 'late', r.current.orders.late[0], 10001).error);
  reveal(r, 12000); assert.equal(r.current.results.late.skip, true);
});

test('jokers: x2 doubles, shield blocks the log, 50/50 removes wrong options, each once per game', () => {
  const r = room(['a', 'b']); begin(r);
  while (r.current.tokens.length < 4) { finish(r); next(r); }
  const start = r.current.startedAt;
  assert.ok(useJoker(r, 'a', {type: 'double'}, start).ok);
  assert.ok(useJoker(r, 'a', {type: 'double'}, start).error, 'no double use in one question');
  assert.ok(useJoker(r, 'b', {type: 'shield'}, start).ok);
  assert.ok(useJoker(r, 'b', {type: 'half'}, start).ok);
  const vb = view(r, 'b', start);
  assert.equal(vb.question.options.filter(o => o.removed).length, 2);
  assert.ok(!vb.question.options.find(o => o.id === correctFor(r)).removed, 'the correct option survives');
  assert.ok(answer(r, 'b', vb.question.options.find(o => o.removed).id, start + 1).error, 'removed option is not selectable');
  assert.equal(view(r, 'a', start).question.options.filter(o => o.removed).length, 0, '50/50 is private');
  const before = {...r.players.b};
  answer(r, 'a', correctFor(r), r.current.startedAt); answer(r, 'b', wrongFor(r) === vb.question.options.find(o => o.removed)?.id ? correctFor(r) : wrongFor(r), start + 2);
  finish(r);
  const res = r.current.results;
  assert.equal(res.a.mult, r.current.golden ? 4 : 2); assert.equal(res.a.points, (res.a.base + res.a.speed) * res.a.mult);
  if (!res.b.correct) { assert.equal(res.b.shielded, true); assert.equal(r.players.b.position, before.position); assert.equal(r.players.b.hits, before.hits); }
  assert.ok(r.feed.some(f => /x2/.test(f.text)) && r.feed.some(f => /kalkan/.test(f.text)));
  next(r); assert.ok(useJoker(r, 'a', {type: 'double'}, r.current.startedAt).error, 'used up for the game');
});

test('freeze hides the rival options for 4 seconds, then they can answer; target rules hold', () => {
  const r = room(['a', 'b']); const start = begin(r);
  assert.ok(useJoker(r, 'a', {type: 'freeze'}).error, 'needs a target');
  assert.ok(useJoker(r, 'a', {type: 'freeze', target: 'a'}, start).error, 'not yourself');
  assert.ok(useJoker(r, 'a', {type: 'freeze', target: 'b'}, start).ok);
  const frozen = view(r, 'b', start + 100);
  assert.ok(frozen.question.frozenUntil > start); assert.ok(frozen.question.options.every(o => o.text === null), 'texts hidden while frozen');
  assert.ok(view(r, 'a', start + 100).players.find(p => p.id === 'b').frozen, 'others see the ice');
  assert.ok(answer(r, 'b', r.current.orders.b[0], start + 1000).error);
  assert.ok(view(r, 'b', start + TIMING.freeze + 1).question.options.every(o => o.text), 'thawed');
  assert.equal(tick(r, start + TIMING.freeze + 1), true, 'expiry immediately requests a new snapshot');
  assert.equal(r.phase, 'question');
  assert.equal(tick(r, start + TIMING.freeze + 2), false, 'expiry is published once');
  assert.ok(answer(r, 'b', r.current.orders.b[0], start + TIMING.freeze + 1).ok);
  assert.ok(r.feed.some(f => f.kind === 'freeze'));
});

test('golden questions appear and the final question is always golden', () => {
  const r = room(['a']); send(r, 'a', sampleSet(12, {title: 'Uzun'})); begin(r);
  const golden = [];
  for (let i = 0; i < 12; i++) { golden.push(r.current.golden); answer(r, 'a', correctFor(r), r.current.startedAt); finish(r); if (r.current.golden) assert.equal(r.current.results.a.mult, 2); if (i < 11) next(r); }
  assert.equal(golden.at(-1), true); assert.ok(golden.slice(0, -1).some(Boolean)); assert.ok(golden.filter(Boolean).length <= 4);
});

test('sabotage: shuffle preserves an answer and its speed timestamp, fog hides only the victim question', () => {
  const r = room(['a', 'b', 'c']); const start = begin(r);
  assert.ok(useJoker(r, 'a', {type: ['shuffle'], target: 'b'}, start).error, 'malformed joker type is rejected');
  answer(r, 'b', correctFor(r), start + 300);
  const order = [...r.current.orders.b], time = r.current.answeredAt.b;
  assert.ok(useJoker(r, 'a', {type: 'shuffle', target: 'b'}, start + 500).ok);
  assert.notDeepEqual(r.current.orders.b, order);
  assert.deepEqual(new Set(r.current.orders.b), new Set(order));
  assert.equal(r.current.choices.b, correctFor(r)); assert.equal(r.current.answeredAt.b, time);
  assert.ok(useJoker(r, 'c', {type: 'fog', target: 'b'}, start + 600).error, 'target protected from piling on');
  assert.equal(r.players.c.jokers.fog, 1, 'rejected attack spends no charge');
  assert.ok(useJoker(r, 'a', {type: 'slow', target: 'c'}, start + 700).error, 'one outgoing attack per round');
  assert.ok(useJoker(r, 'c', {type: 'fog', target: 'a'}, start + 700).ok);
  assert.equal(view(r, 'a', start + 800).question.text, null);
  assert.ok(view(r, 'a', start + 800).question.options.every(o => o.text));
  assert.ok(view(r, 'b', start + 800).question.text);
  assert.ok(view(r, 'a', start + 700 + TIMING.fog + 1).question.text, 'fog ends without changing the deadline');
  finish(r); assert.ok(r.current.results.b.correct); assert.equal(r.current.results.b.lane, r.current.orders.b.indexOf(correctFor(r)));
  next(r); assert.ok(useJoker(r, 'a', {type: 'shuffle', target: 'b'}, r.current.startedAt).error, 'once per game');
});

test('sabotage: slow removes only speed; shield clears attacks and protects against new attacks', () => {
  const r = room(['a', 'b', 'c']); const start = begin(r);
  assert.ok(useJoker(r, 'a', {type: 'slow', target: 'b'}, start + 100).ok);
  answer(r, 'b', correctFor(r), start + 200); finish(r);
  assert.equal(r.current.results.b.speed, 0); assert.equal(r.current.results.b.base, 100);
  assert.equal(r.players.b.streak, 1); assert.equal(r.current.results.b.slowed, true);
  next(r); const now = r.current.startedAt;
  assert.ok(useJoker(r, 'a', {type: 'freeze', target: 'b'}, now).ok);
  assert.ok(answer(r, 'b', correctFor(r), now + 100).error);
  assert.ok(useJoker(r, 'b', {type: 'shield'}, now + 200).ok);
  assert.ok(answer(r, 'b', correctFor(r), now + 300).ok, 'shield frees a frozen player');
  assert.ok(useJoker(r, 'c', {type: 'fog', target: 'b'}, now + 400).error);
  assert.equal(r.players.c.jokers.fog, 1);
  next(r); const late = r.until - 1500;
  assert.ok(useJoker(r, 'c', {type: 'fog', target: 'b'}, late).error, 'no last-second attack');
  assert.equal(r.players.c.jokers.fog, 1);
});

test('scores: round events are server-authored, emitted once and completion is separate', () => {
  const r = createRoom({code: '1000', host: 'a'}); addPlayer(r, {id: 'a', name: 'Ada', profileId: 'trusted'});
  send(r, 'a', sampleSet(3)); begin(r);
  for (let i = 0; i < 3; i++) { answer(r, 'a', correctFor(r), r.current.startedAt); finish(r); if (i < 2) next(r); }
  const events = adapter.takeScores(r); assert.equal(events.length, 3);
  assert.equal(events.reduce((sum, e) => sum + e.points, 0), r.players.a.score);
  assert.ok(events.every(e => e.profileId === 'trusted' && e.matchId === r.matchId));
  assert.deepEqual(adapter.takeScores(r), []);
  next(r); assert.equal(adapter.takeScores(r)[0].completed, true);
  assert.ok(adapter.canJoin(r, {profileId: 'trusted'}).error, 'same identity cannot enter twice');
});

test('adapter contract: capacity, summary, idle rooms do not tick', () => {
  const r = adapter.create({code: '1234', host: 'a', data: {}});
  for (let i = 0; i < 12; i++) adapter.addPlayer(r, {id: `p${i}`, name: `P${i}`, data: {}});
  assert.ok(adapter.canJoin(r).error);
  assert.equal(adapter.tickInterval(r), 0);
  assert.deepEqual([adapter.summary(r).phase, adapter.summary(r).joinable, adapter.summary(r).capacity], ['lobby', false, 12]);
});

test('network: ready check over sockets, per-player order and a full question cycle', async t => {
  const g = createGameServer();
  await new Promise(resolve => g.http.listen(0, '127.0.0.1', resolve)); t.after(() => g.close());
  const url = `http://127.0.0.1:${g.http.address().port}/games/ates-koprusu`;
  const connect = async () => { const s = client(url, {transports: ['websocket'], reconnection: false, forceNew: true}); t.after(() => s.disconnect()); await new Promise(r => s.once('connect', r)); return s; };
  const a = await connect(), b = await connect(), c = await connect();
  const made = await a.emitWithAck('join', {name: 'Ada'});
  assert.ok((await b.emitWithAck('join', {name: 'Bora', code: made.code})).code);
  const other = await c.emitWithAck('join', {name: 'Cem'});
  assert.notEqual(other.code, made.code);
  const room = g.rooms.get(made.code); room.timing = {...room.timing, countdown: 30, question: 250, reveal: 60, pause: 40, lastCall: 20};
  assert.ok((await a.emitWithAck('ready', true)).ok);
  assert.equal(room.phase, 'lobby', 'Bora is not ready yet');
  const stateB = new Promise(resolve => b.on('state', s => { if (s.phase === 'question') resolve(s); }));
  assert.ok((await b.emitWithAck('ready', true)).ok);
  const sb = await stateB;
  assert.equal(sb.gameId, 'ates-koprusu'); assert.equal(sb.question.correct, undefined);
  assert.equal(g.rooms.get(other.code).phase, 'lobby');
  const revealed = new Promise(resolve => b.on('state', s => { if (s.phase === 'reveal') resolve(s); }));
  assert.ok((await b.emitWithAck('answer', sb.question.options[0].id)).ok);
  const rv = await revealed;
  assert.ok(rv.question.correct); assert.equal(rv.question.results[b.id].lane, 0);
  a.disconnect(); b.disconnect(); await new Promise(r => setTimeout(r, 60));
  assert.equal(g.rooms.has(made.code), false);
});
