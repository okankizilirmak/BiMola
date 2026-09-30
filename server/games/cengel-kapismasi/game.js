import {randomInt, randomUUID} from 'node:crypto';
import {validatePuzzle} from '../../../public/games/cengel-kapismasi/puzzle.js';
import {starter} from '../../../public/games/cengel-kapismasi/starter.js';

export const MAX_PLAYERS = 12;
export function createRoom({code, host}) {
  return {code, host, phase: 'lobby', players: {}, puzzle: validatePuzzle(starter), revision: 1, filled: {}, completed: {}, feed: [],
    until: 0, duration: 300, matchId: null, sequence: 0, scoreEvents: [], archives: [], uploads: new Map()};
}
export function addPlayer(room, {id, name, profileId}) {
  room.players[id] = {id, name, profileId, score: 0, correct: 0, answered: 0, words: 0, bonuses: 0, ready: false, rack: [], spent: [], handVersion: 0, confirmations: new Map()};
}
export function removePlayer(room, id) {
  const player = room.players[id];
  if (room.phase === 'play' && player) room.archives.push(player);
  delete room.players[id]; room.uploads.delete(id);
  if (room.host === id) room.host = Object.keys(room.players)[0];
}
function record(room, player, points, correct = 0, answered = 0, completed = false) {
  if (!room.matchId) return;
  room.scoreEvents.push({profileId: player.profileId, name: player.name, matchId: room.matchId, round: ++room.sequence,
    points, score: player.score, streak: 0, correct, answered, completed});
}
function notice(room, message) { room.feed.unshift(message); room.feed.length = Math.min(room.feed.length, 6); }
function remaining(room) { return room.puzzle.cells.filter(cell => !room.filled[`${cell.row},${cell.col}`]); }
function fillRacks(room) {
  const letters = remaining(room).map(cell => cell.letter);
  for (const player of Object.values(room.players)) for (let i = 0; i < 5; i++) {
    if (!letters.includes(player.rack[i])) player.rack[i] = letters.length ? letters[randomInt(letters.length)] : null;
  }
}
function finish(room, reason) {
  if (room.phase !== 'play') return;
  room.phase = 'end'; room.reason = reason;
  for (const player of [...Object.values(room.players), ...room.archives]) record(room, player, 0, 0, 0, true);
  notice(room, reason);
}
export function tick(room, now) {
  if (room.phase === 'play' && now >= room.until) { finish(room, 'Süre bitti.'); return true; }
  return false;
}
export function ready(room, id, value, now) {
  const player = room.players[id];
  if (!player || room.phase === 'play') return {error: 'Maç sürerken hazırlık değişmez.'};
  player.ready = value == null ? !player.ready : value === true;
  if (Object.values(room.players).every(p => p.ready)) {
    room.phase = 'play'; room.revision++; room.until = now + room.duration * 1000; room.matchId = randomUUID(); room.sequence = 0;
    room.filled = {}; room.completed = {}; room.archives = []; room.feed = []; room.reason = '';
    for (const p of Object.values(room.players)) Object.assign(p, {score: 0, correct: 0, answered: 0, words: 0, bonuses: 0, ready: false, rack: [], spent: Array(5).fill(false), handVersion: 0, confirmations: new Map()});
    fillRacks(room); notice(room, 'Tahta açıldı. Harflerini sürükle, sonra onayla.');
  }
  return {ok: true};
}
export function configure(room, id, data) {
  if (id !== room.host) return {error: 'Süreyi oda sahibi ayarlayabilir.'};
  if (room.phase === 'play') return {error: 'Maç sürerken süre değişmez.'};
  if (![120, 180, 300, 600].includes(data?.duration)) return {error: 'Geçersiz süre.'};
  room.duration = data.duration; Object.values(room.players).forEach(p => { p.ready = false; }); return {ok: true};
}
export function place(room, id, data, now, deferRefill = false) {
  const player = room.players[id];
  if (room.phase !== 'play' || !player) return {error: 'Aktif bir maç yok.'};
  if (now >= room.until) return {error: 'Süre bitti.'};
  if (!data || ![data.row, data.col, data.slot, data.revision].every(Number.isInteger) || data.slot < 0 || data.slot >= 5) return {error: 'Harf veya kutu geçersiz.'};
  if (data.revision !== room.revision) return {error: 'Tahta değişti. Yeniden seç.'};
  const key = `${data.row},${data.col}`, cell = room.puzzle.cells.find(c => c.row === data.row && c.col === data.col);
  if (!cell || room.filled[key]) return {error: 'Bu kutu kapalı veya başka biri doldurdu. Puanın değişmedi.'};
  const letter = player.rack[data.slot];
  if (!letter || data.letter !== letter) return {error: 'Elindeki harf değişti. Yeniden seç.'};
  player.answered++;
  if (letter !== cell.letter) {
    player.score--; record(room, player, -1, 0, 1);
    return {ok: true, wrong: true, points: -1, message: 'Yanlış harf · −1 puan. Harf elinde kaldı.'};
  }
  room.filled[key] = {letter, by: id}; player.correct++;
  player.rack[data.slot] = null; player.spent[data.slot] = true;
  let points = 0;
  for (const entry of room.puzzle.entries) if (!room.completed[entry.id] && entry.keys.every(k => room.filled[k])) {
    room.completed[entry.id] = id; points += entry.answer.length; player.words++;
    notice(room, `${player.name}, ${entry.answer} kelimesini tamamladı · +${entry.answer.length}`);
  }
  if (player.spent.every(Boolean)) { points += 5; player.bonuses++; player.spent.fill(false); notice(room, `${player.name} elindeki beş harfi bitirdi · +5`); }
  player.score += points; record(room, player, points, 1, 1); if (!deferRefill) fillRacks(room);
  if (!remaining(room).length) finish(room, 'Bütün kelimeler tamamlandı!');
  return {ok: true, points, message: points ? `Doğru harf · +${points} puan` : 'Doğru harf!'};
}

