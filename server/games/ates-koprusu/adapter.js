import {createRoom, addPlayer, removePlayer, setReady, answer, useJoker, tick, upload, removeSet, view, MAX_PLAYERS} from './game.js';

const members = room => Object.values(room.players);
export const adapter = {
  // Geri sayım istemcide `until` ile hesaplanır; düzenli yayın seyrek, faz değişimi anında.
  snapshotInterval: 1000,
  create: ({code, host}) => createRoom({code, host}),
  members,
  canJoin(room, data = {}) {
    if (data.profileId && members(room).some(p => p.profileId === data.profileId)) return {error: 'Bu köprüde başka bir sekmede zaten varsın.'};
    return members(room).length >= MAX_PLAYERS ? {error: `Oda dolu (${MAX_PLAYERS} kişi).`} : {ok: true};
  },
  takeScores: room => room.scoreEvents.splice(0),
  addPlayer(room, player) { const p = addPlayer(room, player); return {waiting: !!p.skipRound}; },
  removePlayer: (room, id) => removePlayer(room, id),
  summary(room) {
    const players = members(room).length, waiting = ['lobby', 'countdown'].includes(room.phase);
    return {phase: waiting ? 'lobby' : 'play', players, capacity: MAX_PLAYERS, round: room.current?.number || 0, total: room.current?.total || 0, joinable: players < MAX_PLAYERS};
  },
  view,
  tickInterval: room => room.phase === 'lobby' ? 0 : 100,
  tick: (room, now) => ({changed: tick(room, now)}),
  commands: {
    ready: {interval: 150, publish: true, handle: (room, id, data, now) => setReady(room, id, data, now)},
    answer: {interval: 60, publish: true, handle: (room, id, data, now) => answer(room, id, data, now)},
    joker: {interval: 150, publish: true, handle: (room, id, data, now) => useJoker(room, id, data, now)},
    upload: {interval: 20, publish: true, handle: (room, id, data) => upload(room, id, data)},
    'remove-set': {interval: 200, publish: true, handle: (room, id, data) => removeSet(room, id, data)},
  },
};
