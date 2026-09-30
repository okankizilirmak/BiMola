import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import {games as defaultGames} from './server/games/registry.js';
import {createRegistry} from './server/platform/registry.js';
import {createRuntime} from './server/platform/runtime.js';

export function createGameServer({games = defaultGames, maxRooms = Number(process.env.MAX_ROOMS ?? 64), logger = console} = {}) {
  const registry = createRegistry(games), app = express(), http = createServer(app);
  const io = new Server(http, {maxHttpBufferSize: 4096});
  const runtime = createRuntime(io, registry, {maxRooms, logger});
  app.use('/api', (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_, res) => res.json({ok: true, rooms: runtime.rooms.size}));
  app.get('/api/games', (_, res) => res.json(registry.list()));
  app.get('/api/rooms', (req, res) => {
    const gameId = req.query.gameId;
    if (gameId !== undefined && (typeof gameId !== 'string' || !registry.get(gameId))) return res.status(400).json({error: 'Oyun bulunamadı.'});
    res.json(runtime.listRooms(gameId));
  });
  app.get('/api/rooms/:code', (req, res) => {
    const room = /^\d{4}$/.test(req.params.code) && runtime.roomLink(req.params.code);
    if (!room) return res.status(404).json({error: 'Bu kodla katılabileceğin bir oda bulunamadı.'});
    res.json(room);
  });
  app.use(express.static(fileURLToPath(new URL('./public', import.meta.url))));
  app.use('/vendor', express.static(fileURLToPath(new URL('./node_modules/three/build', import.meta.url))));
  return {app, http, io, registry, ...runtime, close() { runtime.close(); io.close(); if (http.listening) http.close(); }};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createGameServer();
  server.http.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('BiMola hazır: http://localhost:3000'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close());
}
