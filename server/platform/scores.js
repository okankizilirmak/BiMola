import {randomBytes, createHash} from 'node:crypto';
import {mkdirSync, existsSync, readFileSync, truncateSync} from 'node:fs';
import {appendFile, writeFile, rename} from 'node:fs/promises';
import {join} from 'node:path';

export const PLAYER_COOKIE = 'bimola-player';
const digest = token => createHash('sha256').update(token).digest('hex');
export function playerToken(cookie = '') {
  const token = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(PLAYER_COOKIE + '='))?.slice(PLAYER_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token || '') ? token : null;
}

// Kalıcı günlük tek bir yazma kuyruğundan geçer; oyun döngüsünde disk işlemi beklenmez.
// 500 kayıtta atomik özet alınır. Profil belirteçlerinin yalnızca özetleri diskte tutulur.
export function createScores({directory = null, logger = console} = {}) {
  const profiles = new Map();
  let queue = Promise.resolve(), error = null, writes = 0;
  const snapshot = directory && join(directory, 'scores.json'), journal = directory && join(directory, 'scores.jsonl');
  function apply(event, target = profiles) {
    if (event.kind === 'profile') { if (!target.has(event.id)) target.set(event.id, {name: 'Misafir', games: {}}); return; }
    const profile = target.get(event.profileId);
    if (!profile) return;
    const stats = profile.games[event.gameId] ||= {total: 0, best: 0, streak: 0, correct: 0, answered: 0, played: 0, seen: {}};
    if ((stats.seen[event.matchId] ?? -1) >= event.round) return;
    stats.seen[event.matchId] = event.round;
    // Yalnızca etkin/yakın maçların tekrar kaydı önlenir; defter sınırsız büyümez.
    while (Object.keys(stats.seen).length > 64) delete stats.seen[Object.keys(stats.seen)[0]];
    profile.name = String(event.name || profile.name).slice(0, 18);
    if (event.completed) stats.played++;
    else {
      stats.total += event.points; stats.correct += event.correct; stats.answered += event.answered;
      stats.best = Math.max(stats.best, event.score); stats.streak = Math.max(stats.streak, event.streak);
    }
  }
  if (directory) {
    mkdirSync(directory, {recursive: true});
    if (existsSync(snapshot)) for (const [id, profile] of JSON.parse(readFileSync(snapshot, 'utf8'))) profiles.set(id, profile);
    if (existsSync(journal)) {
      const bytes = readFileSync(journal), end = bytes.lastIndexOf(10) + 1;
      // Kesilmiş son satır bir önceki sağlam kayda kadar geri alınır.
      if (end < bytes.length) { truncateSync(journal, end); logger.warn('Puan günlüğündeki tamamlanmamış son kayıt atlandı.'); }
      for (const line of bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean)) apply(JSON.parse(line));
    }
  }
  const durableProfiles = new Map([...profiles].map(([id, profile]) => [id, structuredClone(profile)]));
  function save(event) {
    apply(event);
    if (!directory) return;
    queue = queue.then(async () => {
      await appendFile(journal, JSON.stringify(event) + '\n', {mode: 0o600});
      apply(event, durableProfiles);
      if (++writes >= 500) {
        // Özet yalnızca diske yazılmış olayları içerir; ilerideki kuyruk kayıtları
        // yeniden başlatmada kaybolmaz veya ikinci kez puanlanmaz.
        await writeFile(snapshot + '.tmp', JSON.stringify([...durableProfiles]), {mode: 0o600});
        await rename(snapshot + '.tmp', snapshot);
        await writeFile(journal, '', {mode: 0o600}); writes = 0;
      }
    }).catch(cause => { error = cause; logger.error('Puanlar diske yazılamadı:', cause); });
  }
  const resolve = token => token && profiles.has(digest(token)) ? digest(token) : null;
  const publicStats = (id, gameId) => {
    const stats = profiles.get(id)?.games[gameId];
    return stats ? {total: stats.total, best: stats.best, streak: stats.streak, correct: stats.correct, answered: stats.answered, played: stats.played} : {total: 0, best: 0, streak: 0, correct: 0, answered: 0, played: 0};
  };
  return {
    resolve,
    identity(token) {
      if (resolve(token)) return {token, id: resolve(token), fresh: false};
      token = randomBytes(32).toString('hex'); const id = digest(token);
      save({kind: 'profile', id}); return {token, id, fresh: true};
    },
    record(gameId, events) { for (const event of events) if (profiles.has(event.profileId)) save({...event, gameId, kind: 'score'}); },
    profile(id) { return {name: profiles.get(id)?.name || 'Misafir', games: Object.fromEntries(Object.keys(profiles.get(id)?.games || {}).map(gameId => [gameId, publicStats(id, gameId)])), durable: !!directory, healthy: !error}; },
    leaderboard(gameId, mine) {
      const rows = [...profiles].filter(([, p]) => p.games[gameId]?.answered).map(([id, p]) => ({name: p.name, ...publicStats(id, gameId), mine: id === mine, key: id})).sort((a, b) => b.total - a.total || b.best - a.best || a.key.localeCompare(b.key));
      return {rows: rows.slice(0, 20).map(({key, ...row}, i) => ({...row, rank: i + 1})), rank: rows.findIndex(p => p.mine) + 1 || null, me: publicStats(mine, gameId), durable: !!directory, healthy: !error};
    },
    async flush() { await queue; if (error) throw error; },
  };
}
