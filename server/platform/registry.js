const methods = ['create', 'canJoin', 'addPlayer', 'removePlayer', 'members', 'summary', 'view', 'tick', 'tickInterval'];
const reserved = new Set(['join', 'leave', 'disconnect', 'connect', 'error', 'state']);

export function createRegistry(definitions) {
  const entries = new Map();
  for (const {manifest, load} of definitions) {
    if (!manifest || !/^[a-z][a-z0-9-]*$/.test(manifest.id) || entries.has(manifest.id)) throw new Error('Invalid or duplicate game id');
    if (manifest.entry !== `/games/${manifest.id}/` || manifest.namespace !== `/games/${manifest.id}` || manifest.protocolVersion !== 1) throw new Error(`Invalid game routes/protocol: ${manifest.id}`);
    if (typeof load !== 'function') throw new Error(`Missing game loader: ${manifest.id}`);
    entries.set(manifest.id, {manifest: Object.freeze({...manifest}), load});
  }
  return {
    list: () => [...entries.values()].map(entry => entry.manifest),
    get: id => entries.get(id)?.manifest,
    adapter: id => entries.get(id)?.adapter,
    async load(id) {
      const entry = entries.get(id);
      if (!entry || entry.manifest.status !== 'available') throw new Error('Game unavailable');
      // First connections share one load; a failed load can be retried.
      entry.pending ??= Promise.resolve().then(entry.load).then(adapter => {
        for (const name of methods) if (typeof adapter?.[name] !== 'function') throw new Error(`Missing adapter method: ${id}.${name}`);
        if (!Number.isFinite(adapter.snapshotInterval) || adapter.snapshotInterval < 25) throw new Error(`Invalid snapshot interval: ${id}`);
        for (const [name, command] of Object.entries(adapter.commands || {})) {
          if (reserved.has(name) || typeof command.handle !== 'function' || !Number.isFinite(command.interval) || command.interval < 0) throw new Error(`Invalid game command: ${id}.${name}`);
        }
        entry.adapter = adapter;
        return adapter;
      }).catch(error => { entry.pending = null; throw error; });
      return entry.pending;
    },
  };
}
