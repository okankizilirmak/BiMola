// Only preferences belong in storage; room membership always belongs to the server.
export function readName() {
  try { return localStorage.getItem('bimola-name') || localStorage.getItem('mola-name') || ''; } catch { return ''; }
}
export function saveName(value) {
  const name = String(value).trim().slice(0, 18);
  try { localStorage.setItem('bimola-name', name); } catch { /* Storage may be disabled. */ }
  return name;
}
