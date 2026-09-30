import {createRoom, addPlayer, removePlayer, start, answer, tick, upload, removeQueued, view, MAX_PLAYERS} from './game.js';

const members = room => Object.values(room.players);
export const adapter = {
  // Geri sayım istemcide `until` ile hesaplanır; düzenli yayın seyrek, faz değişimi anında.
  snapshotInterval: 1000,
  create: ({code, host}) => createRoom({code, host}),
  members,
  canJoin: room => members(room).length >= MAX_PLAYERS ? {error: `Oda dolu (${MAX_PLAYERS} kişi).`} : {ok: true},
  addPlayer(room, player) { const p = addPlayer(room, player); return {waiting: !!p.skipRound}; },
  removePlayer,
  summary(room) {
    const players = members(room).length;
    return {phase: room.phase === 'lobby' ? 'lobby' : 'play', players, capacity: MAX_PLAYERS, round: room.round, set: room.active.set.title, joinable: players < MAX_PLAYERS};
  },
  view,
  tickInterval: room => room.phase === 'lobby' ? 0 : 100,
  tick: (room, now) => ({changed: tick(room, now)}),
  commands: {
    start: {interval: 300, publish: true, handle: (room, id, _, now) => start(room, id, now)},
    answer: {interval: 80, publish: true, handle: (room, id, data, now) => answer(room, id, data, now)},
    upload: {interval: 20, publish: true, handle: (room, id, data) => upload(room, id, data)},
    'remove-set': {interval: 200, publish: true, handle: (room, id, data) => removeQueued(room, id, data)},
  },
};
