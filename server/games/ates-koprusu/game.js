import {randomInt, randomBytes, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateSet, summarizeSet, LIMITS} from '../../../public/games/ates-koprusu/questions.js';

// Sunucu otoritelidir: sıra, süre, doğru cevap, jokerler ve puan yalnızca burada belirlenir.
// Akış: lobby (hazır kontrolü) → countdown → question → reveal → pause → … → podyum (lobby).
export const TIMING = Object.freeze({countdown: 3000, question: 12000, reveal: 4000, pause: 2000, lastCall: 1500, lateJoin: 3000, freeze: 4000, fog: 2500});
export const POINTS = Object.freeze([100, 125, 150, 175, 200]);
export const SPEED_MAX = 50;
export const MAX_PLAYERS = 12, MAX_POOL_SETS = 8, MAX_POOL_QUESTIONS = 200, RECENT = 10, FEED = 6;
export const JOKERS = Object.freeze({double: 'x2 Çifte Ateş', half: '50/50', shield: 'Kalkan', freeze: 'Dondur', shuffle: 'Karıştır', fog: 'Sis', slow: 'Hız Kes'});
export const ATTACKS = Object.freeze(['freeze', 'shuffle', 'fog', 'slow']);

const starter = validateSet(JSON.parse(readFileSync(new URL('./starter-set.json', import.meta.url), 'utf8')));
if (!starter.set) throw new Error(`Başlangıç seti geçersiz: ${starter.errors.join('; ')}`);
export const STARTER_SET = Object.freeze(starter.set);

