export const REPLAY_MS = 4400;

// Replay only public results. Every viewer follows their own bullet first,
// then sees an incoming hit, their victim, or the nearest public impact.
export function replayFrame(state, elapsed) {
  if (!state || !['reveal', 'round-end', 'end'].includes(state.phase) || elapsed < 0 || elapsed >= REPLAY_MS) return null;
  const shots = state.shots || [];
  const own = shots.find(shot => shot.id === state.me);
  const incoming = shots.find(shot => shot.target === state.me);
  const hits = shots.filter(shot => shot.target);
  const origin = own || state.players.find(player => player.id === state.me);
  const nearest = [...hits].sort((a, b) => {
    const distance = shot => origin ? Math.hypot(shot.endX - (origin.endX ?? origin.x), shot.endY - (origin.endY ?? origin.y)) : 0;
    return distance(a) - distance(b);
  })[0];
  const impact = incoming || (own?.target ? own : nearest);
  const focus = elapsed < REPLAY_MS / 2 ? own || incoming || nearest || shots[0] : impact || own || shots[0];
  if (!focus) return null;
  const stage = elapsed >= REPLAY_MS / 2 && impact ? 'impact' : 'shot';
  const name = id => state.players.find(player => player.id === id)?.name || 'Ayrılan oyuncu';
  const caption = stage === 'impact'
    ? `${focus.target === state.me ? 'SENİ VURAN' : focus.id === state.me ? 'İSABETİN' : 'İSABET'} · ${name(focus.id)} → ${name(focus.target)}`
    : `${focus.id === state.me ? 'SENİN ATIŞIN' : 'İZLEYİCİ'} · ${name(focus.id)}`;
  return {
    stage, shot: focus, caption,
    age: stage === 'impact' ? .3 + (elapsed - REPLAY_MS / 2) / 1000 * .25 : elapsed / 1000 * .25,
  };
}
