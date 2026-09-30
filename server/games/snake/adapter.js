import {
  addPlayer, createGameState, MAX_ONLINE_PLAYERS, queueDirection, removePlayer,
  restartGame, serializeGame, setBotCount, setFoodDensity, setGridSize,
  setMagnetDuration, setMagnetRadius, setManualBoost, setMaxPlayers,
  setRespawnDelay, setSpeedBoostDuration, setSpeedBoostMultiplier, tickGame
} from './game.js';

const humans = room => room.state.playerOrder.map(id => room.state.players[id]).filter(player => player && !player.isBot);
const update = (room, transform) => { room.state = transform(room.state); return {ok: true}; };
const hostCommand = (transform, valid = () => true) => (room, id, data) => {
  if (id !== room.host) return {error: 'Bu ayarı yalnız oda sahibi değiştirebilir.'};
  if (!valid(data)) return {error: 'Ayar değeri geçersiz.'};
  return update(room, state => transform(state, data));
};
const finite = key => data => data && Number.isFinite(Number(data[key]));

export const adapter = {
  snapshotInterval: 160,
  create: ({code, host}) => ({code, host, state: createGameState()}),
  members: humans,
  canJoin: room => humans(room).length < room.state.maxPlayers ? {ok: true} : {error: 'Oda dolu.'},
  addPlayer(room, {id, name}) {
    if (room.state.playerOrder.length >= room.state.maxPlayers && room.state.botCount) {
      room.state = setBotCount(room.state, room.state.botCount - 1);
    }
    room.state = addPlayer(room.state, id, name);
    if (!room.state.players[id]) return {error: 'Oda dolu.'};
    return {};
  },
  removePlayer(room, id) {
    room.state = removePlayer(room.state, id);
    if (room.host === id) room.host = humans(room)[0]?.id;
  },
  summary(room) {
    const players = humans(room).length;
    return {players, capacity: room.state.maxPlayers, bots: room.state.botCount,
      phase: room.state.status === 'running' ? 'play' : 'lobby',
      joinable: players < room.state.maxPlayers};
  },
  view: (room, id, now) => ({...serializeGame(room.state, now), hostId: room.host, me: id, code: room.code,
    phase: room.state.status === 'running' ? 'play' : 'lobby'}),
  tickInterval: room => humans(room).length ? 160 : 0,
  tick(room, now) { room.state = tickGame(room.state, Math.random, now); return {}; },
  commands: {
    turn: {interval: 10, handle: (room, id, data) => {
      if (!['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(data?.direction)) return {error: 'Yön geçersiz.'};
      return update(room, state => queueDirection(state, id, data.direction));
    }},
    boost_start: {interval: 50, publish: true, handle: (room, id, _, now) => update(room, state => setManualBoost(state, id, true, now))},
    boost_stop: {interval: 50, publish: true, handle: (room, id, _, now) => update(room, state => setManualBoost(state, id, false, now))},
    restart: {interval: 300, publish: true, handle: hostCommand(state => restartGame(state))},
    set_name: {interval: 500, publish: true, handle: (room, id, data) => {
      if (typeof data?.name !== 'string') return {error: 'Ad geçersiz.'};
      const player = room.state.players[id];
      if (!player) return {error: 'Oyuncu bulunamadı.'};
      room.state = {...room.state, players: {...room.state.players,
        [id]: {...player, name: data.name.trim().slice(0, 18) || player.name}}};
      return {ok: true};
    }},
    set_grid_size: {interval: 250, publish: true, handle: hostCommand((state, data) => setGridSize(state, Number(data.gridSize)), finite('gridSize'))},
    set_respawn_delay: {interval: 250, publish: true, handle: hostCommand((state, data) => setRespawnDelay(state, Number(data.respawnDelayMs)), finite('respawnDelayMs'))},
    set_speed_boost_duration: {interval: 250, publish: true, handle: hostCommand((state, data) => setSpeedBoostDuration(state, Number(data.speedBoostDurationMs)), finite('speedBoostDurationMs'))},
    set_speed_boost_multiplier: {interval: 250, publish: true, handle: hostCommand((state, data) => setSpeedBoostMultiplier(state, Number(data.speedBoostMultiplier)), finite('speedBoostMultiplier'))},
    set_food_density: {interval: 250, publish: true, handle: hostCommand((state, data) => setFoodDensity(state, Number(data.density)), finite('density'))},
    set_max_players: {interval: 250, publish: true, handle: hostCommand((state, data) => setMaxPlayers(state, Math.max(Number(data.maxPlayers), state.playerOrder.length)), finite('maxPlayers'))},
    set_bot_count: {interval: 250, publish: true, handle: hostCommand((state, data) => setBotCount(state, Math.min(Number(data.botCount), Math.max(0, state.maxPlayers - state.playerOrder.filter(id => !state.players[id].isBot).length))), finite('botCount'))},
    set_magnet_duration: {interval: 250, publish: true, handle: hostCommand((state, data) => setMagnetDuration(state, Number(data.payload)), finite('payload'))},
    set_magnet_radius: {interval: 250, publish: true, handle: hostCommand((state, data) => setMagnetRadius(state, Number(data.payload)), finite('payload'))},
  },
};
