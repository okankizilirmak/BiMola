import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {fileURLToPath} from 'node:url';
import {games as defaultGames} from './server/games/registry.js';
import {createRegistry} from './server/platform/registry.js';
import {createRuntime} from './server/platform/runtime.js';
import {createScores, playerToken, PLAYER_COOKIE} from './server/platform/scores.js';

export function createGameServer({games = defaultGames, maxRooms = Number(process.env.MAX_ROOMS ?? 64), logger = console, scores = createScores()} = {}) {
  const registry = createRegistry(games), app = express(), http = createServer(app);
  const io = new Server(http, {maxHttpBufferSize: 4096});
  for (const game of registry.list().filter(g => g.status === 'available')) io.of(game.namespace).use((socket, next) => {
    socket.data.profileId = scores.resolve(playerToken(socket.handshake.headers.cookie)); next();
  });
  const runtime = createRuntime(io, registry, {maxRooms, logger, scores});
  app.use('/api', (_, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health', (_, res) => res.json({ok: true, rooms: runtime.rooms.size}));
  app.get('/api/games', (_, res) => res.json(registry.list()));
  app.get('/api/player', async (req, res) => {
    const identity = scores.identity(playerToken(req.headers.cookie));
    try { await scores.flush(); } catch { return res.status(503).json({error: 'Puan defteri şu an kaydedilemiyor.'}); }
    if (identity.fresh) res.cookie(PLAYER_COOKIE, identity.token, {httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 365 * 24 * 60 * 60 * 1000});
    res.json(scores.profile(identity.id));
  });
  app.get('/api/games/:gameId/scores', async (req, res) => {
    if (!registry.get(req.params.gameId)) return res.status(404).json({error: 'Oyun bulunamadı.'});
    try { await scores.flush(); } catch { return res.status(503).json({error: 'Puan defteri şu an kaydedilemiyor.'}); }
    res.json(scores.leaderboard(req.params.gameId, scores.resolve(playerToken(req.headers.cookie))));
  });
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
  return {app, http, io, registry, scores, ...runtime, close() { runtime.close(); io.close(); if (http.listening) http.close(); return scores.flush(); }};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createGameServer({scores: createScores({directory: process.env.BIMOLA_DATA_DIR || fileURLToPath(new URL('./data', import.meta.url))})});
  const port = Number(process.env.PORT) || 3000;
  server.http.listen(port, '0.0.0.0', () => console.log(`BiMola hazır: http://localhost:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close().catch(error => { console.error('Puan defteri kapatılamadı:', error); process.exitCode = 1; }));
}
