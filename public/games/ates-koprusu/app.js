import {readName, saveName} from '../../platform/profile.js';
import {buildPrompt, parseSet, summarizeSet, chunkText} from './questions.js';
import {createAudio} from './audio.js';

const $ = id => document.getElementById(id), $$ = selector => [...document.querySelectorAll(selector)];
const GAME = 'ates-koprusu', KEYS = ['A', 'B', 'C', 'D'];
const flameSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.6 1.3-4.1 2.4-5.2.2 1.8 1 2.7 2 3.2C11 8 11.5 5 12 2Z"/></svg>';
const store = {
  get: (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* depolama kapalı olabilir */ } },
};
const socket = io('/games/' + GAME), audio = createAudio();
let state = null, offset = 0, scene = null, colorFor = () => '#ff9f43', lastRound = 0, lastRevealRound = 0, lastTick = -1;
let timer = 0, roomsTimer = 0, roomsRequest = null, closing = false, pendingSet = null, uploading = false;
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
}).catch(error => {
  console.warn('Köprü sahnesi açılamadı:', error);
  document.body.classList.add('no-webgl');
});

function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}
function screen(name) {
  document.body.classList.remove('screen-home', 'screen-room', 'screen-game'); document.body.classList.add(`screen-${name}`);
  $('home').classList.toggle('hidden', name !== 'home');
  $('room').classList.toggle('hidden', name !== 'room');
  $('hud').classList.toggle('hidden', name !== 'game');
  if (name === 'home') refreshRooms(); else { clearTimeout(roomsTimer); roomsRequest?.abort(); }
}
const serverNow = () => Date.now() + offset;
const inviteLink = () => `${location.origin}/games/${GAME}/?room=${state?.code || ''}`;
async function copy(text, message) {
  try { await navigator.clipboard.writeText(text); toast(message); return true; } catch { return false; }
}
const streakLabel = streak => streak < 2 ? '' : `${flameSvg}${streak} seri`;

