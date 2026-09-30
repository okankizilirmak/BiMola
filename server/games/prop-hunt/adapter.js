import {player, start, tick, action, view, sanitizeSettings, configureRoom, syncBots, setTeam, castVote} from './game.js';

const members = room => Object.values(room.players).filter(player => !player.bot);
export const adapter = {
  snapshotInterval: 50,
  create: ({code, host, data}) => ({code, host, players: {}, phase: 'lobby', until: 0, round: 0, practice: !!data.practice, settings: sanitizeSettings(data.settings)}),
  members,
  canJoin(room) {
    if (room.practice) return {error: 'Bu bir antrenman odası. Yeni oda oluştur.'};
    if (members(room).length >= room.settings.teamSize * 2) return {error: `Oda dolu (${room.settings.teamSize * 2} kişi).`};
    return {ok: true};
  },
  addPlayer(room, {id, name, data}) {
    let team = data.role === 'hunter' ? 'hunter' : 'hider';
    const count = team => members(room).filter(player => player.team === team).length;
    if (room.settings.teamSelection === 'auto') team = count('hunter') < count('hider') ? 'hunter' : 'hider';
    if (count(team) >= room.settings.teamSize) team = team === 'hunter' ? 'hider' : 'hunter';
    const waiting = !['lobby', 'end'].includes(room.phase);
    const p = room.players[id] = player(id, name, false, team, data.skin);
    p.waiting = waiting;
    if (waiting) p.status = 'waiting'; else syncBots(room);
    if (room.practice) {
      room.settings.botMode = 'fill'; syncBots(room); start(room);
      room.phase = 'brief'; room.until = 0;
    }
    return {waiting};
  },
  removePlayer(room, id) {
    const p = room.players[id];
    if (p?.propId) {
      const object = room.objects?.find(object => object.id === p.propId);
      if (object) delete object.owner;
    }
    delete room.players[id];
    const humans = members(room);
    if (room.host === id) room.host = humans.find(p => !p.waiting)?.id || humans[0]?.id;
    if (humans.length && ['lobby', 'end'].includes(room.phase)) syncBots(room);
  },
  summary(room) {
    const humans = members(room), capacity = room.settings.teamSize * 2;
    return {phase: room.phase, mapId: room.settings.mapId, players: humans.length, capacity, waiting: humans.filter(p => p.waiting).length, round: room.round || 0, joinable: !room.practice && humans.length < capacity};
  },
  view,
  tickInterval: room => ['prep', 'play'].includes(room.phase) ? 25 : room.phase === 'end' && room.vote && !room.vote.closed ? 250 : 0,
  tick(room, now, dt) {
    const previousPhase = room.phase;
    tick(room, now, dt);
    const events = (room.results || []).filter(result => !room.players[result.playerId]?.bot);
    room.results = [];
    return {events, changed: previousPhase !== room.phase};
  },
  commands: {
    ready: {interval: 150, publish: true, handle(room, id, _, now) {
      if (!room.practice || room.host !== id || room.phase !== 'brief') return {error: 'Antrenman hazır değil.'};
      room.phase = 'prep'; room.until = now + room.settings.hideSeconds * 1000; return {ok: true};
    }},
    settings: {interval: 150, publish: true, handle: (room, id, data) => configureRoom(room, data, id)},
    team: {interval: 150, publish: true, handle: (room, id, data) => setTeam(room, id, data)},
    'move-team': {interval: 150, publish: true, handle: (room, id, data) => data && typeof data === 'object' ? setTeam(room, data.playerId, data.team, id) : {error: 'Oyuncu bulunamadı.'}},
    start: {interval: 350, publish: true, handle(room, id) {
      if (room.host !== id) return {error: 'Turu yalnızca oda kurucusu başlatabilir.'};
      if (!['lobby', 'end'].includes(room.phase)) return {error: 'Tur zaten başladı.'};
      return start(room);
    }},
    input: {interval: 15, handle(room, id, v = {}, now) {
      const p = room.players[id];
      if (!p || !v || typeof v !== 'object' || !['prep', 'play'].includes(room.phase)) return;
      const axis = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
      p.input = {x: axis(v.x), z: axis(v.z), fire: !!v.fire, jump: !!v.jump, crouch: !!v.crouch, spin: axis(v.spin), lift: axis(v.lift)};
      if (Number.isFinite(v.yaw)) p.yaw = ((v.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (Number.isFinite(v.pitch)) p.pitch = Math.max(-1.35, Math.min(1.35, v.pitch));
      p.inputAt = now;
    }},
    action: {interval: 90, event: 'action-result', handle: (room, id, data, now) => action(room, room.players[id], data, now)},
    vote: {interval: 90, publish: true, handle: (room, id, data, now) => castVote(room, room.players[id], String(data || ''), now)},
  },
};