export const pointsFor = streak => streak > 0 ? POINTS[Math.min(streak, POINTS.length) - 1] : 0;
// Hızlı ile yavaş arasında küçük ama hissedilir fark: 0–50 puan, 5'in katları.
export const speedBonus = (elapsed, total) => Math.round(SPEED_MAX * Math.max(0, Math.min(1, 1 - elapsed / total)) / 5) * 5;
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) { const j = randomInt(i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
const token = () => randomBytes(4).toString('hex');
const freshStats = () => ({score: 0, streak: 0, bestStreak: 0, position: 0, correct: 0, answered: 0, recent: [], lastRound: 0, skipRound: 0,
  jokers: Object.fromEntries(Object.keys(JOKERS).map(key => [key, 1])), jokersUsed: 0, hits: 0, fastest: null});

export function createRoom({code, host, timing = TIMING}) {
  return {code, host, players: {}, phase: 'lobby', until: 0, round: 0, game: 0, matchId: null, scoreEvents: [], timing: {...TIMING, ...timing}, current: null, deck: null, pool: [], uploads: {}, podium: null, feed: [], feedId: 0, nextGolden: 0};
}
function announce(room, text, kind = 'info') {
  room.feed = [...room.feed, {id: ++room.feedId, text, kind}].slice(-FEED);
}
const inGame = room => !['lobby', 'countdown'].includes(room.phase);

export function addPlayer(room, {id, name, profileId}, now = Date.now()) {
  const p = room.players[id] = {id, name, profileId, ready: false, joinedAt: now, ...freshStats()};
  const current = room.current;
  if (inGame(room) && current) {
    current.orders[id] = shuffle(current.tokens);
    // Son saniyelerde gelen oyuncu bu soruda boş sayılıp cezalandırılmaz.
    if (room.phase !== 'question' || room.until - now < room.timing.lateJoin) p.skipRound = current.round;
  }
  if (room.phase === 'countdown') p.ready = true; // Geri sayım başladıysa oyuna dahil olur.
  return p;
}
export function removePlayer(room, id, now = Date.now()) {
  delete room.players[id]; delete room.uploads[id];
  if (room.current) { delete room.current.orders[id]; delete room.current.choices[id]; }
  if (room.host === id) room.host = Object.keys(room.players)[0];
  evaluateStart(room, now);
}

// ---------- Hazır kontrolü ----------
export function setReady(room, id, value, now) {
  const p = room.players[id];
  if (!p) return {error: 'Oyuncu bulunamadı.'};
  if (inGame(room)) return {error: 'Oyun zaten sürüyor.'};
  p.ready = value === undefined ? !p.ready : !!(typeof value === 'object' ? value?.ready : value);
  evaluateStart(room, now);
  return {ok: true, ready: p.ready};
}
function evaluateStart(room, now) {
  const players = Object.values(room.players), all = players.length > 0 && players.every(p => p.ready);
  if (room.phase === 'lobby' && all) { room.phase = 'countdown'; room.until = now + room.timing.countdown; }
  else if (room.phase === 'countdown' && !all) { room.phase = 'lobby'; room.until = 0; }
}

// ---------- Oyun ----------
export function startGame(room, now) {
  const sources = room.pool.length ? room.pool : [{set: STARTER_SET, by: 'BiMola'}];
  const seen = new Set(), questions = [];
  for (const source of sources) for (const q of source.set.questions) {
    const key = q.text.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    seen.add(key); questions.push({...q, setTitle: source.set.title, by: source.by});
  }
  room.deck = {questions: shuffle(questions), index: 0, sets: sources.map(s => ({title: s.set.title, by: s.by, count: s.set.questions.length}))};
  room.pool = []; room.podium = null; room.game++; room.matchId = randomUUID(); room.feed = [];
  for (const p of Object.values(room.players)) Object.assign(p, freshStats(), {ready: false});
  room.nextGolden = randomInt(4, 7);
  announce(room, `${questions.length} soruluk köprü başladı!`, 'start');
  nextQuestion(room, now);
}

export function nextQuestion(room, now) {
  const deck = room.deck;
  if (deck.index >= deck.questions.length) return endGame(room);
  const question = deck.questions[deck.index++], number = deck.index, total = deck.questions.length;
  // Altın soru: birkaç soruda bir ve her zaman son soru (5+ soruluk oyunlarda). Herkes için puan x2.
  let golden = false;
  if (total >= 5 && (number === total || number === room.nextGolden)) { golden = true; if (number === room.nextGolden) room.nextGolden += randomInt(6, 9); }
  const tokens = {}, texts = {};
  for (const option of question.options) { let t; do t = token(); while (texts[t]); tokens[option.id] = t; texts[t] = option.text; }
  const list = Object.values(tokens);
  room.round++;
  room.current = {round: room.round, number, total, question, golden, texts, tokens: list, correct: tokens[question.correctOptionId],
    orders: {}, choices: {}, answeredAt: {}, effects: {}, frozen: {}, fogged: {}, slowed: {}, attacked: {}, attackers: {}, results: null, startedAt: now};
  for (const id of Object.keys(room.players)) room.current.orders[id] = shuffle(list);
  if (golden) announce(room, number === total ? 'Final sorusu altın: puanlar x2!' : 'Altın soru! Bu soruda puanlar x2.', 'golden');
  room.phase = 'question'; room.until = now + room.timing.question;
}

function endGame(room) {
  const ranking = Object.values(room.players).sort((a, b) => b.score - a.score || b.correct - a.correct)
    .map(p => ({id: p.id, name: p.name, score: p.score, correct: p.correct, answered: p.answered, bestStreak: p.bestStreak}));
  const best = (key, pick, min = 1) => {
    const list = Object.values(room.players).filter(p => pick(p) !== null && pick(p) >= min);
    return list.length ? list.reduce((a, b) => (key === 'min' ? pick(b) < pick(a) : pick(b) > pick(a)) ? b : a) : null;
  };
  const awards = [];
  const streak = best('max', p => p.bestStreak, 2); if (streak) awards.push({title: 'En uzun ateş', name: streak.name, value: `${streak.bestStreak} seri`});
  const fast = best('min', p => p.fastest, 0); if (fast) awards.push({title: 'En hızlı parmak', name: fast.name, value: `${(fast.fastest / 1000).toFixed(1)} sn`});
  const joker = best('max', p => p.jokersUsed); if (joker) awards.push({title: 'Joker ustası', name: joker.name, value: `${joker.jokersUsed} joker`});
  const magnet = best('max', p => p.hits); if (magnet) awards.push({title: 'Kütük mıknatısı', name: magnet.name, value: `${magnet.hits} çarpma`});
  room.podium = {game: room.game, ranking, awards, total: room.deck.questions.length, sets: room.deck.sets};
  for (const p of Object.values(room.players)) if (p.profileId && p.answered) room.scoreEvents.push({profileId: p.profileId, name: p.name, matchId: room.matchId, round: room.round + 1, completed: true});
  room.phase = 'lobby'; room.until = 0; room.current = null; room.deck = null;
  for (const p of Object.values(room.players)) p.ready = false;
}

export function answer(room, id, data, now) {
  const current = room.current, choice = typeof data === 'string' ? data : data?.optionId;
  if (room.phase !== 'question' || !current || now >= room.until) return {error: 'Cevap süresi doldu.'};
  if (!room.players[id] || room.players[id].skipRound === current.round) return {error: 'Bu soruya sonraki turda katılacaksın.'};
  if (current.frozen[id] > now) return {error: 'Şıkların buz tuttu! Birazdan çözülecek.'};
  if (typeof choice !== 'string' || !current.orders[id]?.includes(choice) || current.effects[id]?.half?.includes(choice)) return {error: 'Bu seçenek bu soruda yok.'};
  if (current.choices[id] !== choice) { current.choices[id] = choice; current.answeredAt[id] = now; }
  const active = Object.values(room.players).filter(p => p.skipRound !== current.round);
  // Herkes cevapladıysa bekletmeden kısa bir son çağrı bırak; seçim değiştirilebilir.
  if (active.every(p => current.choices[p.id])) room.until = Math.min(room.until, now + room.timing.lastCall);
  return {ok: true};
}

export function useJoker(room, id, data, now) {
  const current = room.current, p = room.players[id], type = data?.type;
  if (room.phase !== 'question' || !current || now >= room.until) return {error: 'Jokerler yalnızca soru sürerken kullanılır.'};
  if (!p || p.skipRound === current.round) return {error: 'Bu soruda joker kullanamazsın.'};
  if (typeof type !== 'string' || !Object.hasOwn(JOKERS, type)) return {error: 'Böyle bir joker yok.'};
  if (!(p.jokers[type] > 0)) return {error: `${JOKERS[type]} hakkın bitti.`};
  const effects = current.effects[id] ||= {};
  if (effects[type]) return {error: 'Bu jokeri bu soruda zaten kullandın.'};
  if (type === 'half') {
    if (current.tokens.length < 3) return {error: '50/50 en az 3 şıklı sorularda kullanılır.'};
    const wrong = current.tokens.filter(t => t !== current.correct);
    effects.half = shuffle(wrong).slice(0, current.tokens.length === 3 ? 1 : 2);
    if (effects.half.includes(current.choices[id])) { delete current.choices[id]; delete current.answeredAt[id]; }
    announce(room, `${p.name} 50/50 kullandı.`, 'joker');
  } else if (ATTACKS.includes(type)) {
    const target = room.players[data?.target];
    if (!target || target.id === id) return {error: 'Çakallık için bir rakip seç.'};
    if (target.skipRound === current.round) return {error: 'Bu oyuncu bu soruda oynamıyor.'};
    if (current.attackers[id]) return {error: 'Bir soruda yalnızca bir çakallık yapabilirsin.'};
    if (current.effects[target.id]?.shield) return {error: `${target.name} kalkanıyla korunuyor. Hakkın harcanmadı.`};
    if (current.attacked[target.id]) return {error: `${target.name} bu soruda zaten çakallık gördü. Başka rakip seç.`};
    if (room.until - now < 2000) return {error: 'Son 2 saniyede çakallık yapılamaz. Hakkın sende kaldı.'};
    if (type === 'freeze') current.frozen[target.id] = Math.min(room.until - 1000, now + room.timing.freeze);
    if (type === 'fog') current.fogged[target.id] = Math.min(room.until - 1000, now + room.timing.fog);
    if (type === 'slow') current.slowed[target.id] = true;
    if (type === 'shuffle') {
      const order = current.orders[target.id], mixed = shuffle(order);
      if (mixed.every((t, i) => t === order[i])) mixed.push(mixed.shift());
      current.orders[target.id] = mixed; // Seçilen cevap kimliği korunur, yalnızca şerit değişir.
    }
    current.attacked[target.id] = {type, by: p.name}; current.attackers[id] = true; effects[type] = target.id;
    announce(room, `${p.name} → ${target.name}: ${JOKERS[type]}!`, type === 'freeze' ? 'freeze' : 'attack');
  } else {
    effects[type] = true;
    if (type === 'shield') { delete current.frozen[id]; delete current.fogged[id]; delete current.slowed[id]; }
    announce(room, type === 'double' ? `${p.name} x2 Çifte Ateş'i yaktı!` : `${p.name} kalkanını kaldırdı.`, 'joker');
  }
  p.jokers[type]--; p.jokersUsed++;
  return {ok: true, type};
}

export function reveal(room, now) {
  const current = room.current, results = {};
  for (const p of Object.values(room.players)) {
    if (p.skipRound === current.round) { results[p.id] = {skip: true, lane: -1, position: p.position, from: p.position}; continue; }
    if (p.lastRound === current.round) continue; // Aynı soru bir kez puanlanır.
    p.lastRound = current.round;
    const choice = current.choices[p.id], correct = choice === current.correct, from = p.position, effects = current.effects[p.id] || {};
    p.answered++;
    let base = 0, speed = 0, mult = 1, shielded = false;
    if (correct) {
      p.streak++; p.correct++; p.bestStreak = Math.max(p.bestStreak, p.streak); p.position++;
      const elapsed = current.answeredAt[p.id] - current.startedAt;
      base = pointsFor(p.streak); speed = current.slowed[p.id] ? 0 : speedBonus(elapsed, room.timing.question);
      mult = (effects.double ? 2 : 1) * (current.golden ? 2 : 1);
      p.fastest = p.fastest === null ? elapsed : Math.min(p.fastest, elapsed);
    } else if (effects.shield) shielded = true; // Kütük kalkana çarpar: seri ve yer korunur.
    else { p.streak = 0; p.position = Math.max(0, p.position - 1); p.hits++; }
    const points = (base + speed) * mult;
    p.score += points;
    if (p.profileId) room.scoreEvents.push({profileId: p.profileId, name: p.name, matchId: room.matchId, round: current.round, points, score: p.score, streak: p.bestStreak, correct: Number(correct), answered: 1});
    p.recent = [...p.recent, correct].slice(-RECENT);
    results[p.id] = {correct, answered: !!choice, points, base, speed, mult, double: !!effects.double, shielded, from, position: p.position, streak: p.streak,
      slowed: !!current.slowed[p.id], lane: choice ? current.orders[p.id].indexOf(choice) : -1};
  }
  current.results = results;
  room.phase = 'reveal'; room.until = now + room.timing.reveal;
}

export function tick(room, now) {
  let effectsEnded = false;
  if (room.phase === 'question' && room.current) for (const bucket of [room.current.frozen, room.current.fogged]) {
    for (const [id, until] of Object.entries(bucket)) if (now >= until) { delete bucket[id]; effectsEnded = true; }
  }
  // Buz/sis çözüldüğü anda yayın gönderilir; 1 saniyelik düzenli yayını bekleyip
  // rakibin kalan cevap süresini tüketmeyiz.
  if (room.phase === 'lobby' || now < room.until) return effectsEnded;
  if (room.phase === 'countdown') startGame(room, now);
  else if (room.phase === 'question') reveal(room, now);
  else if (room.phase === 'reveal') { room.phase = 'pause'; room.until = now + room.timing.pause; }
  else nextQuestion(room, now);
  return true;
}

// ---------- Soru havuzu ----------
// Socket.IO paket sınırı nedeniyle JSON parçalar hâlinde gelir. Setler bir sonraki oyunun havuzuna girer.
const poolCount = room => room.pool.reduce((sum, entry) => sum + entry.set.questions.length, 0);
export function upload(room, id, data) {
  const p = room.players[id];
  if (!p) return {error: 'Oyuncu bulunamadı.'};
  if (!data || typeof data !== 'object') return {error: 'Yükleme bilgisi geçersiz.'};
  const {uploadId, index, total, chunk} = data;
  if (typeof uploadId !== 'string' || !/^[a-z0-9]{4,16}$/i.test(uploadId) || !Number.isInteger(total) || total < 1 || total > LIMITS.maxChunks || !Number.isInteger(index) || index < 0 || index >= total || typeof chunk !== 'string') return {error: 'Yükleme parçası geçersiz.'};
  if (index === 0 || room.uploads[id]?.uploadId !== uploadId) {
    if (room.pool.length >= MAX_POOL_SETS) return {error: `Havuzda en fazla ${MAX_POOL_SETS} set olabilir.`};
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
  if (room.pool.length >= MAX_POOL_SETS) return {error: `Havuzda en fazla ${MAX_POOL_SETS} set olabilir.`};
  if (poolCount(room) + result.set.questions.length > MAX_POOL_QUESTIONS) return {error: `Havuz en fazla ${MAX_POOL_QUESTIONS} soru alır; bu setle ${poolCount(room) + result.set.questions.length} olur.`};
  room.pool.push({set: result.set, by: p.name, byId: id});
  announce(room, `${p.name} havuza "${result.set.title}" setini ekledi (${result.set.questions.length} soru).`, 'set');
  return {ok: true, done: true, nextGame: inGame(room), summary: summarizeSet(result.set)};
}

export function removeSet(room, id, data) {
  const index = Number(data?.index), entry = room.pool[index];
  if (!Number.isInteger(index) || !entry) return {error: 'Set bulunamadı.'};
  if (room.host !== id && entry.byId !== id) return {error: 'Bu seti yalnızca ekleyen kişi veya oda kurucusu kaldırabilir.'};
  room.pool.splice(index, 1); return {ok: true};
}

// ---------- Kişiye özel görünüm ----------
// Soru sürerken doğru cevap, başkalarının seçimi/sırası ve silinen şıkları yer almaz.
export function view(room, id, now) {
  const current = room.current, open = room.phase === 'question';
  const players = Object.values(room.players).sort((a, b) => b.score - a.score || b.position - a.position || a.joinedAt - b.joinedAt).map(p => ({
    id: p.id, name: p.name, ready: p.ready, score: p.score, streak: p.streak, bestStreak: p.bestStreak, position: p.position, correct: p.correct, answered: p.answered, recent: p.recent, jokers: p.jokers,
    hasAnswered: open && current ? !!current.choices[p.id] : false, waiting: current ? p.skipRound === current.round : false,
    frozen: open && current?.frozen[p.id] > now ? current.frozen[p.id] : 0,
    protected: open && !!current?.effects[p.id]?.shield,
    attacked: open && !!current?.attacked[p.id],
  }));
  let question = null;
  if (current && inGame(room)) {
    const order = current.orders[id] || [], effects = current.effects[id] || {}, frozenUntil = open && current.frozen[id] > now ? current.frozen[id] : 0;
    question = {
      round: current.round, number: current.number, total: current.total, golden: current.golden, setTitle: current.question.setTitle, by: current.question.by,
      text: open && current.fogged[id] > now ? null : current.question.text, difficulty: current.question.difficulty, frozenUntil,
      fogUntil: open ? current.fogged[id] || 0 : 0, slowed: open && !!current.slowed[id], attack: open ? current.attacked[id] || null : null,
      // Donmuş oyuncu şık metinlerini görmez; 50/50 ile silinenler yerinde kalır ama işaretlenir.
      options: order.map(t => ({id: t, text: frozenUntil ? null : current.texts[t], removed: !!effects.half?.includes(t)})),
      choice: current.choices[id] || null, effects: {...Object.fromEntries(Object.keys(JOKERS).map(type => [type, effects[type] || false])), attacked: !!current.attackers[id]},
    };
    if (!open) Object.assign(question, {correct: current.correct, explanation: current.question.explanation, results: current.results});
    if (!open) question.options = order.map(t => ({id: t, text: current.texts[t], removed: !!effects.half?.includes(t)}));
  }
  return {
    phase: room.phase, now, until: room.until, round: room.round, game: room.game, me: id, host: room.host, timing: room.timing,
    players, question, feed: room.feed, podium: room.podium, points: POINTS, speedMax: SPEED_MAX,
    pool: room.pool.map(entry => ({title: entry.set.title, category: entry.set.category, count: entry.set.questions.length, by: entry.by, mine: entry.byId === id})),
    poolTotal: poolCount(room), maxPool: MAX_POOL_QUESTIONS, starter: {title: STARTER_SET.title, count: STARTER_SET.questions.length},
  };
}
