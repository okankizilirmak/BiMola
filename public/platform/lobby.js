import {readName, saveName} from './profile.js';

const $ = id => document.getElementById(id);
const phases = {lobby: 'Oyuncular bekleniyor', prep: 'Saklanma başladı', play: 'Tur sürüyor', end: 'Yeni tur bekleniyor'};
let games = [], rooms = [], filter = 'all', timer, roomRequest, catalogRequest, joinRequest, disposed = false;
$('nickname').value = readName();
$('nickname').addEventListener('change', event => { event.target.value = saveName(event.target.value); });

async function json(url, signal) {
  const response = await fetch(url, {cache: 'no-store', signal});
  if (!response.ok) throw new Error(response.status === 404 ? 'Bu kodla katılabileceğin bir oda bulunamadı.' : 'Bağlantı kurulamadı. Tekrar dene.');
  return response.json();
}
function renderGames() {
  const query = $('search').value.trim().toLocaleLowerCase('tr');
  const filtered = games.filter(game => (filter !== 'bots' || game.bots) && `${game.name} ${game.category} ${game.description}`.toLocaleLowerCase('tr').includes(query));
  $('game-count').textContent = games.length;
  $('catalog-status').textContent = filtered.length ? '' : 'Bu aramada oyun bulunamadı. Başka bir ad dene.';
  $('game-grid').replaceChildren(...filtered.map(game => {
    const fragment = $('game-template').content.cloneNode(true);
    const available = game.status === 'available';
    const image = fragment.querySelector('img');
    image.src = game.cover;
    fragment.querySelector('.cover-label').textContent = available ? game.category : 'Yakında';
    fragment.querySelector('.game-meta').textContent = `${game.minPlayers}–${game.maxPlayers} kişi · ${game.duration}${game.bots ? ' · Botlarla da oynanır' : ''}`;
    fragment.querySelector('h3').textContent = game.name;
    fragment.querySelector('.game-description').textContent = game.description;
    fragment.querySelector('.game-input').textContent = game.input;
    for (const link of fragment.querySelectorAll('a')) {
      if (available) link.href = game.entry;
      else { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); }
    }
    const play = fragment.querySelector('.play-link');
    if (available) play.setAttribute('aria-label', `${game.name} oyununa gir`);
    else play.textContent = 'Yakında';
    return fragment;
  }));
}
async function loadGames() {
  catalogRequest?.abort(); catalogRequest = new AbortController();
  $('catalog-retry').hidden = true;
  $('catalog-status').textContent = 'Oyunlar yükleniyor…';
  try {
    games = await json('/api/games', catalogRequest.signal);
    renderGames();
    const selected = $('room-game').value;
    $('room-game').replaceChildren(new Option('Bütün oyunlar', ''), ...games.map(game => new Option(game.name, game.id)));
    $('room-game').value = selected;
    renderRooms();
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('catalog-status').textContent = 'Oyunlar yüklenemedi. Bağlantını kontrol edip tekrar dene.';
    $('catalog-retry').hidden = false;
  } finally { $('game-grid').setAttribute('aria-busy', 'false'); }
}
function renderRooms() {
  const selected = $('room-game').value;
  const visible = rooms.filter(room => !selected || room.gameId === selected);
  if (!visible.length) {
    const empty = document.createElement('div'); empty.className = 'room-empty';
    const icon = document.createElement('span'); icon.className = 'empty-icon'; icon.textContent = '♧'; icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong'); title.textContent = 'İlk oda sizinki olsun.';
    const note = document.createElement('p'); note.textContent = 'Şu an açık oda yok. Bir oyun seç, odanı kur ve kodunu arkadaşlarınla paylaş.';
    empty.append(icon, title, note); $('room-list').replaceChildren(empty); return;
  }
  $('room-list').replaceChildren(...visible.map(room => {
    const game = games.find(game => game.id === room.gameId);
    const row = document.createElement('article'); row.className = 'room-row';
    const info = document.createElement('div'), name = document.createElement('h3'), detail = document.createElement('p'), code = document.createElement('span'), link = document.createElement('a');
    name.textContent = game?.name || room.gameId;
    detail.textContent = `${room.players}/${room.capacity} kişi · ${phases[room.phase] || room.phase}`;
    code.className = 'room-code'; code.textContent = `ODA ${room.code}`;
    link.textContent = 'Katıl ↗'; link.setAttribute('aria-label', `${name.textContent}, ${room.code} odasına katıl`);
    link.href = `/games/${encodeURIComponent(room.gameId)}/?room=${encodeURIComponent(room.code)}`;
    info.append(name, detail, code); row.append(info, link); return row;
  }));
}
async function refreshRooms() {
  clearTimeout(timer);
  if (disposed || document.hidden || roomRequest) return;
  const controller = roomRequest = new AbortController();
  $('refresh').disabled = true;
  try {
    rooms = await json('/api/rooms', controller.signal);
    renderRooms();
    $('room-status').textContent = rooms.length ? `${rooms.length} açık oda · Liste güncel` : '';
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('room-list').replaceChildren();
    $('room-status').textContent = 'Odalar yenilenemedi. Yenile düğmesiyle tekrar dene.';
  } finally {
    roomRequest = null;
    $('refresh').disabled = false;
    $('room-list').setAttribute('aria-busy', 'false');
    if (!disposed && !document.hidden) timer = setTimeout(refreshRooms, 15000);
  }
}
async function joinRoom(code) {
  if (!/^\d{4}$/.test(code)) { $('join-error').textContent = '4 haneli oda kodunu yaz.'; return; }
  joinRequest?.abort(); joinRequest = new AbortController();
  $('join-error').textContent = ''; $('join-button').disabled = true;
  try {
    const room = await json(`/api/rooms/${code}`, joinRequest.signal);
    saveName($('nickname').value);
    location.assign(room.entry);
  } catch (error) { if (error.name !== 'AbortError') $('join-error').textContent = error.message; }
  finally { $('join-button').disabled = false; }
}
$('join-form').addEventListener('submit', event => { event.preventDefault(); joinRoom($('room-code').value.trim()); });
$('search').addEventListener('input', renderGames);
$('room-game').addEventListener('change', renderRooms);
$('refresh').addEventListener('click', refreshRooms);
$('catalog-retry').addEventListener('click', loadGames);
$('filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  filter = button.dataset.filter;
  for (const item of $('filters').children) item.setAttribute('aria-pressed', String(item === button));
  renderGames();
});
document.addEventListener('visibilitychange', () => {
  clearTimeout(timer);
  if (document.hidden) roomRequest?.abort(); else refreshRooms();
});
window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); roomRequest?.abort(); catalogRequest?.abort(); joinRequest?.abort(); });
window.addEventListener('pageshow', event => { if (event.persisted) { disposed = false; loadGames(); refreshRooms(); } });
loadGames(); refreshRooms();
// Existing /?room=1234 invitations are resolved through the platform catalog.
const invite = new URLSearchParams(location.search).get('room');
if (invite) { $('room-code').value = invite; joinRoom(invite); }
