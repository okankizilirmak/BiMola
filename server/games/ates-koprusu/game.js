import {randomInt, randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateSet, summarizeSet, LIMITS} from '../../../public/games/ates-koprusu/questions.js';

// Sunucu otoritelidir: sıra, süre, doğru cevap ve puan yalnızca burada belirlenir.
export const TIMING = Object.freeze({question: 12000, reveal: 4000, pause: 2000, lastCall: 1500, lateJoin: 3000});
export const POINTS = Object.freeze([100, 125, 150, 175, 200]);
export const MAX_PLAYERS = 12, MAX_QUEUE = 5, RECENT = 10;

const starter = validateSet(JSON.parse(readFileSync(new URL('./starter-set.json', import.meta.url), 'utf8')));
if (!starter.set) throw new Error(`Başlangıç seti geçersiz: ${starter.errors.join('; ')}`);
export const STARTER_SET = Object.freeze(starter.set);

export const pointsFor = streak => streak > 0 ? POINTS[Math.min(streak, POINTS.length) - 1] : 0;
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = randomInt(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
const token = () => randomBytes(4).toString('hex');

export function createRoom({code, host, timing = TIMING}) {
  return {code, host, players: {}, phase: 'lobby', until: 0, round: 0, timing: {...timing}, current: null, active: deck(STARTER_SET, 'BiMola'), queue: [], uploads: {}, lastQuestionId: null};
}
function deck(set, by, avoidId) {
  let order = shuffle(set.questions.map((_, index) => index));
  // Set yeniden başlarken aynı soru arka arkaya gelmesin.
  if (order.length > 1 && set.questions[order[0]].id === avoidId) order.push(order.shift());
  return {set, by, order, index: 0};
}

export function addPlayer(room, {id, name}, now = Date.now()) {
  const p = room.players[id] = {id, name, score: 0, streak: 0, bestStreak: 0, position: 0, correct: 0, answered: 0, recent: [], joinedAt: now, lastRound: 0, skipRound: 0};
  const current = room.current;
  if (current) {
    current.orders[id] = shuffle(current.tokens);
    // Son saniyelerde gelen oyuncu bu soruda boş sayılıp cezalandırılmaz.
    if (room.phase !== 'question' || room.until - now < room.timing.lateJoin) p.skipRound = current.round;
  }
  return p;
}
export function removePlayer(room, id) {
  delete room.players[id]; delete room.uploads[id];
  if (room.current) { delete room.current.orders[id]; delete room.current.choices[id]; }
  if (room.host === id) room.host = Object.keys(room.players)[0];
}

export function start(room, id, now) {
  if (room.host !== id) return {error: 'Oyunu yalnızca oda kurucusu başlatabilir.'};
  if (room.phase !== 'lobby') return {error: 'Köprü zaten akıyor.'};
  nextQuestion(room, now); return {ok: true};
}

export function nextQuestion(room, now) {
  if (room.active.index >= room.active.order.length) {
    room.active = room.queue.length ? room.queue.shift() : deck(room.active.set, room.active.by, room.lastQuestionId);
  }
  const question = room.active.set.questions[room.active.order[room.active.index++]];
  const tokens = {}, texts = {};
  for (const option of question.options) { let t; do t = token(); while (texts[t]); tokens[option.id] = t; texts[t] = option.text; }
  const list = Object.values(tokens);
  room.round++; room.lastQuestionId = question.id;
  room.current = {round: room.round, question, texts, tokens: list, correct: tokens[question.correctOptionId], orders: {}, choices: {}, results: null};
  for (const id of Object.keys(room.players)) room.current.orders[id] = shuffle(list);
  room.phase = 'question'; room.until = now + room.timing.question;
}

export function answer(room, id, data, now) {
  const current = room.current, choice = typeof data === 'string' ? data : data?.optionId;
  if (room.phase !== 'question' || !current || now >= room.until) return {error: 'Cevap süresi doldu.'};
  if (!room.players[id] || room.players[id].skipRound === current.round) return {error: 'Bu soruya sonraki turda katılacaksın.'};
  if (typeof choice !== 'string' || !current.orders[id]?.includes(choice)) return {error: 'Bu seçenek bu soruda yok.'};
  current.choices[id] = choice;
  const active = Object.values(room.players).filter(p => p.skipRound !== current.round);
  // Herkes cevapladıysa bekletmeden kısa bir son çağrı bırak; seçim değiştirilebilir.
  if (active.every(p => current.choices[p.id])) room.until = Math.min(room.until, now + room.timing.lastCall);
  return {ok: true};
}

export function reveal(room, now) {
  const current = room.current, results = {};
  for (const p of Object.values(room.players)) {
    if (p.skipRound === current.round) { results[p.id] = {skip: true, lane: -1, position: p.position}; continue; }
    if (p.lastRound === current.round) continue; // Aynı soru bir kez puanlanır.
    p.lastRound = current.round;
    const choice = current.choices[p.id], correct = choice === current.correct, from = p.position;
    p.answered++;
    if (correct) { p.streak++; p.correct++; p.bestStreak = Math.max(p.bestStreak, p.streak); p.position++; }
    else { p.streak = 0; p.position = Math.max(0, p.position - 1); }
    const points = correct ? pointsFor(p.streak) : 0;
    p.score += points;
    p.recent = [...p.recent, correct].slice(-RECENT);
    results[p.id] = {correct, answered: !!choice, points, from, position: p.position, streak: p.streak, lane: choice ? current.orders[p.id].indexOf(choice) : -1};
  }
  current.results = results;
  room.phase = 'reveal'; room.until = now + room.timing.reveal;
}

export function tick(room, now) {
  if (room.phase === 'lobby' || now < room.until) return false;
  if (room.phase === 'question') reveal(room, now);
  else if (room.phase === 'reveal') { room.phase = 'pause'; room.until = now + room.timing.pause; }
  else nextQuestion(room, now);
  return true;
}

// Set yükleme: Socket.IO paket sınırı nedeniyle JSON parçalar hâlinde gelir.
export function upload(room, id, data) {
  const p = room.players[id];
  if (!p) return {error: 'Oyuncu bulunamadı.'};
  if (!data || typeof data !== 'object') return {error: 'Yükleme bilgisi geçersiz.'};
  const {uploadId, index, total, chunk} = data;
  if (typeof uploadId !== 'string' || !/^[a-z0-9]{4,16}$/i.test(uploadId) || !Number.isInteger(total) || total < 1 || total > LIMITS.maxChunks || !Number.isInteger(index) || index < 0 || index >= total || typeof chunk !== 'string') return {error: 'Yükleme parçası geçersiz.'};
  if (index === 0 || room.uploads[id]?.uploadId !== uploadId) {
    if (room.queue.length >= MAX_QUEUE) return {error: `Sırada en fazla ${MAX_QUEUE} set olabilir. Biri oynandıktan sonra tekrar dene.`};
    room.uploads[id] = {uploadId, total, parts: [], size: 0};
  }
  const pending = room.uploads[id];
  if (pending.total !== total || index !== pending.parts.length) { delete room.uploads[id]; return {error: 'Parçalar sırasız geldi. Yüklemeyi tekrar başlat.'}; }
  pending.size += chunk.length; pending.parts.push(chunk);
  if (pending.size > LIMITS.bytes) { delete room.uploads[id]; return {error: `Set ${LIMITS.bytes / 1024} KB sınırını aşıyor.`}; }
  if (pending.parts.length < total) return {ok: true, received: pending.parts.length};
  delete room.uploads[id];
  let parsed;
  try { parsed = JSON.parse(pending.parts.join('')); } catch { return {error: 'Set JSON olarak okunamadı.', errors: ['Geçerli JSON değil.']}; }
  const result = validateSet(parsed);
  if (result.errors) return {error: result.errors[0], errors: result.errors};
  if (room.queue.length >= MAX_QUEUE) return {error: `Sırada en fazla ${MAX_QUEUE} set olabilir.`};
  const entry = {...deck(result.set, p.name), byId: id};
  // Oyun henüz başlamadıysa ilk yüklenen set başlangıç setinin yerini alır.
  const replaced = room.phase === 'lobby' && room.round === 0 && room.active.set === STARTER_SET;
  if (replaced) room.active = entry; else room.queue.push(entry);
  return {ok: true, done: true, active: replaced, summary: summarizeSet(result.set)};
}

export function removeQueued(room, id, data) {
  const index = Number(data?.index), entry = room.queue[index];
  if (!Number.isInteger(index) || !entry) return {error: 'Set bulunamadı.'};
  if (room.host !== id && entry.byId !== id) return {error: 'Bu seti yalnızca ekleyen kişi veya oda kurucusu kaldırabilir.'};
  room.queue.splice(index, 1); return {ok: true};
}

const setInfo = entry => ({title: entry.set.title, category: entry.set.category, count: entry.set.questions.length, by: entry.by});

// Kişiye özel görünüm: soru sürerken doğru cevap ve başkalarının seçimi/sırası yer almaz.
export function view(room, id, now) {
  const current = room.current, open = room.phase === 'question';
  const players = Object.values(room.players).sort((a, b) => b.score - a.score || b.position - a.position || a.joinedAt - b.joinedAt).map(p => ({
    id: p.id, name: p.name, score: p.score, streak: p.streak, bestStreak: p.bestStreak, position: p.position, correct: p.correct, answered: p.answered, recent: p.recent,
    ready: open && current ? !!current.choices[p.id] : false, waiting: current ? p.skipRound === current.round : false,
  }));
  let question = null;
  if (current && room.phase !== 'lobby') {
    const order = current.orders[id] || [];
    question = {
      round: current.round, text: current.question.text, difficulty: current.question.difficulty,
      options: order.map(t => ({id: t, text: current.texts[t]})), choice: current.choices[id] || null,
    };
    if (!open) Object.assign(question, {correct: current.correct, explanation: current.question.explanation, results: current.results});
  }
  return {
    phase: room.phase, now, until: room.until, round: room.round, me: id, host: room.host, timing: room.timing,
    set: {...setInfo(room.active), index: Math.min(room.active.index, room.active.order.length)}, queue: room.queue.map(entry => ({...setInfo(entry), mine: entry.byId === id})),
    players, question, points: POINTS,
  };
}
