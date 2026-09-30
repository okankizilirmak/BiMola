import {readName, saveName} from '../../platform/profile.js';
import {buildPrompt, parseSet, summarizeSet, chunkText} from './questions.js';
import {createAudio} from './audio.js';

const $ = id => document.getElementById(id), $$ = selector => [...document.querySelectorAll(selector)];
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const GAME = 'ates-koprusu', KEYS = ['A', 'B', 'C', 'D'];
const ATTACKS = ['freeze', 'shuffle', 'fog', 'slow'];
const JOKER_INFO = {
  double: ['Çifte Ateş', 'Bu soruda kazandığın puanı ikiye katlar.'], half: ['50/50', '3–4 şıklı sorularda yanlış seçenekleri azaltır.'],
  shield: ['Kalkan', 'Bu soruda kütükten ve çakallıklardan korur; buz ve sisi temizler.'], freeze: ['Dondur', 'Rakibin şıklarını en fazla 4 saniye dondurur.'],
  shuffle: ['Karıştır', 'Rakibin şıklarını yer değiştirir. Seçtiği cevap korunur.'], fog: ['Sis', 'Rakibin sorusunu en fazla 2,5 saniye örter; şıklar açık kalır.'],
  slow: ['Hız Kes', 'Rakibin bu sorudaki hız bonusunu kaldırır; doğru cevap ve seri puanı kalır.'],
};
const flameSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.6 1.3-4.1 2.4-5.2.2 1.8 1 2.7 2 3.2C11 8 11.5 5 12 2Z"/></svg>';
const store = {
  get: (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* depolama kapalı olabilir */ } },
};
const socket = io('/games/' + GAME, {autoConnect: false}), audio = createAudio();
let state = null, code = null, offset = 0, scene = null, colorFor = () => '#ff9f43';
let builtRound = 0, lastRevealRound = 0, lastTick = -1, lastCount = -1, timer = 0, roomsTimer = 0, roomsRequest = null, closing = false, pendingSet = null, uploading = false;
const feedSeen = new Map();
let builtOrder = '', jokerTab = 'support', wizardStep = 1, records = null, lastPodium = '', bestBefore = 0, recordRequest = null, lastAttackRound = 0;
let quality = store.get('ates-quality', matchMedia('(max-width: 700px)').matches ? 'low' : 'high');
let motion = store.get('ates-motion', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full');
audio.enabled = store.get('ates-sound', '1') === '1';

// 3D sahne isteğe bağlıdır ve arka planda yüklenir: soket olayları beklemeden dinlenir,
// WebGL açılmazsa oyun kartlarla oynanmaya devam eder.
import('./scene.js').then(module => {
  if (closing) return;
  colorFor = module.colorFor;
  scene = module.createScene($('scene'), $('labels'), {quality, reducedMotion: motion === 'reduced'});
  if (state?.players) scene.setState(state, state.me, offset);
  if (!document.hidden) scene.start();
}).catch(error => { console.warn('Köprü sahnesi açılamadı:', error); document.body.classList.add('no-webgl'); });

function toast(message) {
  const node = $('toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}
function screen(name) {
  document.body.classList.remove('screen-home', 'screen-room', 'screen-game'); document.body.classList.add(`screen-${name}`);
  $('home').classList.toggle('hidden', name !== 'home');
  $('room').classList.toggle('hidden', name !== 'room');
  $('hud').classList.toggle('hidden', name !== 'game');
  if (name === 'home') refreshRooms(); else { clearTimeout(roomsTimer); roomsRequest?.abort(); }
}
const serverNow = () => Date.now() + offset;
const me = () => state?.players.find(p => p.id === state.me);
const inviteLink = () => `${location.origin}/games/${GAME}/?room=${code || ''}`;
async function copy(text, message) { try { await navigator.clipboard.writeText(text); toast(message); return true; } catch { return false; } }
const streakLabel = streak => streak < 2 ? '' : `${flameSvg}${streak} seri`;

// Kimlik sunucunun HttpOnly çerezinde kalır; istemci hiçbir zaman puan göndermez.
function recordCards(container, stats) {
  container.replaceChildren(...[['Toplam puan', stats.total], ['Maç rekoru', stats.best], ['En uzun seri', stats.streak]].map(([label, value]) => {
    const card = el('div', 'record'); card.append(el('b', '', value.toLocaleString('tr')), el('small', '', label)); return card;
  }));
}
async function loadScores() {
  if (recordRequest) return recordRequest;
  recordRequest = (async () => {
    try {
      const response = await fetch(`/api/games/${GAME}/scores`, {cache: 'no-store'});
      if (!response.ok) throw new Error('Puan defteri açılamadı.');
      records = await response.json();
      recordCards($('home-records'), records.me); recordCards($('match-records'), records.me);
      $('records-note').textContent = records.durable ? 'Puanların bu tarayıcıdaki oyuncu kimliğinle korunur. Çerezini silersen yeni oyuncu olursun.' : 'Geçici sunucu: puanlar yeniden başlatmada kaybolur.';
      $('alltime-board').replaceChildren(...records.rows.map(p => {
        const row = el('li', p.mine ? 'me' : ''); row.append(el('span', '', `${p.rank}. ${p.name}${p.mine ? ' (sen)' : ''}`), el('b', '', p.total.toLocaleString('tr'))); return row;
      }));
      $('alltime-note').textContent = records.rows.length ? `${records.rank ? `Senin sıran: ${records.rank}. · ` : ''}İlk 20 oyuncu gösteriliyor.` : 'İlk ateşi sen yak. Oynadıkça puanların burada birikir.';
      if (state?.podium) $('match-record-note').textContent = `${records.me.best > bestBefore ? 'Yeni kişisel maç rekoru! · ' : ''}${records.me.played} maç tamamladın. Kazandığın puanlar ateş defterine eklendi.`;
    } catch {
      for (const id of ['records-note', 'match-record-note', 'alltime-note']) $(id).textContent = 'Puan defteri yüklenemedi. Bağlantını kontrol edip yeniden dene.';
    } finally { recordRequest = null; }
  })();
  return recordRequest;
}
$('alltime-open').addEventListener('click', () => { $('alltime-dialog').showModal(); loadScores(); });
fetch('/api/player', {cache: 'no-store'}).then(response => {
  if (!response.ok) throw new Error('Oyuncu kimliği açılamadı.');
  return loadScores();
}).catch(() => { $('records-note').textContent = 'Oyuncu kimliğin açılamadı; bu oturumdaki puanların kaydedilemeyebilir.'; }).finally(() => { if (!closing) socket.connect(); });

// ---------- Giriş ekranı ----------
$('name').value = readName() || '';
$('name').addEventListener('change', e => { e.target.value = saveName(e.target.value); });
function join(payload) {
  $('error').textContent = ''; audio.unlock();
  const name = saveName($('name').value || 'Misafir') || 'Misafir';
  socket.timeout(6000).emit('join', {name, ...payload}, (timeout, result) => {
    if (timeout) { $('error').textContent = 'Sunucu yanıt vermedi. Tekrar dene.'; return; }
    if (result?.error) { $('error').textContent = result.error; screen('home'); return; }
    code = result.code;
    history.replaceState(null, '', `?room=${result.code}`);
    if (result.waiting) toast('Bu soru bitmek üzere; sonraki soruda köprüdesin.');
  });
}
$('create').addEventListener('click', () => join({}));
$('join-form').addEventListener('submit', e => {
  e.preventDefault();
  const value = $('code').value.trim();
  if (!/^\d{4}$/.test(value)) { $('error').textContent = '4 haneli oda kodunu yaz.'; return; }
  join({code: value});
});
async function refreshRooms() {
  clearTimeout(roomsTimer);
  if (closing || document.hidden || $('home').classList.contains('hidden') || roomsRequest) return;
  const controller = roomsRequest = new AbortController();
  try {
    const rooms = await (await fetch(`/api/rooms?gameId=${GAME}`, {cache: 'no-store', signal: controller.signal})).json();
    if (!rooms.length) $('rooms').replaceChildren(el('p', 'muted', 'Şu an açık köprü yok. İlk odayı sen kur.'));
    else $('rooms').replaceChildren(...rooms.map(room => {
      const row = el('div', 'room-row'), info = el('div'), button = el('button', 'secondary', 'Katıl');
      info.append(el('b', '', `Oda ${room.code}`), el('small', '', `${room.players}/${room.capacity} kişi · ${room.phase === 'lobby' ? 'Hazırlanıyor' : `${room.round}/${room.total}. soru`}`));
      button.type = 'button'; button.addEventListener('click', () => join({code: room.code}));
      row.append(info, button); return row;
    }));
  } catch (error) { if (error.name !== 'AbortError') $('rooms').textContent = 'Odalar yüklenemedi.'; }
  finally { roomsRequest = null; if (!closing && !document.hidden) roomsTimer = setTimeout(refreshRooms, 15000); }
}
$('rooms-refresh').addEventListener('click', refreshRooms);

// ---------- Bağlantı ----------
socket.on('connect', () => {
  $('connection').textContent = 'Çevrimiçi'; $('connection').classList.add('online');
  const invite = new URLSearchParams(location.search).get('room');
  if (invite && /^\d{4}$/.test(invite) && !state) { $('code').value = invite; join({code: invite}); }
});
socket.on('disconnect', () => {
  $('connection').textContent = 'Bağlantı kesildi'; $('connection').classList.remove('online');
  if (closing) return;
  if (state) { resetRoom(); $('error').textContent = 'Bağlantın koptu. Yeniden bağlanınca odaya tekrar katılabilirsin.'; }
});
socket.on('connect_error', () => { $('connection').textContent = 'Sunucuya bağlanılamadı'; });
socket.on('room-error', ({error}) => { resetRoom(); $('error').textContent = error; });
socket.on('state', next => {
  if (next.gameId !== GAME || next.protocolVersion !== 1) return;
  offset = next.now - Date.now();
  const previous = state; state = next;
  if ($('sets-dialog').open) setDestination();
  if (next.phase === 'countdown' && previous?.phase === 'lobby') bestBefore = records?.me.best || 0;
  for (const b of $$('.copy-invite')) b.textContent = code || '';
  scene?.setState(next, next.me, offset);
  if (['lobby', 'countdown'].includes(next.phase)) {
    screen('room'); renderLobby(previous);
    if (next.phase === 'countdown') startTimer(); else { stopTimer(); $('countdown').classList.add('hidden'); }
  } else { $('countdown').classList.add('hidden'); screen('game'); renderGame(); startTimer(); }
});
function resetRoom() {
  state = null; code = null; builtRound = lastRevealRound = lastAttackRound = 0; builtOrder = ''; lastPodium = ''; feedSeen.clear(); stopTimer();
  history.replaceState(null, '', location.pathname);
  for (const d of $$('dialog[open]')) d.close();
  $('countdown').classList.add('hidden');
  screen('home');
  loadScores();
  scene?.setState({players: [], phase: 'lobby', question: null, timing: {reveal: 4000}, until: 0}, null, 0);
}
function leave() { socket.emit('leave'); resetRoom(); }
for (const button of $$('.leave')) button.addEventListener('click', leave);

// ---------- Lobi: hazır kontrolü, havuz, podyum ----------
function renderPodium() {
  const podium = state.podium;
  $('podium').classList.toggle('hidden', !podium);
  $('room-eyebrow').textContent = podium ? `${podium.game}. OYUN BİTTİ` : 'KÖPRÜ BAŞI';
  $('room-title').textContent = podium ? 'Tekrar mı? Yeni setleri ekleyin, hazır olun.' : 'Herkes hazır olunca köprü açılır.';
  if (!podium) return;
  const key = `${code}:${podium.game}`;
  if (lastPodium !== key) { lastPodium = key; $('match-record-note').textContent = 'Puanların ateş defterine ekleniyor…'; loadScores(); }
  const top = podium.ranking.slice(0, 3), order = [1, 0, 2].filter(i => top[i]);
  $('podium-stage').replaceChildren(...order.map(i => {
    const p = top[i], step = el('div', `step p${i + 1}`);
    step.append(el('div', 'who', p.name), el('div', 'pts', `${p.score.toLocaleString('tr')} puan · ${p.correct}/${p.answered} doğru`), el('div', 'block', String(i + 1)));
    return step;
  }));
  $('awards').replaceChildren(...podium.awards.map(a => { const node = el('div', 'award'); node.append(el('small', '', a.title), `${a.name} · ${a.value}`); return node; }));
  $('ranking').replaceChildren(...podium.ranking.slice(3).map((p, i) => {
    const li = el('li'); li.classList.toggle('me', p.id === state.me);
    li.append(el('span', '', `${i + 4}. ${p.name}`), el('span', '', `${p.score.toLocaleString('tr')} puan`)); return li;
  }));
}
function renderLobby(previous) {
  const mine = me(), readyCount = state.players.filter(p => p.ready).length, total = state.players.length;
  $('copy-code').textContent = code || '';
  $('player-count').textContent = `${readyCount}/${total} hazır`;
  $('lobby-players').replaceChildren(...state.players.map(p => {
    const row = el('div', 'player'), dot = el('span', 'dot', p.name.slice(0, 1).toLocaleUpperCase('tr')), name = el('span', '', p.name + (p.id === state.me ? ' (sen)' : ''));
    dot.style.background = colorFor(p.id);
    if (p.id === state.host) name.append(el('span', 'host', '★'));
    row.append(dot, name, el('span', `tag${p.ready ? ' ok' : ''}`, p.ready ? 'Hazır ✓' : 'Bekleniyor'));
    return row;
  }));
  $('pool-count').textContent = state.pool.length ? `${state.poolTotal} soru` : '';
  if (!state.pool.length) $('pool').replaceChildren(el('div', 'queue-empty', `Havuz boş. Kimse set eklemezse "${state.starter.title}" (${state.starter.count} soru) oynanır.`));
  else $('pool').replaceChildren(...state.pool.map((set, index) => {
    const row = el('div', 'queue-item');
    row.append(el('b', '', set.title), el('span', '', `${set.count} soru · ${set.by}`));
    if (set.mine || state.host === state.me) {
      const remove = el('button', 'ghost', 'Kaldır'); remove.type = 'button';
      remove.addEventListener('click', () => socket.emit('remove-set', {index}, result => result?.error && toast(result.error)));
      row.append(remove);
    }
    return row;
  }));
  const ready = !!mine?.ready, button = $('ready');
  button.classList.toggle('is-ready', ready); button.setAttribute('aria-pressed', String(ready));
  button.innerHTML = ready ? 'Hazırsın · vazgeç <span aria-hidden="true">✕</span>' : 'Hazırım <span aria-hidden="true">✓</span>';
  const waiting = total - readyCount;
  $('lobby-note').textContent = state.phase === 'countdown' ? 'Herkes hazır, köprü açılıyor!' : waiting === 0 ? '' : ready ? `${waiting} kişi bekleniyor.` : 'Hazır olduğunda butona bas. Herkes hazır olunca oyun başlar.';
  renderPodium();
  if (previous?.phase !== 'lobby' && previous?.phase !== 'countdown' && state.podium && previous) audio.correct(5);
}
$('ready').addEventListener('click', () => {
  audio.unlock();
  socket.emit('ready', !me()?.ready, result => { if (result?.error) $('room-error').textContent = result.error; else $('room-error').textContent = ''; });
});
for (const button of [$('copy-code'), $('copy-link'), ...$$('.copy-invite')]) button.addEventListener('click', async () => {
  if (!(await copy(inviteLink(), 'Davet bağlantısı kopyalandı.'))) toast(`Davet kodu: ${code}`);
});

// ---------- Oyun ekranı ----------
// Kartlar her soruda bir kez kurulur ve yerinde güncellenir; yayın geldiğinde tıklanan düğme silinmez.
function buildCards(qn) {
  builtRound = qn.round;
  builtOrder = qn.options.map(o => o.id).join(',');
  const box = $('answers');
  box.classList.toggle('four', qn.options.length === 4);
  box.replaceChildren(...qn.options.map((option, i) => {
    const button = el('button', 'answer'), top = el('span', 'opt-top');
    button.type = 'button'; button.dataset.id = option.id; button.dataset.lane = i;
    top.append(el('span', 'letter', KEYS[i]), el('span', 'hint', qn.options.length === 2 ? (i ? 'sağ şerit · 2' : 'sol şerit · 1') : `${i + 1}. şerit · ${i + 1}`), el('span', 'check', '✓'));
    button.append(top, el('span', 'opt-text'));
    // Dokunmada bekleme olmasın diye seçim basıldığı anda yapılır; klavye için click de dinlenir.
    button.addEventListener('pointerdown', event => { if (event.button === 0) { event.preventDefault(); choose(option.id); } });
    button.addEventListener('click', event => { if (event.detail === 0) choose(option.id); });
    return button;
  }));
}
function updateCards(qn) {
  if (qn.round !== builtRound || builtOrder !== qn.options.map(o => o.id).join(',')) buildCards(qn);
  const revealed = state.phase !== 'question', mine = me(), frozen = qn.frozenUntil > serverNow();
  [...$('answers').children].forEach((button, i) => {
    const option = qn.options[i], chosen = qn.choice === option.id;
    const label = button.querySelector('.opt-text'), text = frozen ? 'Buz tuttu…' : option.text || '';
    if (label.textContent !== text) label.textContent = text;
    button.classList.toggle('chosen', chosen && !revealed);
    button.classList.toggle('removed', !!option.removed);
    button.classList.toggle('frozen', frozen && !revealed);
    button.classList.toggle('correct', revealed && option.id === qn.correct);
    button.classList.toggle('wrong', revealed && chosen && option.id !== qn.correct);
    button.classList.toggle('dim', revealed && !chosen && option.id !== qn.correct);
    button.disabled = revealed || frozen || !!option.removed || !!mine?.waiting;
    button.setAttribute('aria-pressed', String(chosen));
    button.setAttribute('aria-label', `${KEYS[i]}: ${frozen ? 'buz tuttu' : option.text}${option.removed ? ' (silindi)' : ''}`);
  });
  $('question-card').classList.toggle('frozen-me', frozen && !revealed);
}
function renderJokers(qn) {
  const mine = me(), open = state.phase === 'question' && !mine?.waiting;
  for (const button of $$('.joker')) {
    const type = button.dataset.joker, left = mine?.jokers?.[type] || 0, active = !!qn?.effects?.[type];
    button.classList.toggle('active', active && open);
    button.classList.toggle('used', !left && !active);
    button.classList.toggle('hidden', ATTACKS.includes(type) !== (jokerTab === 'attack'));
    const attack = ATTACKS.includes(type);
    button.disabled = !open || !left || (type === 'half' && qn.options.length < 3) || (attack && (qn.effects.attacked || state.until - serverNow() < 2000 || !state.players.some(p => p.id !== state.me && !p.waiting && !p.attacked && !p.protected)));
    button.setAttribute('aria-label', `${JOKER_INFO[type][0]} · ${left} hak. ${JOKER_INFO[type][1]}`);
  }
  $('support-left').textContent = ['double', 'half', 'shield'].reduce((sum, key) => sum + (mine?.jokers[key] || 0), 0);
  $('attack-left').textContent = ATTACKS.reduce((sum, key) => sum + (mine?.jokers[key] || 0), 0);
  if (!open) $('freeze-menu').classList.add('hidden');
}
function renderFeed() {
  const now = Date.now();
  for (const item of state.feed) if (!feedSeen.has(item.id)) feedSeen.set(item.id, now);
  for (const id of feedSeen.keys()) if (!state.feed.some(item => item.id === id)) feedSeen.delete(id);
  const visible = state.feed.filter(item => now - feedSeen.get(item.id) < 5000).slice(-3);
  const box = $('feed'), ids = visible.map(item => String(item.id));
  if ([...box.children].map(c => c.dataset.id).join() === ids.join()) return;
  box.replaceChildren(...visible.map(item => { const node = el('div', `feed-item ${item.kind}`, item.text); node.dataset.id = item.id; return node; }));
}
function renderGame() {
  const qn = state.question, mine = me();
  $('my-score').textContent = mine ? mine.score.toLocaleString('tr') : '0';
  $('my-streak').innerHTML = mine ? streakLabel(mine.streak) : '';
  const fireLevel = Math.min(5, mine?.streak || 0), meter = $('fire-meter');
  if (!meter.children.length) meter.append(...Array.from({length: 5}, () => el('i')));
  [...meter.children].forEach((bar, index) => bar.classList.toggle('lit', index < fireLevel));
  meter.setAttribute('aria-label', `Ateş seviyesi ${fireLevel}/5`);
  $('next-points').textContent = `Sonraki doğru: ${state.points[Math.min(mine?.streak || 0, 4)]} puan + hız`;
  if (!qn) return;
  $('q-round').textContent = `Soru ${qn.number}/${qn.total}`;
  $('q-set').textContent = `${qn.setTitle} · ${qn.by}`;
  $('q-golden').classList.toggle('hidden', !qn.golden);
  $('question-card').classList.toggle('golden', qn.golden);
  const questionText = qn.text || 'Sis çöktü… Şıklar açık, soruyu hatırlıyor musun?';
  if ($('q-text').textContent !== questionText) $('q-text').textContent = questionText;
  $('question-card').classList.toggle('fogged', state.phase === 'question' && qn.fogUntil > serverNow());
  updateCards(qn); renderJokers(qn); renderFeed();
  const result = qn.results?.[state.me], status = $('q-status');
  status.className = 'q-status';
  if (state.phase === 'question') {
    const answered = state.players.filter(p => p.hasAnswered).length, count = `${answered}/${state.players.length} cevapladı`;
    status.textContent = mine?.waiting ? 'Bu soru bitmek üzere; sonraki soruda sen de varsın.' : qn.frozenUntil > serverNow() ? `Donduruldun! Şıklar birazdan çözülecek. · ${count}` : qn.choice ? `Seçimin kaydedildi, istersen değiştir. · ${count}` : `Doğru şeridi seç. Hızlı olan bonus alır. · ${count}`;
  } else {
    const right = qn.options.find(o => o.id === qn.correct)?.text || '';
    status.textContent = `Doğru cevap: ${right}${qn.explanation ? ' · ' + qn.explanation : ''}`;
    if (result && !result.skip) status.classList.add(result.correct ? 'good' : 'bad');
  }
  if (state.phase === 'question') hideBannerFor(qn.round);
  if (state.phase === 'reveal' && qn.round !== lastRevealRound) { lastRevealRound = qn.round; showResult(result, qn); }
  renderBoard();
  renderAttackNotice();
}
function renderAttackNotice() {
  const qn = state.question, notice = $('attack-notice');
  const active = state.phase === 'question' && qn?.attack && !qn.effects.shield;
  notice.classList.toggle('hidden', !active);
  if (!active) return;
  if (lastAttackRound !== qn.round) { lastAttackRound = qn.round; audio.select(); }
  const attack = qn.attack, remaining = attack.type === 'freeze' ? qn.frozenUntil - serverNow() : attack.type === 'fog' ? qn.fogUntil - serverNow() : 0;
  notice.textContent = `${attack.by}: ${JOKER_INFO[attack.type][0]}! ${remaining > 0 ? `${Math.ceil(remaining / 1000)} sn · ` : ''}${attack.type === 'slow' ? 'Hız bonusun kapalı. Destek → Kalkan ile kurtul.' : attack.type === 'shuffle' ? 'Şıklar yer değiştirdi; seçimin korundu.' : remaining > 0 ? 'Destek → Kalkan ile kurtulabilirsin.' : 'Etki bitti. Bu soruda yeni saldırı alamazsın.'}`;
}
function showResult(result, qn) {
  const banner = $('result-banner');
  if (!result) return;
  const big = el('span'), small = el('small');
  if (result.skip) { big.textContent = 'Sıradaki soru senin'; small.textContent = 'Köprüye hoş geldin.'; banner.className = 'result-banner show'; }
  else if (result.correct) {
    if ([3, 5].includes(result.streak)) { $('fire-meter').classList.remove('flare'); requestAnimationFrame(() => $('fire-meter').classList.add('flare')); }
    big.textContent = `Doğru! +${result.points}`;
    const parts = [`${result.base} seri puanı`];
    if (result.speed) parts.push(`+${result.speed} hız`);
    if (result.slowed) parts.push('Hız Kes: hız bonusu yok');
    if (result.mult > 1) parts.push(`x${result.mult}${qn.golden && result.double ? ' (altın + çifte ateş)' : qn.golden ? ' altın' : ' çifte ateş'}`);
    small.textContent = `${parts.join(' · ')}${result.streak >= 3 ? ` · ${result.streak} seri, ateş büyüyor` : ''}`;
    banner.className = 'result-banner show good'; audio.correct(result.streak);
  } else if (result.shielded) {
    big.textContent = 'Kalkan kurtardı!'; small.textContent = 'Kütük sekti · serin ve yerin korundu';
    banner.className = 'result-banner show good'; audio.select();
  } else {
    big.textContent = result.answered ? 'Kütük!' : 'Süre doldu, kütük!'; small.textContent = 'Seri sıfırlandı · bir adım geri';
    banner.className = 'result-banner show bad'; audio.wrong();
  }
  banner.replaceChildren(big, small);
  clearTimeout(showResult.timer); showResult.timer = setTimeout(() => banner.classList.remove('show'), 2600);
}
function hideBannerFor() { const banner = $('result-banner'); banner.classList.remove('show'); if (banner.childNodes.length) banner.replaceChildren(); }
function renderBoard() {
  $('board').replaceChildren(...state.players.map((p, i) => {
    const li = el('li'), who = el('span', 'who', p.name), recent = el('span', 'recent');
    li.classList.toggle('me', p.id === state.me);
    if (p.streak >= 2) { const s = el('span', 'streak'); s.innerHTML = streakLabel(p.streak); who.append(s); }
    if (p.frozen) who.append(' ❄');
    recent.title = `Son ${p.recent.length} soruda ${p.recent.filter(Boolean).length} doğru · en iyi seri ${p.bestStreak}`;
    for (let k = 0; k < 10; k++) { const dot = el('i'), v = p.recent[p.recent.length - 10 + k]; if (v !== undefined) dot.className = v ? 'y' : 'n'; recent.append(dot); }
    li.append(el('span', 'rank', String(i + 1)), who, el('span', 'sc', p.score.toLocaleString('tr')), recent); return li;
  }));
  const rank = state.players.findIndex(p => p.id === state.me) + 1, mine = me(), lead = state.players[0];
  $('rank-open').replaceChildren(el('b', '', `${rank}/${state.players.length}`), el('small', '', rank === 1 ? 'Lidersin' : `Lidere ${Math.max(0, (lead?.score || 0) - (mine?.score || 0))} puan`));
  $('mobile-board').replaceChildren(...state.players.map((p, i) => { const row = el('li', p.id === state.me ? 'me' : ''); row.append(el('span', '', `${i + 1}. ${p.name}${p.id === state.me ? ' (sen)' : ''}`), el('b', '', p.score.toLocaleString('tr'))); return row; }));
}
$('rank-open').addEventListener('click', () => $('rank-dialog').showModal());
function setJokerTab(tab) {
  jokerTab = tab; $('support-tab').setAttribute('aria-pressed', String(tab === 'support')); $('attack-tab').setAttribute('aria-pressed', String(tab === 'attack'));
  $('freeze-menu').classList.add('hidden'); if (state?.question) renderJokers(state.question);
}
$('support-tab').addEventListener('click', () => setJokerTab('support'));
$('attack-tab').addEventListener('click', () => setJokerTab('attack'));
$('joker-guide').replaceChildren(...Object.values(JOKER_INFO).flatMap(([title, description]) => [el('dt', '', title), el('dd', '', description)]));
$('joker-help').addEventListener('click', () => $('joker-dialog').showModal());
function choose(id) {
  const qn = state?.question;
  if (state?.phase !== 'question' || !qn || qn.choice === id || me()?.waiting) return;
  if (qn.frozenUntil > serverNow()) { toast('Şıkların buz tuttu! Birazdan çözülecek.'); return; }
  if (qn.options.find(o => o.id === id)?.removed) return;
  audio.unlock(); audio.select();
  const previous = qn.choice;
  qn.choice = id; updateCards(qn); scene?.setState(state, state.me, offset); // İyimser gösterim.
  socket.emit('answer', id, result => {
    if (!result?.error) return;
    toast(result.error);
    if (state?.question?.round === qn.round && state.question.choice === id) { state.question.choice = previous; updateCards(state.question); }
  });
}
function useJoker(type, target) {
  audio.unlock();
  socket.emit('joker', target ? {type, target} : {type}, result => { if (result?.error) toast(result.error); });
  $('freeze-menu').classList.add('hidden');
}
for (const button of $$('.joker')) button.addEventListener('click', () => {
  const type = button.dataset.joker;
  if (!ATTACKS.includes(type)) return useJoker(type);
  const menu = $('freeze-menu');
  if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
  const rivals = state.players.filter(p => p.id !== state.me && !p.waiting && !p.attacked && !p.protected);
  menu.replaceChildren(el('p', '', rivals.length ? `${JOKER_INFO[type][0]} · kimi seçiyorsun?` : 'Bu soruda hedef alınabilecek rakip yok.'), ...rivals.map(p => {
    const b = el('button', '', p.name); b.type = 'button'; b.addEventListener('click', () => useJoker(type, p.id)); return b;
  }));
  const cancel = el('button', '', 'Vazgeç'); cancel.type = 'button'; cancel.addEventListener('click', () => menu.classList.add('hidden')); menu.append(cancel);
  menu.classList.remove('hidden');
});
function startTimer() { if (!timer) timer = setInterval(updateTimer, 100); updateTimer(); }
function stopTimer() { clearInterval(timer); timer = 0; }
function updateTimer() {
  if (!state) return;
  const left = Math.max(0, state.until - serverNow());
  if (state.phase === 'countdown') {
    const n = Math.max(1, Math.ceil(left / 1000));
    $('countdown').classList.remove('hidden');
    if (n !== lastCount) { lastCount = n; $('countdown-num').textContent = n; $('countdown-num').style.animation = 'none'; void $('countdown-num').offsetWidth; $('countdown-num').style.animation = ''; audio.tick(); }
    return;
  }
  lastCount = -1;
  if (state.phase === 'lobby') return;
  const total = state.timing[state.phase] || 1, fill = $('timer-fill');
  fill.style.transform = `scaleX(${state.phase === 'question' ? Math.min(1, left / total) : 0})`;
  fill.parentElement.classList.toggle('urgent', state.phase === 'question' && left < 3500);
  const secs = Math.ceil(left / 1000);
  $('timer-seconds').textContent = state.phase === 'question' ? `${secs} sn` : state.phase === 'reveal' ? 'Sonuç' : 'Hazırlan';
  $('timer-seconds').classList.toggle('urgent', state.phase === 'question' && secs <= 3);
  if (state.phase === 'question' && secs <= 3 && secs > 0 && secs !== lastTick) { lastTick = secs; audio.tick(); }
  if (state.phase !== 'question') lastTick = -1;
  // Buz çözülünce ve akış öğeleri eskiyince yayını beklemeden güncelle.
  if (state.phase === 'question' && state.question) { updateCards(state.question); renderFeed(); renderJokers(state.question); renderAttackNotice(); }
}
addEventListener('keydown', event => {
  if (!state || state.phase !== 'question' || event.target.closest('input,textarea,select,dialog') || event.metaKey || event.ctrlKey || event.altKey) return;
  const options = state.question?.options || [];
  const n = Number(event.key);
  if (n >= 1 && n <= options.length) { choose(options[n - 1].id); event.preventDefault(); return; }
  const letter = KEYS.indexOf(event.key.toUpperCase());
  if (letter >= 0 && letter < options.length) { choose(options[letter].id); return; }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const step = event.key === 'ArrowLeft' ? -1 : 1, current = options.findIndex(o => o.id === state.question.choice);
    let next = current < 0 ? (step < 0 ? 0 : options.length - 1) : current + step;
    while (options[next]?.removed) next += step;
    if (options[next]) choose(options[next].id);
    event.preventDefault();
  }
});

// ---------- Menü ve ayarlar ----------
$('menu-open').addEventListener('click', () => $('menu-dialog').showModal());
for (const button of $$('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('motion').value = motion;
$('motion').addEventListener('change', e => { motion = e.target.value; store.set('ates-motion', motion); scene?.setReducedMotion(motion === 'reduced'); });
const qualityText = () => { $('quality').textContent = `Görüntü: ${quality === 'high' ? 'Yüksek' : 'Hafif'}`; $('menu-quality').value = quality; };
qualityText();
$('quality').addEventListener('click', () => { quality = quality === 'high' ? 'low' : 'high'; store.set('ates-quality', quality); scene?.setQuality(quality); qualityText(); });
$('menu-quality').addEventListener('change', e => { quality = e.target.value; store.set('ates-quality', quality); scene?.setQuality(quality); qualityText(); });
const soundText = () => { $('sound').textContent = audio.enabled ? 'Ses açık' : 'Ses kapalı'; $('sound').setAttribute('aria-pressed', String(audio.enabled)); };
soundText();
$('sound').addEventListener('click', () => { audio.enabled = !audio.enabled; store.set('ates-sound', audio.enabled ? '1' : '0'); soundText(); });

// ---------- Soru seti yükleme ----------
function showStep(step) {
  if (uploading) return;
  if (step === 3 && !pendingSet) return;
  wizardStep = step;
  for (const panel of $$('.set-step')) panel.classList.toggle('hidden', Number(panel.dataset.panel) !== step);
  for (const button of $$('[data-step]')) { if (Number(button.dataset.step) === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); button.disabled = Number(button.dataset.step) === 3 && !pendingSet; }
  $('wizard-back').classList.toggle('hidden', step === 1); $('prompt-next').classList.toggle('hidden', step !== 1);
  $('check-set').classList.toggle('hidden', step !== 2); $('add-set').classList.toggle('hidden', step !== 3);
  $('sets-dialog').scrollTop = 0;
}
for (const button of $$('[data-step]')) button.addEventListener('click', () => showStep(Number(button.dataset.step)));
$('prompt-next').addEventListener('click', () => showStep(2));
$('wizard-back').addEventListener('click', () => showStep(wizardStep - 1));
function setDestination() {
  $('set-destination').textContent = `${state && !['lobby', 'countdown'].includes(state.phase) ? 'Bu set sonraki maça eklenecek; mevcut maç devam ediyor.' : 'Bu set odanın soru havuzuna eklenecek.'} 3–80 soru; bütün setler puan kazandırır.`;
}
for (const button of $$('.open-sets')) button.addEventListener('click', () => {
  if ($('menu-dialog').open) $('menu-dialog').close();
  setDestination();
  showStep(pendingSet ? 3 : 1); $('sets-dialog').showModal();
});
const promptText = () => buildPrompt({title: $('p-title').value || $('p-category').value, category: $('p-category').value, language: $('p-language').value, count: $('p-count').value, theme: $('p-theme').value});
$('copy-prompt').addEventListener('click', async () => {
  const text = promptText(), fallback = $('prompt-fallback');
  if (await copy(text, 'Prompt kopyalandı. AI aracına yapıştır.')) { fallback.classList.add('hidden'); return; }
  fallback.value = text; fallback.classList.remove('hidden'); fallback.focus(); fallback.select();
  toast('Kopyalanamadı; metni seçip kendin kopyala.');
});
const feedback = nodes => $('set-feedback').replaceChildren(...nodes);
function errorList(title, errors = []) {
  const list = el('ul'); list.append(...errors.map(e => el('li', '', e)));
  return [el('b', '', title), list];
}
function checkSet() {
  if (uploading) return;
  const result = parseSet($('set-json').value);
  pendingSet = result.set || null; $('add-set').disabled = !pendingSet || uploading;
  $('set-errors').replaceChildren();
  if (result.errors) { $('set-errors').replaceChildren(...errorList('JSON okunamadı. Şunları düzelt:', result.errors)); showStep(2); return; }
  const s = summarizeSet(result.set), box = el('div', 'ok'), list = el('ol');
  list.append(...result.set.questions.slice(0, 3).map(q => el('li', '', `${q.text} (${q.options.length} şık)`)));
  box.append(el('b', '', s.title), el('span', '', `${s.category} · ${s.count} soru · 2 şıklı: ${s.counts[2]}, 3 şıklı: ${s.counts[3]}, 4 şıklı: ${s.counts[4]}`), list);
  feedback([box]);
  showStep(3);
}
$('check-set').addEventListener('click', checkSet);
$('set-json').addEventListener('input', () => { pendingSet = null; $('add-set').disabled = true; $$('[data-step="3"]')[0].disabled = true; $('set-errors').replaceChildren(); });
$('set-json').addEventListener('paste', () => setTimeout(checkSet, 0)); // Yapıştırınca hemen kontrol et.
$('add-set').addEventListener('click', async () => {
  if (!pendingSet || uploading || !state) return;
  uploading = true; $('add-set').disabled = true;
  $('set-json').readOnly = true;
  const uploadRoom = code;
  const parts = chunkText(JSON.stringify(pendingSet)), uploadId = Math.random().toString(36).slice(2, 12).padEnd(6, '0');
  const bar = el('div', 'progress'), fill = el('i'); bar.append(fill); $('set-feedback').append(bar);
  try {
    let result;
    for (let index = 0; index < parts.length; index++) {
      if (closing || code !== uploadRoom) throw new Error('Oda değişti.');
      result = await socket.timeout(6000).emitWithAck('upload', {uploadId, index, total: parts.length, chunk: parts[index]});
      if (result?.error) break;
      fill.style.width = `${((index + 1) / parts.length) * 100}%`;
      if (index < parts.length - 1) await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (result?.error) feedback(errorList(result.error, result.errors || []));
    else {
      toast(result.nextGame ? `"${result.summary.title}" sonraki oyunun havuzuna eklendi.` : `"${result.summary.title}" havuza eklendi.`);
      $('set-json').value = ''; pendingSet = null; feedback([]); $('sets-dialog').close();
    }
  } catch { feedback(errorList('Yükleme tamamlanamadı. Aynı odada bağlantını kontrol edip tekrar dene.')); }
  finally { uploading = false; $('set-json').readOnly = false; $('add-set').disabled = !pendingSet; }
});

// ---------- Yaşam döngüsü ----------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { scene?.stop(); stopTimer(); clearTimeout(roomsTimer); }
  else { scene?.start(); if (state && state.phase !== 'lobby') startTimer(); if (!state) refreshRooms(); }
});
addEventListener('pagehide', () => {
  closing = true; stopTimer(); clearTimeout(roomsTimer); roomsRequest?.abort();
  socket.disconnect(); scene?.dispose(); scene = null; audio.close();
});
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
screen('home');
