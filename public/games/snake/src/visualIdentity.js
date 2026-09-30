const FOOD_VISUAL_IDENTITIES = {
  1: { color: "#ff496c", shape: "orb", scale: 1, hasHalo: false },
  2: { color: "#ff6b2c", shape: "orb", scale: 1, hasHalo: false },
  3: { color: "#9d6cff", shape: "orb", scale: 1, hasHalo: false },
  4: { color: "#25e6db", shape: "orb", scale: 1, hasHalo: false },
  5: { color: "#ffd21f", shape: "gold", scale: 1.28, hasHalo: true },
  6: { color: "#58647c", shape: "orb", scale: 1, hasHalo: false },
  7: { color: "#f4fbff", shape: "orb", scale: 1, hasHalo: false },
  8: { color: "#4aff87", shape: "orb", scale: 1, hasHalo: true },
  9: { color: "#0088ff", shape: "orb", scale: 1.2, hasHalo: true },
  10: { color: "#ff00ff", shape: "orb", scale: 1.2, hasHalo: true }
};

const OBSTACLE_VISUAL_IDENTITIES = {
  stable: { color: "#5168a8", surfaceColor: "#283754", shape: "block" },
  warning: { color: "#ff376f", surfaceColor: "#6f203d", shape: "block" },
  preview: { color: "#2f7bff", surfaceColor: "#173d80", shape: "block" }
};

const PLAYER_VISUAL_IDENTITIES = {
  p0: { color: "#5cff9d" },
  p1: { color: "#45a9ff" },
  p2: { color: "#ffcf4d" },
  p3: { color: "#f06dff" },
  p4: { color: "#ff7b54" },
  p5: { color: "#a4ff4f" },
  p6: { color: "#ff5ca8" },
  p7: { color: "#62efff" },
  p8: { color: "#c78cff" },
  p9: { color: "#ff6f91" },
  p10: { color: "#a8ffcf" },
  p11: { color: "#d9e2ff" }
};

export function getFoodVisualIdentity(tier) {
  return FOOD_VISUAL_IDENTITIES[tier] || FOOD_VISUAL_IDENTITIES[1];
}

export function getObstacleVisualIdentity(phase) {
  return OBSTACLE_VISUAL_IDENTITIES[phase] || OBSTACLE_VISUAL_IDENTITIES.stable;
}

export function getPlayerVisualIdentity(colorClass) {
  return PLAYER_VISUAL_IDENTITIES[colorClass] || PLAYER_VISUAL_IDENTITIES.p0;
}