// ---------- Giriş ekranı ----------
$('name').value = readName() || '';
$('name').addEventListener('change', e => { e.target.value = saveName(e.target.value); });
function join(payload) {
  $('error').textContent = '';
  audio.unlock();
  const name = saveName($('name').value || 'Misafir') || 'Misafir';
  socket.timeout(6000).emit('join', {name, ...payload}, (timeout, result) => {
    if (timeout) { $('error').textContent = 'Sunucu yanıt vermedi. Tekrar dene.'; return; }
    if (result?.error) { $('error').textContent = result.error; screen('home'); return; }
    state = {...(state || {}), code: result.code};
    history.replaceState(null, '', `?room=${result.code}`);
    if (result.waiting) toast('Bu soru bitmek üzere; sonraki soruda köprüdesin.');
  });
}
$('create').addEventListener('click', () => join({}));
$('join-form').addEventListener('submit', e => {
  e.preventDefault();
  const code = $('code').value.trim();
  if (!/^\d{4}$/.test(code)) { $('error').textContent = '4 haneli oda kodunu yaz.'; return; }
  join({code});
});
async function refreshRooms() {
  clearTimeout(roomsTimer);
  if (closing || document.hidden || $('home').classList.contains('hidden') || roomsRequest) return;
  const controller = roomsRequest = new AbortController();
  try {
    const rooms = await (await fetch(`/api/rooms?gameId=${GAME}`, {cache: 'no-store', signal: controller.signal})).json();
    const list = $('rooms');
    if (!rooms.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Şu an açık köprü yok. İlk odayı sen kur.'; list.replaceChildren(p); }
    else list.replaceChildren(...rooms.map(room => {
      const row = document.createElement('div'), info = document.createElement('div'), title = document.createElement('b'), detail = document.createElement('small'), button = document.createElement('button');
      row.className = 'room-row'; title.textContent = `Oda ${room.code}`;
      detail.textContent = `${room.players}/${room.capacity} kişi · ${room.phase === 'lobby' ? 'Başlamayı bekliyor' : `${room.round}. soru`} · ${room.set || ''}`;
      button.className = 'secondary'; button.type = 'button'; button.textContent = 'Katıl';
      button.addEventListener('click', () => join({code: room.code}));
      info.append(title, detail); row.append(info, button); return row;
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
  state = {...next, code: state?.code};
  scene?.setState(next, next.me, offset);
  if (next.phase === 'lobby') { screen('room'); renderLobby(); stopTimer(); }
  else { screen('game'); renderGame(); startTimer(); }
});
function resetRoom() {
  state = null; lastRound = lastRevealRound = 0; stopTimer();
  history.replaceState(null, '', location.pathname);
  for (const d of $$('dialog[open]')) d.close();
  screen('home');
  scene?.setState({players: [], phase: 'lobby', question: null, timing: {reveal: 4000}, until: 0}, null, 0);
}
function leave() { socket.emit('leave'); resetRoom(); }
for (const button of $$('.leave')) button.addEventListener('click', leave);

// ---------- Oda lobisi ----------
function playerRow(p, extra) {
  const row = document.createElement('div'), dot = document.createElement('span'), name = document.createElement('span'), small = document.createElement('small');
  row.className = 'player'; dot.className = 'dot'; dot.style.background = colorFor(p.id); dot.textContent = p.name.slice(0, 1).toLocaleUpperCase('tr');
  name.textContent = p.name + (p.id === state.me ? ' (sen)' : ''); small.textContent = extra;
  row.append(dot, name, small); return row;
}
function setCard(target, set, label) {
  const b = document.createElement('b'), span = document.createElement('span');
  b.textContent = set.title; span.textContent = `${label}${set.category} · ${set.count} soru · Ekleyen: ${set.by}`;
  target.replaceChildren(b, span);
}
function renderQueue(target) {
  if (!state.queue.length) { target.replaceChildren(); return; }
  target.replaceChildren(...state.queue.map((set, index) => {
    const row = document.createElement('div'), title = document.createElement('b'), meta = document.createElement('span');
    row.className = 'queue-item'; title.textContent = `${index + 1}. ${set.title}`; meta.textContent = `${set.count} soru · ${set.by}`;
    row.append(title, meta);
    if (set.mine || state.host === state.me) {
      const remove = document.createElement('button'); remove.className = 'ghost'; remove.type = 'button'; remove.textContent = 'Kaldır';
      remove.addEventListener('click', () => socket.emit('remove-set', {index}, result => result?.error && toast(result.error)));
      row.append(remove);
    }
    return row;
  }));
}
function renderLobby() {
  const host = state.host === state.me;
  $('copy-code').textContent = state.code; $('player-count').textContent = `${state.players.length}/12`;
  $('lobby-players').replaceChildren(...state.players.map(p => playerRow(p, p.id === state.host ? 'Kurucu' : '')));
  setCard($('lobby-set'), state.set, 'İlk set · ');
  renderQueue($('lobby-queue'));
  $('start').hidden = !host;
  $('lobby-note').textContent = host ? 'Hazır olduğunda başlat. Sonradan gelenler akışa katılır.' : 'Kurucunun köprüyü başlatması bekleniyor.';
}
$('start').addEventListener('click', () => { audio.unlock(); socket.emit('start', result => { if (result?.error) $('room-error').textContent = result.error; }); });
for (const button of [$('copy-code'), $('copy-link'), ...$$('.copy-invite')]) button.addEventListener('click', async () => {
  if (!(await copy(inviteLink(), 'Davet bağlantısı kopyalandı.'))) toast(`Davet kodu: ${state?.code}`);
});

// ---------- Oyun ekranı ----------
function renderGame() {
  const qn = state.question, mine = state.players.find(p => p.id === state.me), revealed = qn && state.phase !== 'question';
  $('my-score').textContent = mine ? mine.score.toLocaleString('tr') : '0';
  $('my-streak').innerHTML = mine ? streakLabel(mine.streak) : '';
  $('q-round').textContent = `${state.round}. soru`;
  $('q-set').textContent = `${state.set.title} · ${state.set.index}/${state.set.count}`;
  $('q-text').textContent = qn?.text || '';
  $$('.copy-invite').forEach(b => { b.textContent = state.code; });
  const result = qn?.results?.[state.me];
  // Cevap kartları soldan sağa, köprüdeki kendi şeritlerimle aynı sırada.
  const cards = (qn?.options || []).map((option, i) => {
    const button = document.createElement('button'), key = document.createElement('span'), text = document.createElement('span'), lane = document.createElement('span');
    button.type = 'button'; button.className = 'answer'; button.dataset.id = option.id;
    key.className = 'key'; key.textContent = `${KEYS[i]} · ${i + 1}`; text.textContent = option.text;
    lane.className = 'lane-arrow'; lane.textContent = qn.options.length === 2 ? (i ? 'sağ şerit' : 'sol şerit') : `${i + 1}. şerit`;
    button.append(key, text, lane);
    const chosen = qn.choice === option.id;
    button.classList.toggle('chosen', chosen);
    button.setAttribute('aria-pressed', String(chosen));
    button.setAttribute('aria-label', `${KEYS[i]}: ${option.text}`);
    if (revealed) {
      button.disabled = true;
      if (option.id === qn.correct) button.classList.add('correct');
      else if (chosen) button.classList.add('wrong'); else button.classList.add('dim');
    } else if (mine?.waiting) button.disabled = true;
    button.addEventListener('click', () => choose(option.id));
    return button;
  });
  $('answers').replaceChildren(...cards);
  const status = $('q-status'); status.className = 'q-status';
  if (state.phase === 'question') {
    const answered = state.players.filter(p => p.ready).length, count = `(${answered}/${state.players.length} cevapladı)`;
    status.textContent = mine?.waiting ? 'Bu soru bitmek üzere; sonraki soruda sen de varsın.' : qn.choice ? `Seçimin kaydedildi, istersen değiştirebilirsin. ${count}` : `Doğru cevabın olduğu şeridi seç. ${count}`;
  } else if (revealed) {
    const right = qn.options.find(o => o.id === qn.correct)?.text || '';
    status.textContent = `Doğru cevap: ${right}${qn.explanation ? ' · ' + qn.explanation : ''}`;
    if (result && !result.skip) status.classList.add(result.correct ? 'good' : 'bad');
  }
  if (state.phase === 'question' && qn.round !== lastRound) { lastRound = qn.round; hideBanner(); }
  if (state.phase === 'reveal' && qn.round !== lastRevealRound) { lastRevealRound = qn.round; showResult(result); }
  if (state.phase === 'pause') hideBanner();
  renderBoard();
}
function showResult(result) {
  const banner = $('result-banner');
  if (!result) return;
  const big = document.createElement('span'), small = document.createElement('small');
  if (result.skip) { big.textContent = 'Sıradaki soru senin'; small.textContent = 'Köprüye hoş geldin.'; banner.className = 'result-banner show'; }
  else if (result.correct) {
    big.textContent = `Doğru! +${result.points}`;
    small.textContent = result.streak >= 5 ? `${result.streak} seri · alev en güçlü hâlinde` : result.streak >= 3 ? `${result.streak} seri · ateş büyüyor` : result.streak === 2 ? '2 seri · ısınıyorsun' : 'Bir adım ileri';
    banner.className = 'result-banner show good'; audio.correct(result.streak);
  } else {
    big.textContent = result.answered ? 'Kütük!' : 'Süre doldu, kütük!';
    small.textContent = 'Seri sıfırlandı · bir adım geri';
    banner.className = 'result-banner show bad'; audio.wrong();
  }
  banner.replaceChildren(big, small);
  // Sahnedeki kütük görünsün diye yazı kısa süre sonra kalkar.
  clearTimeout(showResult.timer); showResult.timer = setTimeout(hideBanner, 2600);
}
function hideBanner() { $('result-banner').classList.remove('show'); }
function renderBoard() {
  $('board').replaceChildren(...state.players.map((p, i) => {
    const li = document.createElement('li'), rank = document.createElement('span'), who = document.createElement('span'), score = document.createElement('span'), recent = document.createElement('span');
    li.classList.toggle('me', p.id === state.me);
    rank.className = 'rank'; rank.textContent = i + 1;
    who.className = 'who'; who.textContent = p.name;
    if (p.streak >= 2) { const s = document.createElement('span'); s.className = 'streak'; s.innerHTML = streakLabel(p.streak); who.append(s); }
    score.className = 'sc'; score.textContent = p.score.toLocaleString('tr');
    recent.className = 'recent'; recent.title = `Son ${p.recent.length} soruda ${p.recent.filter(Boolean).length} doğru · en iyi seri ${p.bestStreak}`;
    for (let k = 0; k < 10; k++) { const dot = document.createElement('i'), v = p.recent[p.recent.length - 10 + k]; if (v !== undefined) dot.className = v ? 'y' : 'n'; recent.append(dot); }
    li.append(rank, who, score, recent); return li;
  }));
}
function choose(id) {
  if (state?.phase !== 'question' || state.question?.choice === id) return;
  if (state.players.find(p => p.id === state.me)?.waiting) return;
  audio.unlock(); audio.select();
  state.question.choice = id; renderGame(); // İyimser gösterim; kesin durum sunucudan gelir.
  scene?.setState(state, state.me, offset);
  socket.emit('answer', id, result => { if (result?.error) toast(result.error); });
}
function startTimer() { if (!timer) timer = setInterval(updateTimer, 100); updateTimer(); }
function stopTimer() { clearInterval(timer); timer = 0; }
function updateTimer() {
  if (!state || state.phase === 'lobby') return;
  const total = state.timing[state.phase] || 1, left = Math.max(0, state.until - serverNow());
  const fill = $('timer-fill');
  fill.style.transform = `scaleX(${state.phase === 'question' ? Math.min(1, left / total) : 0})`;
  fill.parentElement.classList.toggle('urgent', state.phase === 'question' && left < 3500);
  const secs = Math.ceil(left / 1000);
  if (state.phase === 'question' && secs <= 3 && secs > 0 && secs !== lastTick) { lastTick = secs; audio.tick(); }
  if (state.phase !== 'question') lastTick = -1;
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
    const next = current < 0 ? (step < 0 ? 0 : options.length - 1) : Math.max(0, Math.min(options.length - 1, current + step));
    choose(options[next].id); event.preventDefault();
  }
});

// ---------- Menü ve ayarlar ----------
$('menu-open').addEventListener('click', () => $('menu-dialog').showModal());
for (const button of $$('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
$('motion').value = motion;
$('motion').addEventListener('change', e => { motion = e.target.value; store.set('ates-motion', motion); scene?.setReducedMotion(motion === 'reduced'); });
const qualityText = () => { $('quality').textContent = `Görüntü: ${quality === 'high' ? 'Yüksek' : 'Düşük'}`; };
qualityText();
$('quality').addEventListener('click', () => { quality = quality === 'high' ? 'low' : 'high'; store.set('ates-quality', quality); scene?.setQuality(quality); qualityText(); });
const soundText = () => { $('sound').textContent = audio.enabled ? 'Ses açık' : 'Ses kapalı'; $('sound').setAttribute('aria-pressed', String(audio.enabled)); };
soundText();
$('sound').addEventListener('click', () => { audio.enabled = !audio.enabled; store.set('ates-sound', audio.enabled ? '1' : '0'); soundText(); });

// ---------- Soru seti yükleme ----------
for (const button of $$('.open-sets')) button.addEventListener('click', () => $('sets-dialog').showModal());
const promptText = () => buildPrompt({title: $('p-title').value, category: $('p-category').value, language: $('p-language').value, count: $('p-count').value, theme: $('p-theme').value});
$('copy-prompt').addEventListener('click', async () => {
  const text = promptText(), fallback = $('prompt-fallback');
  if (await copy(text, 'Prompt kopyalandı. AI aracına yapıştır.')) { fallback.classList.add('hidden'); return; }
  fallback.value = text; fallback.classList.remove('hidden'); fallback.focus(); fallback.select();
  toast('Kopyalanamadı; metni seçip kendin kopyala.');
});
const feedback = nodes => $('set-feedback').replaceChildren(...nodes);
function errorList(title, errors = []) {
  const b = document.createElement('b'), list = document.createElement('ul');
  b.textContent = title;
  list.append(...errors.map(e => { const li = document.createElement('li'); li.textContent = e; return li; }));
  return [b, list];
}
function checkSet() {
  const result = parseSet($('set-json').value);
  pendingSet = result.set || null; $('add-set').disabled = !pendingSet || uploading;
  if (result.errors) { feedback(errorList('Set eklenemedi. Şunları düzelt:', result.errors)); return; }
  const s = summarizeSet(result.set), box = document.createElement('div'), title = document.createElement('b'), meta = document.createElement('span'), list = document.createElement('ol');
  box.className = 'ok'; title.textContent = s.title;
  meta.textContent = `${s.category} · ${s.count} soru · 2 şıklı: ${s.counts[2]}, 3 şıklı: ${s.counts[3]}, 4 şıklı: ${s.counts[4]}`;
  list.append(...result.set.questions.slice(0, 3).map(q => { const li = document.createElement('li'); li.textContent = `${q.text} (${q.options.length} şık)`; return li; }));
  box.append(title, meta, list); feedback([box]);
}
$('check-set').addEventListener('click', checkSet);
$('set-json').addEventListener('input', () => { pendingSet = null; $('add-set').disabled = true; });
$('add-set').addEventListener('click', async () => {
  if (!pendingSet || uploading || !state) return;
  uploading = true; $('add-set').disabled = true;
  const parts = chunkText(JSON.stringify(pendingSet)), uploadId = Math.random().toString(36).slice(2, 12).padEnd(6, '0');
  const bar = document.createElement('div'), fill = document.createElement('i'); bar.className = 'progress'; bar.append(fill);
  $('set-feedback').append(bar);
  try {
    let result;
    for (let index = 0; index < parts.length; index++) {
      result = await socket.timeout(6000).emitWithAck('upload', {uploadId, index, total: parts.length, chunk: parts[index]});
      if (result?.error) break;
      fill.style.width = `${((index + 1) / parts.length) * 100}%`;
      if (index < parts.length - 1) await new Promise(resolve => setTimeout(resolve, 30));
    }
    if (result?.error) feedback(errorList(result.error, result.errors || []));
    else {
      toast(result.active ? `"${result.summary.title}" ilk set olarak seçildi.` : `"${result.summary.title}" sıraya eklendi.`);
      $('set-json').value = ''; pendingSet = null; feedback([]); $('sets-dialog').close();
    }
  } catch { feedback(errorList('Yükleme zaman aşımına uğradı. Tekrar dene.')); }
  finally { uploading = false; $('add-set').disabled = !pendingSet; }
});

// ---------- Yaşam döngüsü ----------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { scene?.stop(); stopTimer(); clearTimeout(roomsTimer); }
  else { scene?.start(); if (state?.phase && state.phase !== 'lobby') startTimer(); if (!state) refreshRooms(); }
});
addEventListener('pagehide', () => {
  closing = true; stopTimer(); clearTimeout(roomsTimer); roomsRequest?.abort();
  socket.disconnect(); scene?.dispose(); scene = null; audio.close();
});
addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
screen('home');
