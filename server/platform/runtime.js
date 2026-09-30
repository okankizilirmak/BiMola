import {randomInt} from 'node:crypto';

// Platform state is separate from game state. Adapters see no sockets or other rooms.
export function createRuntime(io, registry, {maxRooms = 64, logger = console, scores} = {}) {
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 9000) throw new Error('maxRooms must be 1–9000');
  const rooms = new Map(), schedules = new Map();
  let timer = null, closed = false;
  const metrics = {ticks: 0, snapshots: 0, skippedSnapshots: 0, failedRooms: 0};
  const adapterFor = room => registry.adapter(room.gameId);
  const namespaceFor = room => io.of(registry.get(room.gameId).namespace);
  const record = room => { const events = adapterFor(room).takeScores?.(room); if (events?.length) scores?.record(room.gameId, events); };

  function publish(room, reliable = true) {
    const adapter = adapterFor(room), namespace = namespaceFor(room), now = Date.now();
    for (const {id} of adapter.members(room)) {
      const socket = namespace.sockets.get(id);
      if (!socket) continue;
      // Skip serialization when the previous packet has not drained yet.
      if (!reliable && !socket.conn.transport.writable) { metrics.skippedSnapshots++; continue; }
      const packet = {...adapter.view(room, id, now), gameId: room.gameId, protocolVersion: 1};
      (reliable ? socket : socket.volatile).emit('state', packet);
      metrics.snapshots++;
    }
  }

  function removeRoom(room) { rooms.delete(room.code); schedules.delete(room.code); }
  function failRoom(room, error) {
    metrics.failedRooms++;
    logger.error(`Game room failed: ${room.gameId}/${room.code}`, error);
    // Read membership from platform-owned sockets: the failing adapter may be broken.
    for (const socket of namespaceFor(room).sockets.values()) {
      if (socket.data.code === room.code) {
        socket.data.code = null;
        socket.emit('room-error', {error: 'Oda kapandı. Lobiye dönüp yeni bir oda açabilirsin.'});
      }
    }
    removeRoom(room);
  }

  function schedule() {
    if (closed || timer) return;
    const now = Date.now(); let delay = Infinity;
    for (const room of rooms.values()) {
      try {
        const interval = adapterFor(room).tickInterval(room);
        if (!interval) { schedules.delete(room.code); continue; }
        if (!Number.isFinite(interval) || interval < 10) throw new Error('Invalid tick interval');
        if (!schedules.has(room.code)) schedules.set(room.code, {tickAt: now, snapshotAt: now});
        delay = Math.min(delay, Math.max(1, schedules.get(room.code).tickAt + interval - now));
      } catch (error) { failRoom(room, error); }
    }
    if (delay !== Infinity) timer = setTimeout(step, delay);
  }
  function wake() { clearTimeout(timer); timer = null; schedule(); }

  function step() {
    timer = null;
    const now = Date.now();
    for (const room of rooms.values()) {
      try {
        const adapter = adapterFor(room), interval = adapter.tickInterval(room), timing = schedules.get(room.code);
        if (!interval || !timing || now - timing.tickAt < interval) continue;
        // No accumulated catch-up work after a stall.
        const dt = Math.min(.1, Math.max(0, (now - timing.tickAt) / 1000));
        timing.tickAt = now;
        const {events = [], changed = false} = adapter.tick(room, now, dt) || {};
        record(room);
        metrics.ticks++;
        const namespace = namespaceFor(room);
        for (const event of events) {
          const recipient = namespace.sockets.get(event.playerId);
          if (recipient?.data.code === room.code) recipient.emit(event.event, event.data);
        }
        const stopped = !adapter.tickInterval(room);
        if (changed || stopped || now - timing.snapshotAt >= adapter.snapshotInterval) {
          publish(room, changed || stopped); timing.snapshotAt = now;
        }
      } catch (error) { failRoom(room, error); }
    }
    schedule();
  }

  function leave(socket) {
    const room = rooms.get(socket.data.code);
    socket.data.code = null;
    if (!room) return;
    try {
      const adapter = adapterFor(room);
      adapter.removePlayer(room, socket.id);
      if (!adapter.members(room).length) removeRoom(room); else publish(room);
    } catch (error) { failRoom(room, error); }
    wake();
  }

  for (const manifest of registry.list().filter(game => game.status === 'available')) {
    const namespace = io.of(manifest.namespace);
    namespace.use(async (socket, next) => {
      try { await registry.load(manifest.id); next(); }
      catch (error) { logger.error(`Game loading failed: ${manifest.id}`, error); next(new Error('Oyun şu an açılamıyor. Tekrar dene.')); }
    });
    namespace.on('connection', socket => {
      const adapter = registry.adapter(manifest.id), last = new Map();
      function allowed(event, interval) {
        const now = Date.now();
        if (now - (last.get(event) ?? -Infinity) < interval) return false;
        last.set(event, now); return true;
      }
      socket.on('join', (data = {}, ack) => {
        if (typeof ack !== 'function') return;
        if (!allowed('join', 350)) return ack({error: 'Bir saniye bekle.'});
        if (!data || typeof data !== 'object' || Array.isArray(data)) return ack({error: 'Oda bilgisi geçersiz.'});
        if (data.gameId && data.gameId !== manifest.id) return ack({error: 'Bu oda başka bir oyuna ait.'});
        let room, created = false;
        try {
          if (data.code) {
            const code = String(data.code).trim();
            room = /^\d{4}$/.test(code) ? rooms.get(code) : null;
            if (!room || room.gameId !== manifest.id) return ack({error: 'Bu oyun için oda bulunamadı. Kodu kontrol et.'});
            if (socket.data.code === code) return ack({code, id: socket.id, gameId: manifest.id});
            const result = adapter.canJoin(room, {...data, profileId: socket.data.profileId});
            if (result.error) return ack(result);
          } else {
            if (rooms.size >= maxRooms) return ack({error: 'Odalar şu an dolu. Biraz sonra tekrar dene.'});
            const offset = randomInt(9000); let code;
            for (let i = 0; i < 9000; i++) { const candidate = String(1000 + (offset + i) % 9000); if (!rooms.has(candidate)) { code = candidate; break; } }
            room = adapter.create({code, host: socket.id, data});
            room.code = code; room.gameId = manifest.id; created = true;
          }
          leave(socket);
          if (created) rooms.set(room.code, room);
          const name = String(data.name || 'Misafir').trim().slice(0, 18) || 'Misafir';
          const result = adapter.addPlayer(room, {id: socket.id, name, profileId: socket.data.profileId, data});
          socket.data.code = room.code;
          ack({...result, code: room.code, id: socket.id, gameId: manifest.id});
          publish(room); wake();
        } catch (error) { if (room) failRoom(room, error); ack({error: 'Oda açılamadı. Tekrar dene.'}); }
      });
      for (const [event, command] of Object.entries(adapter.commands || {})) {
        socket.on(event, (...args) => {
          const ack = typeof args.at(-1) === 'function' ? args.pop() : null;
          if (!allowed(event, command.interval)) { ack?.({error: 'Bir an bekle.'}); return; }
          const room = rooms.get(socket.data.code);
          if (!room || room.gameId !== manifest.id) { ack?.({error: 'Oda bulunamadı.'}); return; }
          try {
            const result = command.handle(room, socket.id, args[0], Date.now());
            record(room);
            ack?.(result);
            if (command.event && result) socket.emit(command.event, result);
            if (command.publish && !result?.error) { publish(room); wake(); }
          } catch (error) { failRoom(room, error); ack?.({error: 'Oda kapandı. Lobiye dönebilirsin.'}); }
        });
      }
      socket.on('leave', () => leave(socket));
      socket.on('disconnect', () => leave(socket));
    });
  }

  return {
    rooms, metrics,
    listRooms(gameId) {
      return [...rooms.values()].filter(room => !gameId || room.gameId === gameId).map(room => ({...adapterFor(room).summary(room), code: room.code, gameId: room.gameId})).filter(room => room.joinable);
    },
    roomLink(code) {
      const room = rooms.get(code);
      if (!room || !adapterFor(room).summary(room).joinable) return null;
      return {code, gameId: room.gameId, entry: `${registry.get(room.gameId).entry}?room=${code}`};
    },
    close() { closed = true; clearTimeout(timer); timer = null; schedules.clear(); rooms.clear(); },
  };
}