export function confirm(room, id, data, now) {
  const player = room.players[id];
  if (!player || !data || typeof data.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,40}$/.test(data.requestId)) return {error: 'Hamle bilgisi geçersiz.'};
  const previous = player.confirmations.get(data.requestId);
  if (previous) return previous;
  if (room.phase !== 'play' || now >= room.until) return {error: 'Aktif maç yok veya süre bitti.'};
  if (data.revision !== room.revision || data.handVersion !== player.handVersion) return {error: 'Tahta veya el değişti. Hamleni yeniden kontrol et.'};
  if (!Array.isArray(data.placements) || data.placements.length > 5) return {error: 'Bir hamlede en fazla beş harf yerleştir.'};
  const slots = new Set(), targets = new Set();
  // Validate the entire draft before scoring any letter. Conflicts cost nothing.
  for (const tile of data.placements) {
    if (!tile || ![tile.row, tile.col, tile.slot].every(Number.isInteger) || tile.slot < 0 || tile.slot > 4) return {error: 'Harf veya kutu geçersiz.'};
    const key = `${tile.row},${tile.col}`;
    if (slots.has(tile.slot) || targets.has(key)) return {error: 'Bir harf veya kutu aynı hamlede iki kez kullanılamaz.'};
    if (!room.puzzle.cells.some(c => c.row === tile.row && c.col === tile.col) || room.filled[key]) return {error: 'Bir kutuyu başka oyuncu doldurdu veya kutu kapalı. Puanın değişmedi; hamleni düzenle.'};
    if (!player.rack[tile.slot] || tile.letter !== player.rack[tile.slot]) return {error: 'Elindeki harf değişti. Hamleni yeniden düzenle.'};
    slots.add(tile.slot); targets.add(key);
  }
  const results = data.placements.map(tile => ({...tile, ...place(room, id, {...tile, revision: room.revision}, now, true)}));
  fillRacks(room); player.handVersion++;
  const wrong = results.filter(r => r.wrong).length, points = results.reduce((sum, r) => sum + r.points, 0);
  const response = {ok: true, results, wrong, points, message: results.length ? `${results.length - wrong} doğru${wrong ? ` · ${wrong} yanlış` : ''} · ${points > 0 ? '+' : ''}${points} puan` : 'Boş hamle onaylandı. Harflerin korundu.'};
  player.confirmations.set(data.requestId, response);
  while (player.confirmations.size > 16) player.confirmations.delete(player.confirmations.keys().next().value);
  return response;
}

// Chunked transfers preserve the platform's 4 KiB per-packet budget.
export function upload(room, id, data, now) {
  if (!room.players[id]) return {error: 'Oyuncu bulunamadı.'};
  if (room.phase === 'play') return {error: 'Maç sürerken tahta yüklenmez.'};
  if (!data || !Number.isInteger(data.index) || !Number.isInteger(data.total) || data.total < 1 || data.total > 30 || typeof data.chunk !== 'string' || data.chunk.length > 800 || typeof data.token !== 'string' || !/^[a-zA-Z0-9-]{1,40}$/.test(data.token)) return {error: 'Yükleme verisi geçersiz.'};
  let transfer = room.uploads.get(id);
  if (data.index === 0) { transfer = {token: data.token, total: data.total, next: 0, text: '', until: now + 30000, revision: room.revision}; room.uploads.set(id, transfer); }
  if (!transfer || transfer.token !== data.token || transfer.total !== data.total || transfer.next !== data.index || now > transfer.until) return {error: 'Yükleme kesildi. Baştan dene.'};
  transfer.text += data.chunk; transfer.next++;
  if (transfer.next !== transfer.total) return {ok: true};
  room.uploads.delete(id);
  if (room.revision !== transfer.revision) return {error: 'Başka bir oyuncu yeni tahta yükledi. Önizlemeyi kontrol edip yeniden yükle.'};
  try { room.puzzle = validatePuzzle(transfer.text); }
  catch (error) { return {error: error.message}; }
  room.revision++; room.phase = 'lobby'; room.filled = {}; room.completed = {}; room.feed = [];
  Object.values(room.players).forEach(p => { p.ready = false; p.rack = []; p.spent = []; });
  notice(room, `${room.players[id].name} yeni bulmaca yükledi.`);
  return {ok: true, installed: true};
}
export function view(room, id, now) {
  const me = room.players[id];
  return {code: room.code, host: room.host, phase: room.phase, until: room.until, now, duration: room.duration, revision: room.revision,
    title: room.puzzle.title, category: room.puzzle.category, rows: room.puzzle.rows, cols: room.puzzle.cols,
    clueCells: room.puzzle.clueCells,
    cells: room.puzzle.cells.map(c => ({row: c.row, col: c.col, entries: c.entries, ...room.filled[`${c.row},${c.col}`], ...(room.phase === 'end' ? {solution: c.letter} : {})})),
    entries: room.puzzle.entries.map(e => ({id: e.id, clue: e.clue, row: e.row, col: e.col, startRow: e.startRow, startCol: e.startCol, direction: e.direction, length: e.answer.length, completedBy: room.completed[e.id], ...(room.phase === 'end' ? {answer: e.answer} : {})})),
    players: Object.values(room.players).map(({id, name, score, words, bonuses, ready}) => ({id, name, score, words, bonuses, ready})),
    me: me ? {rack: me.rack, spent: me.spent, handVersion: me.handVersion} : null, feed: room.feed, reason: room.reason || '',
    filled: Object.keys(room.filled).length, total: room.puzzle.cells.length, completed: Object.keys(room.completed).length};
}
