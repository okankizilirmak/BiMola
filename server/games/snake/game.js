export const DEFAULT_GRID_SIZE = 64;
export const MIN_GRID_SIZE = 16;
export const MAX_GRID_SIZE = 128;
export const DEFAULT_RESPAWN_DELAY_MS = 5_000;
export const MIN_RESPAWN_DELAY_MS = 1_000;
export const MAX_RESPAWN_DELAY_MS = 30_000;
export const DEFAULT_SPEED_BOOST_DURATION_MS = 5_000;
export const MIN_SPEED_BOOST_DURATION_MS = 1_000;
export const MAX_SPEED_BOOST_DURATION_MS = 15_000;
export const DEFAULT_SPEED_BOOST_MULTIPLIER = 2;
export const MIN_SPEED_BOOST_MULTIPLIER = 2;
export const MAX_SPEED_BOOST_MULTIPLIER = 5;
export const DEFAULT_MAX_PLAYERS = 4;
export const MIN_ONLINE_PLAYERS = 2;
export const MAX_ONLINE_PLAYERS = 12;
export const OBSTACLE_WARNING_MS = 2_000;
export const OBSTACLE_PREVIEW_MS = 2_000;
export const MIN_OBSTACLE_STABLE_MS = 10_000;
export const MAX_OBSTACLE_STABLE_MS = 15_000;
export const DEFAULT_BOT_COUNT = 0;
export const MIN_BOT_COUNT = 0;
export const MAX_BOT_COUNT = 11;

export const DEFAULT_FOOD_DENSITY = 10;
export const MIN_FOOD_DENSITY = 1;
export const MAX_FOOD_DENSITY = 100;
export const DEFAULT_MAGNET_DURATION_MS = 10_000;
export const MIN_MAGNET_DURATION_MS = 1_000;
export const MAX_MAGNET_DURATION_MS = 30_000;
export const DEFAULT_MAGNET_RADIUS = 3;
export const MIN_MAGNET_RADIUS = 1;
export const MAX_MAGNET_RADIUS = 10;
const MIN_MANUAL_BOOST_LENGTH = 3;
const MANUAL_BOOST_COST_INTERVAL_MS = 1_000;
const MAX_SHIELD_CHARGES = 1;
const SHIELD_RECOVERY_MS = 1_000;
const BASE_FOOD_TYPES = [
  { tier: 1, score: 1, growth: 1, lifetimeMs: 30_000 },
  { tier: 2, score: 2, growth: 2, lifetimeMs: 22_000 },
  { tier: 3, score: 3, growth: 3, lifetimeMs: 16_000 }
];
const SPEED_FOOD_TYPE = {
  tier: 4,
  score: 0,
  growth: 0,
  bonus: "speed",
  lifetimeMs: 12_000
};
const GOLD_FOOD_TYPE = { tier: 5, score: 5, growth: 5, bonus: "gold", lifetimeMs: 8_000 };
const POISON_FOOD_TYPE = {
  tier: 6,
  score: -2,
  growth: -1,
  bonus: "poison",
  lifetimeMs: 10_000
};
const SHIELD_FOOD_TYPE = {
  tier: 7,
  score: 0,
  growth: 0,
  bonus: "shield",
  lifetimeMs: 14_000
};
const GHOST_FOOD_TYPE = {
  tier: 8,
  score: 0,
  growth: 0,
  bonus: "ghost",
  lifetimeMs: 12_000
};
const FREEZE_FOOD_TYPE = {
  tier: 9,
  score: 0,
  growth: 0,
  bonus: "freeze",
  lifetimeMs: 12_000
};
const MAGNET_FOOD_TYPE = {
  tier: 10,
  score: 0,
  growth: 0,
  bonus: "magnet",
  lifetimeMs: 14_000
};
const DIRECTION_VECTORS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 }
};

const OPPOSITES = {
  UP: "DOWN",
  DOWN: "UP",
  LEFT: "RIGHT",
  RIGHT: "LEFT"
};

const PLAYER_COLORS = Array.from({ length: MAX_ONLINE_PLAYERS }, (_, index) => `p${index % 12}`);
const OBSTACLE_SHAPES = [
  [
    { x: -2, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 }
  ],
  [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: 2 }
  ],
  [
    { x: -2, y: -1 },
    { x: -1, y: -1 },
    { x: -1, y: 0 },
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 }
  ],
  [
    { x: 0, y: -2 },
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -2, y: 0 },
    { x: 2, y: 0 }
  ]
];

export function createGameState(
  randomFn = Math.random,
  gridSize = DEFAULT_GRID_SIZE,
  respawnDelayMs = DEFAULT_RESPAWN_DELAY_MS,
  speedBoostDurationMs = DEFAULT_SPEED_BOOST_DURATION_MS,
  speedBoostMultiplier = DEFAULT_SPEED_BOOST_MULTIPLIER,
  foodDensity = DEFAULT_FOOD_DENSITY,
  maxPlayers = DEFAULT_MAX_PLAYERS
) {
  const normalizedGridSize = normalizeGridSize(gridSize);
  const normalizedRespawnDelay = normalizeRespawnDelay(respawnDelayMs);
  const normalizedSpeedBoostDuration = normalizeSpeedBoostDuration(speedBoostDurationMs);
  const normalizedSpeedBoostMultiplier = normalizeSpeedBoostMultiplier(speedBoostMultiplier);
  return {
    gridSize: normalizedGridSize,
    respawnDelayMs: normalizedRespawnDelay,
    speedBoostDurationMs: normalizedSpeedBoostDuration,
    speedBoostMultiplier: normalizedSpeedBoostMultiplier,
    foodDensity: isFoodDensity(foodDensity) ? foodDensity : DEFAULT_FOOD_DENSITY,
    maxPlayers: normalizeMaxPlayers(maxPlayers),
    botCount: DEFAULT_BOT_COUNT,
    magnetDurationMs: DEFAULT_MAGNET_DURATION_MS,
    magnetRadius: DEFAULT_MAGNET_RADIUS,
    obstacles: createInitialObstacles(normalizedGridSize),
    obstaclePhase: "stable",
    obstacleNextPhaseAt: null,
    players: {},
    playerOrder: [],
    foods: [],
    status: "waiting"
  };
}

export function addPlayer(state, id, name, randomFn = Math.random, isBot = false, nowMs = Date.now()) {
  if (state.players[id]) {
    return state;
  }

  if (state.playerOrder.length >= state.maxPlayers) {
    return state;
  }

  const occupiedSlots = new Set(
    state.playerOrder
      .map((playerId) => state.players[playerId]?.slotIndex)
      .filter((index) => Number.isInteger(index))
  );
  const slotIndex = Array.from({ length: state.maxPlayers }, (_, index) => index).find(
    (index) => !occupiedSlots.has(index)
  );
  if (slotIndex == null) {
    return state;
  }
  const slot = getSpawnSlot(slotIndex, state.gridSize);
  const snake = buildSpawnSnake(slot.head, slot.direction, state.gridSize);
  const color = PLAYER_COLORS[slotIndex % PLAYER_COLORS.length];

  const nextState = {
    ...state,
    players: {
      ...state.players,
      [id]: {
        id,
        name,
        color,
        snake,
        direction: slot.direction,
        pendingDirection: slot.direction,
        score: 0,
        bestScore: 0,
        isAlive: true,
        isBot: Boolean(isBot),
        ghostUntil: nowMs + 3000,
        speedBoostUntil: null,
        manualBoostRequested: false,
        manualBoostChargedAt: null,
        shieldCharges: 0,
        shieldRecoveryUntil: null,
        slotIndex,
        respawnAt: null
      }
    },
    playerOrder: [...state.playerOrder, id]
  };

  const withFoods = {
    ...nextState,
    foods: refillFoods(
      nextState.players,
      nextState.gridSize,
      nextState.obstacles,
      [],
      randomFn,
      Date.now(),
      nextState.foodDensity
    )
  };

  return withStatus(withFoods);
}

export function removePlayer(state, id, randomFn = Math.random) {
  if (!state.players[id]) {
    return state;
  }

  const nextPlayers = { ...state.players };
  delete nextPlayers[id];
  const nextOrder = state.playerOrder.filter((playerId) => playerId !== id);

  const nextState = {
    ...state,
    players: nextPlayers,
    playerOrder: nextOrder,
    foods: refillFoods(
      nextPlayers,
      state.gridSize,
      state.obstacles,
      state.foods,
      randomFn,
      Date.now(),
      state.foodDensity
    )
  };

  return withStatus(nextState);
}

export function queueDirection(state, playerId, direction) {
  if (!(direction in DIRECTION_VECTORS)) {
    return state;
  }

  const player = state.players[playerId];
  if (!player || !player.isAlive) {
    return state;
  }

  if (OPPOSITES[player.direction] === direction) {
    return state;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, pendingDirection: direction }
    }
  };
}

export function restartGame(state, randomFn = Math.random) {
  return rebuildState(
    state,
    state.gridSize,
    state.respawnDelayMs,
    state.speedBoostDurationMs,
    state.speedBoostMultiplier,
    randomFn
  );
}

export function setGridSize(state, gridSize, randomFn = Math.random) {
  return rebuildState(
    state,
    gridSize,
    state.respawnDelayMs,
    state.speedBoostDurationMs,
    state.speedBoostMultiplier,
    randomFn
  );
}

export function setRespawnDelay(state, respawnDelayMs) {
  const normalizedRespawnDelay = normalizeRespawnDelay(respawnDelayMs);
  if (normalizedRespawnDelay === state.respawnDelayMs) {
    return state;
  }

  return {
    ...state,
    respawnDelayMs: normalizedRespawnDelay
  };
}

export function setSpeedBoostDuration(state, speedBoostDurationMs) {
  const normalizedDuration = normalizeSpeedBoostDuration(speedBoostDurationMs);
  if (normalizedDuration === state.speedBoostDurationMs) {
    return state;
  }

  return {
    ...state,
    speedBoostDurationMs: normalizedDuration
  };
}

export function setSpeedBoostMultiplier(state, speedBoostMultiplier) {
  const normalizedMultiplier = normalizeSpeedBoostMultiplier(speedBoostMultiplier);
  if (normalizedMultiplier === state.speedBoostMultiplier) {
    return state;
  }

  return {
    ...state,
    speedBoostMultiplier: normalizedMultiplier
  };
}

export function setFoodDensity(state, foodDensity, randomFn = Math.random) {
  if (!isFoodDensity(foodDensity)) {
    return state;
  }

  return {
    ...state,
    foodDensity,
    foods: refillFoods(
      state.players,
      state.gridSize,
      state.obstacles,
      state.foods,
      randomFn,
      Date.now(),
      foodDensity
    )
  };
}

export function setMaxPlayers(state, maxPlayers) {
  const normalizedMaxPlayers = Math.max(
    normalizeMaxPlayers(maxPlayers),
    state.playerOrder.length
  );
  if (normalizedMaxPlayers === state.maxPlayers) {
    return state;
  }

  return {
    ...state,
    maxPlayers: normalizedMaxPlayers
  };
}

export function setManualBoost(state, playerId, active, nowMs = Date.now()) {
  const player = state.players[playerId];
  if (!player) {
    return state;
  }

  if (Boolean(active) === Boolean(player.manualBoostRequested)) {
    return state;
  }

  const canStart = active && player.isAlive && player.snake.length > MIN_MANUAL_BOOST_LENGTH;
  const manualBoostRequested = Boolean(canStart);
  const manualBoostChargedAt = manualBoostRequested
    ? Math.max(nowMs, player.speedBoostUntil ?? nowMs)
    : null;

  if (
    player.manualBoostRequested === manualBoostRequested &&
    player.manualBoostChargedAt === manualBoostChargedAt
  ) {
    return state;
  }

  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        manualBoostRequested,
        manualBoostChargedAt
      }
    }
  };
}

export function setMagnetDuration(state, magnetDurationMs) {
  const parsed = Number.parseInt(magnetDurationMs, 10);
  if (!Number.isFinite(parsed)) return state;
  const limit = Math.min(MAX_MAGNET_DURATION_MS, Math.max(MIN_MAGNET_DURATION_MS, parsed));
  return {
    ...state,
    magnetDurationMs: limit
  };
}

export function setMagnetRadius(state, magnetRadius) {
  const parsed = Number.parseInt(magnetRadius, 10);
  if (!Number.isFinite(parsed)) return state;
  const limit = Math.min(MAX_MAGNET_RADIUS, Math.max(MIN_MAGNET_RADIUS, parsed));
  return {
    ...state,
    magnetRadius: limit
  };
}

export function setBotCount(state, botCount, randomFn = Math.random) {
  const parsed = Number.parseInt(botCount, 10);
  const normalized = Number.isFinite(parsed)
    ? Math.min(MAX_BOT_COUNT, Math.max(MIN_BOT_COUNT, parsed))
    : DEFAULT_BOT_COUNT;
  return updateBots({ ...state, botCount: normalized }, randomFn);
}

export function updateBots(state, randomFn = Math.random) {
  const targetBotCount = state.botCount || 0;
  let nextState = state;

  // Remove excess bots (from the end of the list)
  while (true) {
    const botIds = nextState.playerOrder.filter((id) => nextState.players[id]?.isBot);
    if (botIds.length <= targetBotCount) break;
    const botToRemove = botIds[botIds.length - 1];
    nextState = removePlayer(nextState, botToRemove, randomFn);
  }

  // Add missing bots
  const BOT_NAMES = [
    "🤖 NeonBot",
    "🤖 CyberBot",
    "🤖 MatrixSnake",
    "🤖 QuantumBoa",
    "🤖 RoboCobra",
    "🤖 SynthPython",
    "🤖 ByteSerpent",
    "🤖 PixelHydra"
  ];
  while (true) {
    const botIds = nextState.playerOrder.filter((id) => nextState.players[id]?.isBot);
    if (botIds.length >= targetBotCount || nextState.playerOrder.length >= nextState.maxPlayers) {
      break;
    }
    const botIndex = botIds.length;
    const botId = `bot_${botIndex + 1}_${Math.floor(randomFn() * 10000)}`;
    const botName = BOT_NAMES[botIndex % BOT_NAMES.length];
    nextState = addPlayer(nextState, botId, botName, randomFn, true);
  }

  return nextState;
}

export function calculateBotDirection(state, botPlayer, nowMs = Date.now()) {
  if (!botPlayer || !botPlayer.isAlive || !botPlayer.snake || botPlayer.snake.length === 0) {
    return botPlayer?.direction || "RIGHT";
  }

  const head = botPlayer.snake[0];
  const currentDir = botPlayer.pendingDirection || botPlayer.direction;
  const oppositeDir = OPPOSITES[currentDir];
  const directions = ["UP", "DOWN", "LEFT", "RIGHT"].filter((d) => d !== oppositeDir);
  const isGhost = Boolean(botPlayer.ghostUntil && botPlayer.ghostUntil > nowMs);

  const dangerSet = new Set();
  for (const obstacle of state.obstacles) {
    if (obstacle.phase !== "preview") {
      dangerSet.add(`${obstacle.x},${obstacle.y}`);
    }
  }

  for (const playerId of state.playerOrder) {
    const p = state.players[playerId];
    if (!p || !p.isAlive) continue;
    if (isGhost && p.id !== botPlayer.id) continue;

    p.snake.forEach((seg, idx) => {
      if (p.id === botPlayer.id && idx === 0) return;
      dangerSet.add(`${seg.x},${seg.y}`);
    });
  }

  function getWrappedPos(pos) {
    return {
      x: (pos.x + state.gridSize) % state.gridSize,
      y: (pos.y + state.gridSize) % state.gridSize
    };
  }

  function getDistance(posA, posB) {
    const dx = Math.abs(posA.x - posB.x);
    const dy = Math.abs(posA.y - posB.y);
    const minDx = Math.min(dx, state.gridSize - dx);
    const minDy = Math.min(dy, state.gridSize - dy);
    return minDx + minDy;
  }

  function isPositionSafe(pos) {
    const wrapped = getWrappedPos(pos);
    return !dangerSet.has(`${wrapped.x},${wrapped.y}`);
  }

  const safeDirections = directions.filter((d) => {
    const vec = DIRECTION_VECTORS[d];
    const nextPos = getWrappedPos({ x: head.x + vec.x, y: head.y + vec.y });
    return isPositionSafe(nextPos);
  });

  const availableDirections = safeDirections.length > 0 ? safeDirections : directions;

  if (availableDirections.length === 0) {
    return currentDir;
  }

  let nearestFood = null;
  let minDistance = Infinity;

  for (const food of state.foods) {
    const dist = getDistance(head, food);
    if (dist < minDistance) {
      minDistance = dist;
      nearestFood = food;
    }
  }

  if (!nearestFood) {
    if (availableDirections.includes(currentDir)) {
      return currentDir;
    }
    return availableDirections[0];
  }

  let bestDir = availableDirections[0];
  let bestDist = Infinity;

  for (const d of availableDirections) {
    const vec = DIRECTION_VECTORS[d];
    const nextPos = getWrappedPos({ x: head.x + vec.x, y: head.y + vec.y });
    const dist = getDistance(nextPos, nearestFood);
    if (dist < bestDist) {
      bestDist = dist;
      bestDir = d;
    }
  }

  return bestDir;
}

export function tickGame(state, randomFn = Math.random, nowMs = Date.now()) {
  let nextState = updateBots(state, randomFn);
  nextState = rotateExpiredFoods(nextState, randomFn, nowMs);
  nextState = processRespawns(nextState, nowMs, randomFn);
  nextState = advanceObstacles(nextState, randomFn, nowMs);
  nextState = chargeManualBoosts(nextState, nowMs);

  for (const playerId of nextState.playerOrder) {
    const p = nextState.players[playerId];
    if (p && p.isBot && p.isAlive) {
      const botDir = calculateBotDirection(nextState, p, nowMs);
      nextState = queueDirection(nextState, playerId, botDir);
    }
  }

  if (nextState.status !== "running") {
    return nextState;
  }

  const intentions = {};
  const obstacleKeys = new Set(
    nextState.obstacles
      .filter((obstacle) => obstacle.phase !== "preview")
      .map((point) => toKey(point))
  );

  for (const playerId of nextState.playerOrder) {
    const player = nextState.players[playerId];
    if (!player || !player.isAlive) {
      continue;
    }

    if (player.frozenUntil && player.frozenUntil > nowMs) {
      intentions[playerId] = {
        direction: player.pendingDirection,
        nextHead: player.snake[0],
        movementPath: [],
        growthUnits: 0,
        scoreUnits: 0,
        eatenFoodIndex: -1,
        eatenFoodPathIndex: -1,
        speedBoostUntil: player.speedBoostUntil,
        shieldGain: 0,
        isGhost: Boolean(player.ghostUntil && player.ghostUntil > nowMs)
      };
      continue;
    }

    const direction = player.pendingDirection;
    const movement = DIRECTION_VECTORS[direction];
    const head = player.snake[0];
    const stepCount = isPlayerBoosted(player, nowMs) ? nextState.speedBoostMultiplier : 1;
    const movementPath = buildMovementPath(head, movement, stepCount, nextState.gridSize);
    const nextHead = movementPath[movementPath.length - 1];
    const eatenFoodIndex = findFoodIndexInPath(nextState.foods, movementPath);
    const eatenFood = eatenFoodIndex === -1 ? null : nextState.foods[eatenFoodIndex];
    const eatenFoodPathIndex = eatenFood
      ? movementPath.findIndex((point) => point.x === eatenFood.x && point.y === eatenFood.y)
      : -1;
    const growthUnits = eatenFood ? getFoodGrowth(eatenFood) : 0;
    const scoreUnits = eatenFood ? getFoodScore(eatenFood) : 0;
    const speedBoostUntil = isSpeedBonusFood(eatenFood)
      ? nowMs + nextState.speedBoostDurationMs
      : player.speedBoostUntil;
    const shieldGain = isShieldBonusFood(eatenFood) ? 1 : 0;
    const ghostUntil = isGhostBonusFood(eatenFood) ? nowMs + 8_000 : player.ghostUntil;
    const magnetUntil = isMagnetBonusFood(eatenFood) ? nowMs + nextState.magnetDurationMs : player.magnetUntil;
    const freezeTriggered = isFreezeBonusFood(eatenFood);
    const isGhost = Boolean(ghostUntil && ghostUntil > nowMs);

    intentions[playerId] = {
      direction,
      nextHead,
      movementPath,
      growthUnits,
      scoreUnits,
      eatenFoodIndex,
      eatenFoodPathIndex,
      speedBoostUntil,
      shieldGain,
      isGhost,
      ghostUntil,
      magnetUntil,
      freezeTriggered
    };
  }

  const { tentativeSnakes, dead, collidedInto } = resolveMovementSteps(
    nextState,
    intentions,
    obstacleKeys
  );

  let anyFoodEaten = false;
  const eatenFoodIndexes = new Set();
  const nextPlayers = {};
  const droppedFoods = [];

  for (const playerId of nextState.playerOrder) {
    const player = nextState.players[playerId];
    if (!player) {
      continue;
    }

    if (!player.isAlive || !intentions[playerId]) {
      nextPlayers[playerId] = player;
      continue;
    }

    if (dead.has(playerId)) {
      const recoveryActive = (player.shieldRecoveryUntil ?? 0) > nowMs;
      if (recoveryActive || (player.shieldCharges ?? 0) > 0) {
        dead.delete(playerId);
        collidedInto.delete(playerId);
        nextPlayers[playerId] = {
          ...player,
          speedBoostUntil: null,
          manualBoostRequested: false,
          manualBoostChargedAt: null,
          shieldCharges: recoveryActive ? player.shieldCharges : player.shieldCharges - 1,
          shieldRecoveryUntil: recoveryActive
            ? player.shieldRecoveryUntil
            : nowMs + SHIELD_RECOVERY_MS
        };
        continue;
      }

      const baseFoodType = BASE_FOOD_TYPES[0];
      for (let i = 0; i < player.snake.length; i += 2) {
        const segment = player.snake[i];
        droppedFoods.push({
          x: segment.x,
          y: segment.y,
          tier: baseFoodType.tier,
          score: baseFoodType.score,
          growth: baseFoodType.growth,
          expiresAt: nowMs + baseFoodType.lifetimeMs
        });
      }

      nextPlayers[playerId] = {
        ...player,
        snake: [],
        isAlive: false,
        respawnAt: nowMs + nextState.respawnDelayMs,
        bestScore: Math.max(player.bestScore ?? 0, player.score),
        speedBoostUntil: null,
        manualBoostRequested: false,
        manualBoostChargedAt: null,
        shieldCharges: 0,
        shieldRecoveryUntil: null,
        magnetUntil: null
      };
      continue;
    }

    const intent = intentions[playerId];
    if (intent.eatenFoodIndex !== -1) {
      eatenFoodIndexes.add(intent.eatenFoodIndex);
      anyFoodEaten = true;
    }
    nextPlayers[playerId] = {
      ...player,
      direction: intent.direction,
      pendingDirection: intent.direction,
      snake: tentativeSnakes[playerId],
      score: player.score + intent.scoreUnits,
      bestScore: Math.max(player.bestScore ?? 0, player.score + intent.scoreUnits),
      isAlive: true,
      speedBoostUntil: intent.speedBoostUntil,
      ghostUntil: intent.ghostUntil,
      magnetUntil: intent.magnetUntil,
      manualBoostChargedAt:
        intent.speedBoostUntil && intent.speedBoostUntil > nowMs && player.manualBoostRequested
          ? intent.speedBoostUntil
          : player.manualBoostChargedAt,
      shieldCharges: Math.min(MAX_SHIELD_CHARGES, (player.shieldCharges ?? 0) + intent.shieldGain),
      respawnAt: null
    };
  }

  // A body collision transfers half the fallen snake's length to the survivor.
  for (const [hitterId, survivorId] of collidedInto) {
    const fallen = nextPlayers[hitterId];
    const survivor = nextPlayers[survivorId];
    if (fallen && !fallen.isAlive && survivor?.isAlive) {
      const growth = Math.floor(nextState.players[hitterId].snake.length / 2);
      nextPlayers[survivorId] = {...survivor, snake: growSnakeBy(survivor.snake, growth)};
    }
  }

  // Apply Magnet effects
  for (const playerId of nextState.playerOrder) {
    const player = nextPlayers[playerId];
    if (!player || !player.isAlive || !player.magnetUntil || player.magnetUntil <= nowMs) continue;

    const head = player.snake[0];
    for (let i = 0; i < nextState.foods.length; i++) {
      if (eatenFoodIndexes.has(i)) continue;
      const food = nextState.foods[i];
      const dx = Math.abs(food.x - head.x);
      const dy = Math.abs(food.y - head.y);
      const minDx = Math.min(dx, nextState.gridSize - dx);
      const minDy = Math.min(dy, nextState.gridSize - dy);
      const dist = Math.max(minDx, minDy);
      if (dist <= nextState.magnetRadius) {
        eatenFoodIndexes.add(i);
        anyFoodEaten = true;

        const growth = getFoodGrowth(food);
        if (growth > 0) {
          player.snake = growSnakeBy(player.snake, growth);
        }
        player.score += getFoodScore(food);
        player.bestScore = Math.max(player.bestScore ?? 0, player.score);

        if (isSpeedBonusFood(food)) {
          player.speedBoostUntil = Math.max(player.speedBoostUntil || 0, nowMs + nextState.speedBoostDurationMs);
        }
        if (isShieldBonusFood(food)) {
          player.shieldCharges = Math.min(MAX_SHIELD_CHARGES, (player.shieldCharges || 0) + 1);
        }
        if (isGhostBonusFood(food)) {
          player.ghostUntil = Math.max(player.ghostUntil || 0, nowMs + 8_000);
        }
        if (isMagnetBonusFood(food)) {
          player.magnetUntil = Math.max(player.magnetUntil || 0, nowMs + nextState.magnetDurationMs);
        }
        if (isFreezeBonusFood(food)) {
          intentions[playerId] = intentions[playerId] || {};
          intentions[playerId].freezeTriggered = true;
        }
      }
    }
  }

  // Apply Freeze effects
  let freezeEventTriggered = false;
  for (const playerId of nextState.playerOrder) {
    if (intentions[playerId]?.freezeTriggered && !dead.has(playerId)) {
      freezeEventTriggered = true;
      break;
    }
  }
  if (freezeEventTriggered) {
    for (const playerId of nextState.playerOrder) {
      if (nextPlayers[playerId] && nextPlayers[playerId].isAlive && !intentions[playerId]?.freezeTriggered) {
        nextPlayers[playerId].frozenUntil = nowMs + 3_000;
      }
    }
  }

  const nextFoods = anyFoodEaten
    ? nextState.foods.filter((_, index) => !eatenFoodIndexes.has(index))
    : [...nextState.foods];

  nextFoods.push(...droppedFoods);

  nextState = {
    ...nextState,
    players: nextPlayers,
    foods: (anyFoodEaten || droppedFoods.length > 0)
      ? refillFoods(
          nextPlayers,
          nextState.gridSize,
          nextState.obstacles,
          nextFoods,
          randomFn,
          nowMs,
          nextState.foodDensity
        )
      : nextFoods
  };

  return withStatus(nextState);
}

export function serializeGame(state, nowMs = Date.now()) {
  return {
    gridSize: state.gridSize,
    respawnDelayMs: state.respawnDelayMs,
    speedBoostDurationMs: state.speedBoostDurationMs,
    speedBoostMultiplier: state.speedBoostMultiplier,
    foodDensity: state.foodDensity,
    maxPlayers: state.maxPlayers,
    botCount: state.botCount || 0,
    magnetDurationMs: state.magnetDurationMs,
    magnetRadius: state.magnetRadius,
    obstaclePhase: state.obstaclePhase,
    obstacleNextPhaseAt: state.obstacleNextPhaseAt,
    obstacles: state.obstacles.map(({ nextPhaseAt, ...obstacle }) => obstacle),
    foodLegend: getFoodLegend(state.speedBoostDurationMs, state.speedBoostMultiplier),
    foods: state.foods.map(({ expiresAt, ...food }) => ({
      ...food,
      expiresInMs: Number.isFinite(expiresAt) ? Math.max(0, expiresAt - nowMs) : null
    })),
    status: state.status,
    players: state.playerOrder
      .map((id) => state.players[id])
      .filter(Boolean)
      .map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        snake: player.snake,
        direction: player.direction,
        score: player.score,
        bestScore: player.bestScore ?? player.score,
        isAlive: player.isAlive,
        isBot: Boolean(player.isBot),
        shieldCharges: player.shieldCharges ?? 0,
        shieldRecoveryMsLeft:
          player.shieldRecoveryUntil && player.shieldRecoveryUntil > nowMs
            ? player.shieldRecoveryUntil - nowMs
            : 0,
        manualBoostActive:
          Boolean(player.manualBoostRequested) &&
          player.snake.length > MIN_MANUAL_BOOST_LENGTH &&
          !(player.speedBoostUntil && player.speedBoostUntil > nowMs),
        boostMsLeft:
          player.speedBoostUntil && player.speedBoostUntil > nowMs
            ? player.speedBoostUntil - nowMs
            : 0,
        ghostUntil: player.ghostUntil || null,
        frozenUntil: player.frozenUntil || null,
        magnetUntil: player.magnetUntil || null
      }))
  };
}

function withStatus(state) {
  const alive = state.playerOrder
    .map((id) => state.players[id])
    .filter((player) => player && player.isAlive).length;

  return {
    ...state,
    status: alive >= 1 ? "running" : "waiting"
  };
}

function processRespawns(state, nowMs, randomFn = Math.random) {
  let players = state.players;
  let changed = false;

  for (const playerId of state.playerOrder) {
    const player = players[playerId];
    if (!player || player.isAlive || player.respawnAt == null || player.respawnAt > nowMs) {
      continue;
    }

    const respawnPlacement = findRespawnPlacement(state, players, playerId, randomFn);
    if (!respawnPlacement) {
      continue;
    }

    if (!changed) {
      players = { ...players };
      changed = true;
    }

    players[playerId] = {
      ...player,
      snake: respawnPlacement.snake,
      direction: respawnPlacement.direction,
      pendingDirection: respawnPlacement.direction,
      score: 0,
      bestScore: Math.max(player.bestScore ?? 0, player.score),
      isAlive: true,
      ghostUntil: nowMs + 3000,
      speedBoostUntil: null,
      manualBoostRequested: false,
      manualBoostChargedAt: null,
      shieldCharges: 0,
      shieldRecoveryUntil: null,
      respawnAt: null
    };
  }

  if (!changed) {
    return state;
  }

  return withStatus({
    ...state,
    players
  });
}

function findRespawnPlacement(state, players, playerId, randomFn = Math.random) {
  const player = players[playerId];
  const preferredIndex = player.slotIndex ?? state.playerOrder.indexOf(playerId);
  const directions = Object.keys(DIRECTION_VECTORS);

  for (let i = 0; i < state.maxPlayers; i += 1) {
    const slot = getSpawnSlot((preferredIndex + i) % state.maxPlayers, state.gridSize);
    const snake = buildSpawnSnake(slot.head, slot.direction, state.gridSize);
    if (isSnakePlacementFree(snake, players, state.foods, state.obstacles, playerId)) {
      return { snake, direction: slot.direction };
    }
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const head = {
      x: Math.floor(randomFn() * state.gridSize),
      y: Math.floor(randomFn() * state.gridSize)
    };
    const direction = directions[Math.floor(randomFn() * directions.length)];
    const snake = buildSpawnSnake(head, direction, state.gridSize);
    if (isSnakePlacementFree(snake, players, state.foods, state.obstacles, playerId)) {
      return { snake, direction };
    }
  }

  return null;
}

function isSnakePlacementFree(snake, players, foods, obstacles, ignorePlayerId) {
  const occupied = getOccupiedCells(players, foods, obstacles, ignorePlayerId);
  const seen = new Set();

  for (const segment of snake) {
    const key = toKey(segment);
    if (occupied.has(key) || seen.has(key)) {
      return false;
    }
    seen.add(key);
  }

  return true;
}

function buildSpawnSnake(head, direction, gridSize = DEFAULT_GRID_SIZE) {
  const movement = DIRECTION_VECTORS[OPPOSITES[direction]];

  return [
    head,
    wrapPoint({ x: head.x + movement.x, y: head.y + movement.y }, gridSize),
    wrapPoint({ x: head.x + movement.x * 2, y: head.y + movement.y * 2 }, gridSize)
  ];
}

function refillFoods(
  players,
  gridSize,
  obstacles,
  existingFoods,
  randomFn = Math.random,
  nowMs = Date.now(),
  foodDensity = DEFAULT_FOOD_DENSITY
) {
  const targetCount = pickFoodCount(foodDensity, gridSize, randomFn);
  const foods = [...existingFoods];
  const occupied = getOccupiedCells(players, foods, obstacles);
  const freeCells = getFreeCells(occupied, gridSize);

  while (foods.length < targetCount && freeCells.length > 0) {
    const index = Math.floor(randomFn() * freeCells.length);
    const [point] = freeCells.splice(index, 1);
    foods.push(createFood(point, randomFn, nowMs));
  }

  return foods;
}

function rotateExpiredFoods(state, randomFn = Math.random, nowMs = Date.now()) {
  const activeFoods = state.foods.filter(
    (food) => !Number.isFinite(food.expiresAt) || food.expiresAt > nowMs
  );
  if (activeFoods.length === state.foods.length) {
    return state;
  }

  return {
    ...state,
    foods: refillFoods(
      state.players,
      state.gridSize,
      state.obstacles,
      activeFoods,
      randomFn,
      nowMs,
      state.foodDensity
    )
  };
}

function getOccupiedCells(players, foods, obstacles, ignorePlayerId) {
  const occupied = new Set();

  for (const playerId of Object.keys(players)) {
    if (playerId === ignorePlayerId) {
      continue;
    }
    for (const segment of players[playerId].snake) {
      occupied.add(toKey(segment));
    }
  }

  for (const food of foods) {
    occupied.add(toKey(food));
  }

  for (const obstacle of obstacles) {
    occupied.add(toKey(obstacle));
  }

  return occupied;
}

function getFreeCells(occupied, gridSize) {
  const freeCells = [];
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        freeCells.push({ x, y });
      }
    }
  }

  return freeCells;
}

function pickFoodCount(foodDensity = DEFAULT_FOOD_DENSITY, gridSize = 64, randomFn = Math.random) {
  const parsed = Number.parseInt(foodDensity, 10);
  return (Number.isFinite(parsed) && parsed >= MIN_FOOD_DENSITY && parsed <= MAX_FOOD_DENSITY)
    ? parsed
    : DEFAULT_FOOD_DENSITY;
}

function isFoodDensity(foodDensity) {
  const val = Number.parseInt(foodDensity, 10);
  return Number.isFinite(val) && val >= MIN_FOOD_DENSITY && val <= MAX_FOOD_DENSITY;
}

function findFoodIndexInPath(foods, path) {
  for (const point of path) {
    const foodIndex = foods.findIndex((food) => food.x === point.x && food.y === point.y);
    if (foodIndex !== -1) {
      return foodIndex;
    }
  }
  return -1;
}

function resolveMovementSteps(state, intentions, obstacleKeys) {
  let currentSnakes = Object.fromEntries(
    state.playerOrder
      .map((playerId) => [playerId, state.players[playerId]])
      .filter(([, player]) => player?.isAlive)
      .map(([playerId, player]) => [playerId, player.snake])
  );
  const dead = new Set();
  const collidedInto = new Map();
  const maxSteps = Math.max(
    0,
    ...Object.values(intentions).map((intent) => intent.movementPath.length)
  );

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const activeIds = state.playerOrder.filter(
      (playerId) =>
        intentions[playerId] &&
        !dead.has(playerId) &&
        stepIndex < intentions[playerId].movementPath.length
    );
    const proposedSnakes = { ...currentSnakes };

    for (const playerId of activeIds) {
      const intent = intentions[playerId];
      const growthUnits = intent.eatenFoodPathIndex === stepIndex ? intent.growthUnits : 0;
      proposedSnakes[playerId] = moveSnake(
        currentSnakes[playerId],
        [intent.movementPath[stepIndex]],
        growthUnits
      );
    }

    for (const playerId of activeIds) {
      if (intentions[playerId].isGhost) continue;
      const head = proposedSnakes[playerId][0];
      if (obstacleKeys.has(toKey(head))) {
        dead.add(playerId);
      }
    }

    for (let i = 0; i < activeIds.length; i += 1) {
      for (let j = i + 1; j < activeIds.length; j += 1) {
        const firstId = activeIds[i];
        const secondId = activeIds[j];
        const firstHead = proposedSnakes[firstId][0];
        const secondHead = proposedSnakes[secondId][0];
        const firstPreviousHead = currentSnakes[firstId][0];
        const secondPreviousHead = currentSnakes[secondId][0];
        const sameCell = firstHead.x === secondHead.x && firstHead.y === secondHead.y;
        const swappedCells =
          firstHead.x === secondPreviousHead.x &&
          firstHead.y === secondPreviousHead.y &&
          secondHead.x === firstPreviousHead.x &&
          secondHead.y === firstPreviousHead.y;

        if (sameCell || swappedCells) {
          if (!intentions[firstId].isGhost && !intentions[secondId]?.isGhost) {
            dead.add(firstId);
            dead.add(secondId);
          } else if (!intentions[firstId].isGhost) {
             // Second is ghost, first passes through
          } else if (!intentions[secondId]?.isGhost) {
             // First is ghost, second passes through
          }
        }
      }
    }

    for (const playerId of activeIds) {
      if (dead.has(playerId)) {
        continue;
      }

      const head = proposedSnakes[playerId][0];
      if (intentions[playerId].isGhost) continue;

      for (const [otherId, segments] of Object.entries(proposedSnakes)) {
        if (otherId === playerId) {
          continue;
        }

        // If the other player is a ghost, you don't die by hitting their body
        if (intentions[otherId] && intentions[otherId].isGhost) {
          continue;
        }

        if (pointInSegments(head, segments)) {
          dead.add(playerId);
          collidedInto.set(playerId, otherId);
          break;
        }
      }
    }

    currentSnakes = proposedSnakes;
  }

  return { tentativeSnakes: currentSnakes, dead, collidedInto };
}

function pointInSegments(point, segments, startIndex = 0) {
  for (let index = startIndex; index < segments.length; index += 1) {
    if (segments[index].x === point.x && segments[index].y === point.y) {
      return true;
    }
  }
  return false;
}

function moveSnake(snake, movementPath, growthUnits) {
  const moved = [...movementPath.slice().reverse(), ...snake];
  let trimCount = movementPath.length - growthUnits;

  while (trimCount > 0 && moved.length > 1) {
    moved.pop();
    trimCount -= 1;
  }

  if (trimCount < 0) {
    return growSnakeBy(moved, -trimCount);
  }

  return moved;
}

function growSnakeBy(snake, units) {
  if (units <= 0) {
    return snake;
  }

  const grown = [...snake];
  const tail = snake[snake.length - 1];
  for (let i = 0; i < units; i += 1) {
    grown.push({ ...tail });
  }

  return grown;
}

function createFood(point, randomFn = Math.random, nowMs = Date.now()) {
  const type = pickFoodType(randomFn);
  return {
    x: point.x,
    y: point.y,
    tier: type.tier,
    score: type.score,
    growth: type.growth,
    expiresAt: nowMs + type.lifetimeMs,
    ...(type.bonus ? { bonus: type.bonus } : {})
  };
}

function pickFoodType(randomFn = Math.random) {
  const value = randomFn();
  // 3% Ghost, 1% Freeze, 5% Magnet, 4% Speed, 4% Shield, 7% Gold, 7% Poison, 69% Base
  if (value < 0.03) return GHOST_FOOD_TYPE;
  if (value < 0.04) return FREEZE_FOOD_TYPE;
  if (value < 0.09) return MAGNET_FOOD_TYPE;
  if (value < 0.13) return SPEED_FOOD_TYPE;
  if (value < 0.17) return SHIELD_FOOD_TYPE;
  if (value < 0.24) return GOLD_FOOD_TYPE;
  if (value < 0.31) return POISON_FOOD_TYPE;

  if (value < 0.54) return BASE_FOOD_TYPES[0];
  if (value < 0.85) return BASE_FOOD_TYPES[1];
  return BASE_FOOD_TYPES[2];
}

function getFoodGrowth(food) {
  return Number.isFinite(food.growth) ? food.growth : 1;
}

function getFoodScore(food) {
  return Number.isFinite(food.score) ? food.score : 1;
}

function isSpeedBonusFood(food) {
  return Boolean(food && food.bonus === "speed");
}

function isMagnetBonusFood(food) {
  return Boolean(food && food.bonus === "magnet");
}

function isShieldBonusFood(food) {
  return Boolean(food && food.bonus === "shield");
}

function isGhostBonusFood(food) {
  return Boolean(food && food.bonus === "ghost");
}

function isFreezeBonusFood(food) {
  return Boolean(food && food.bonus === "freeze");
}

function chargeManualBoosts(state, nowMs) {
  let players = state.players;
  let changed = false;

  for (const playerId of state.playerOrder) {
    const player = players[playerId];
    if (!player?.manualBoostRequested) {
      continue;
    }

    if (!player.isAlive || player.snake.length <= MIN_MANUAL_BOOST_LENGTH) {
      if (!changed) {
        players = { ...players };
        changed = true;
      }
      players[playerId] = {
        ...player,
        manualBoostRequested: false,
        manualBoostChargedAt: null
      };
      continue;
    }

    if (player.speedBoostUntil && player.speedBoostUntil > nowMs) {
      const chargedAt = Math.max(nowMs, player.speedBoostUntil);
      if (player.manualBoostChargedAt !== chargedAt) {
        if (!changed) {
          players = { ...players };
          changed = true;
        }
        players[playerId] = { ...player, manualBoostChargedAt: chargedAt };
      }
      continue;
    }

    const chargedAt = player.manualBoostChargedAt ?? nowMs;
    const elapsedIntervals = Math.floor(
      Math.max(0, nowMs - chargedAt) / MANUAL_BOOST_COST_INTERVAL_MS
    );
    const cost = Math.min(elapsedIntervals, player.snake.length - MIN_MANUAL_BOOST_LENGTH);
    if (cost <= 0) {
      continue;
    }

    const snake = player.snake.slice(0, player.snake.length - cost);
    const isAtMinimum = snake.length <= MIN_MANUAL_BOOST_LENGTH;
    if (!changed) {
      players = { ...players };
      changed = true;
    }
    players[playerId] = {
      ...player,
      snake,
      manualBoostRequested: !isAtMinimum,
      manualBoostChargedAt: isAtMinimum
        ? null
        : chargedAt + cost * MANUAL_BOOST_COST_INTERVAL_MS
    };
  }

  return changed ? { ...state, players } : state;
}

function isPlayerBoosted(player, nowMs) {
  const hasFoodBoost = Boolean(player.speedBoostUntil && player.speedBoostUntil > nowMs);
  const hasManualBoost =
    Boolean(player.manualBoostRequested) && player.snake.length > MIN_MANUAL_BOOST_LENGTH;
  return hasFoodBoost || hasManualBoost;
}

function advanceObstacles(state, randomFn, nowMs) {
  if (state.obstacles.length === 0) {
    return state;
  }

  const grouped = groupObstacles(state.obstacles);
  const nextObstacles = [];
  let changed = false;
  let groupIndex = 0;

  for (const [groupId, group] of grouped.entries()) {
    const current = group[0];
    let nextGroup = group;

    if (!Number.isFinite(current.nextPhaseAt)) {
      const nextPhaseAt =
        nowMs + pickObstacleStableDuration(randomFn) + groupIndex * 1_250;
      nextGroup = group.map((obstacle) => ({ ...obstacle, nextPhaseAt }));
      changed = true;
    } else if (nowMs >= current.nextPhaseAt && current.phase === "stable") {
      nextGroup = group.map((obstacle) => ({
        ...obstacle,
        phase: "warning",
        nextPhaseAt: nowMs + OBSTACLE_WARNING_MS
      }));
      changed = true;
    } else if (nowMs >= current.nextPhaseAt && current.phase === "warning") {
      const candidate = findSafeObstacleGroup(state, groupId, randomFn);
      if (candidate) {
        nextGroup = candidate.map((obstacle) => ({
          ...obstacle,
          phase: "preview",
          nextPhaseAt: nowMs + OBSTACLE_PREVIEW_MS
        }));
      } else {
        nextGroup = group.map((obstacle) => ({
          ...obstacle,
          phase: "stable",
          nextPhaseAt: nowMs + pickObstacleStableDuration(randomFn)
        }));
      }
      changed = true;
    } else if (nowMs >= current.nextPhaseAt && current.phase === "preview") {
      if (obstacleGroupTouchesPlayer(group, state.players)) {
        nextGroup = group.map((obstacle) => ({
          ...obstacle,
          nextPhaseAt: nowMs + 1_000
        }));
      } else {
        const nextPhaseAt = nowMs + pickObstacleStableDuration(randomFn);
        nextGroup = group.map((obstacle) => ({
          ...obstacle,
          phase: "stable",
          nextPhaseAt
        }));
      }
      changed = true;
    }

    nextObstacles.push(...nextGroup);
    groupIndex += 1;
  }

  return changed ? withObstacleSummary({ ...state, obstacles: nextObstacles }) : state;
}

function pickObstacleStableDuration(randomFn = Math.random) {
  return (
    MIN_OBSTACLE_STABLE_MS +
    Math.floor(randomFn() * (MAX_OBSTACLE_STABLE_MS - MIN_OBSTACLE_STABLE_MS + 1))
  );
}

function findSafeObstacleGroup(state, groupId, randomFn = Math.random) {
  const minCenter = 4;
  const maxCenter = state.gridSize - 5;
  const span = Math.max(1, maxCenter - minCenter + 1);
  const blocked = getObstacleRelocationBlockedCells(state, groupId);
  const currentLayoutKey = state.obstacles
    .filter((obstacle) => obstacle.groupId === groupId)
    .map(toKey)
    .sort()
    .join("|");

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const xSeed = (randomFn() + attempt * 0.37) % 1;
    const ySeed = (randomFn() + attempt * 0.61) % 1;
    const center = {
      x: minCenter + Math.floor(xSeed * span),
      y: minCenter + Math.floor(ySeed * span)
    };
    const shapeIndex = (Math.floor(randomFn() * OBSTACLE_SHAPES.length) + attempt) % OBSTACLE_SHAPES.length;
    const rotation = (Math.floor(randomFn() * 4) + attempt) % 4;
    const candidate = createObstacleGroup({
      groupId,
      gridSize: state.gridSize,
      center,
      shapeIndex,
      rotation,
      phase: "preview"
    });
    const candidateKey = candidate.map(toKey).sort().join("|");
    if (candidateKey === currentLayoutKey) {
      continue;
    }
    if (candidate.every((obstacle) => !blocked.has(toKey(obstacle)))) {
      return candidate;
    }
  }

  return null;
}

function getObstacleRelocationBlockedCells(state, excludedGroupId) {
  const blocked = new Set(state.foods.map(toKey));
  const protectPoint = (point) => {
    for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        blocked.add(toKey(wrapPoint({ x: point.x + xOffset, y: point.y + yOffset }, state.gridSize)));
      }
    }
  };

  for (const player of Object.values(state.players)) {
    for (const segment of player.snake) {
      protectPoint(segment);
    }
  }

  for (const obstacle of state.obstacles) {
    if (obstacle.groupId !== excludedGroupId) {
      blocked.add(toKey(obstacle));
    }
  }

  for (let slotIndex = 0; slotIndex < state.maxPlayers; slotIndex += 1) {
    const slot = getSpawnSlot(slotIndex, state.gridSize);
    for (const segment of buildSpawnSnake(slot.head, slot.direction, state.gridSize)) {
      protectPoint(segment);
    }
  }

  return blocked;
}

function groupObstacles(obstacles) {
  const grouped = new Map();
  for (const obstacle of obstacles) {
    const groupId = obstacle.groupId ?? "obstacle-group-0";
    const group = grouped.get(groupId) ?? [];
    group.push({ ...obstacle, groupId });
    grouped.set(groupId, group);
  }
  return grouped;
}

function obstacleGroupTouchesPlayer(group, players) {
  const groupKeys = new Set(group.map(toKey));
  return Object.values(players).some((player) =>
    player.snake.some((segment) => groupKeys.has(toKey(segment)))
  );
}

function withObstacleSummary(state) {
  const phases = new Set(state.obstacles.map((obstacle) => obstacle.phase));
  const obstaclePhase = phases.has("preview")
    ? "preview"
    : phases.has("warning")
      ? "warning"
      : "stable";
  const nextPhaseTimes = state.obstacles
    .map((obstacle) => obstacle.nextPhaseAt)
    .filter(Number.isFinite);

  return {
    ...state,
    obstaclePhase,
    obstacleNextPhaseAt: nextPhaseTimes.length > 0 ? Math.min(...nextPhaseTimes) : null
  };
}

function buildMovementPath(head, movement, steps, gridSize) {
  const path = [];
  let current = head;

  for (let i = 0; i < steps; i += 1) {
    current = wrapPoint(
      { x: current.x + movement.x, y: current.y + movement.y },
      gridSize
    );
    path.push(current);
  }

  return path;
}

function getFoodLegend(speedBoostDurationMs, speedBoostMultiplier) {
  return [
    ...BASE_FOOD_TYPES.map((foodType) => ({
      tier: foodType.tier,
      score: foodType.score,
      growth: foodType.growth,
      visibleForMs: foodType.lifetimeMs
    })),
    {
      tier: SPEED_FOOD_TYPE.tier,
      score: SPEED_FOOD_TYPE.score,
      growth: SPEED_FOOD_TYPE.growth,
      bonus: SPEED_FOOD_TYPE.bonus,
      durationMs: speedBoostDurationMs,
      multiplier: speedBoostMultiplier,
      visibleForMs: SPEED_FOOD_TYPE.lifetimeMs
    },
    {
      tier: GOLD_FOOD_TYPE.tier,
      score: GOLD_FOOD_TYPE.score,
      growth: GOLD_FOOD_TYPE.growth,
      bonus: GOLD_FOOD_TYPE.bonus,
      visibleForMs: GOLD_FOOD_TYPE.lifetimeMs
    },
    {
      tier: POISON_FOOD_TYPE.tier,
      score: POISON_FOOD_TYPE.score,
      growth: POISON_FOOD_TYPE.growth,
      bonus: POISON_FOOD_TYPE.bonus,
      visibleForMs: POISON_FOOD_TYPE.lifetimeMs
    },
    {
      tier: SHIELD_FOOD_TYPE.tier,
      score: SHIELD_FOOD_TYPE.score,
      growth: SHIELD_FOOD_TYPE.growth,
      bonus: SHIELD_FOOD_TYPE.bonus,
      visibleForMs: SHIELD_FOOD_TYPE.lifetimeMs
    },
    {
      tier: GHOST_FOOD_TYPE.tier,
      score: GHOST_FOOD_TYPE.score,
      growth: GHOST_FOOD_TYPE.growth,
      bonus: GHOST_FOOD_TYPE.bonus,
      visibleForMs: GHOST_FOOD_TYPE.lifetimeMs
    },
    {
      tier: FREEZE_FOOD_TYPE.tier,
      score: FREEZE_FOOD_TYPE.score,
      growth: FREEZE_FOOD_TYPE.growth,
      bonus: FREEZE_FOOD_TYPE.bonus,
      visibleForMs: FREEZE_FOOD_TYPE.lifetimeMs
    },
    {
      tier: MAGNET_FOOD_TYPE.tier,
      score: MAGNET_FOOD_TYPE.score,
      growth: MAGNET_FOOD_TYPE.growth,
      bonus: MAGNET_FOOD_TYPE.bonus,
      visibleForMs: MAGNET_FOOD_TYPE.lifetimeMs
    }
  ];
}

function createInitialObstacles(gridSize) {
  if (gridSize < 24) {
    return [];
  }

  const groupCount = Math.max(2, Math.floor(((gridSize * gridSize) / (64 * 64)) * 3));
  const anchors = [];
  for (let i = 0; i < groupCount; i++) {
    anchors.push({ x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.8 });
  }
  const obstacles = [];

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const anchor = anchors[groupIndex];
    obstacles.push(
      ...createObstacleGroup({
        groupId: `obstacle-group-${groupIndex}`,
        gridSize,
        center: {
          x: Math.round(gridSize * anchor.x),
          y: Math.round(gridSize * anchor.y)
        },
        shapeIndex: groupIndex % OBSTACLE_SHAPES.length,
        rotation: groupIndex % 4,
        phase: "stable"
      })
    );
  }

  return obstacles;
}

function createObstacleGroup({ groupId, gridSize, center, shapeIndex, rotation, phase }) {
  const shape = OBSTACLE_SHAPES[shapeIndex] ?? OBSTACLE_SHAPES[0];
  const points = [];
  const seen = new Set();

  for (const offset of shape) {
    const rotated = rotateObstacleOffset(offset, rotation);
    addObstaclePoint(
      points,
      seen,
      { x: center.x + rotated.x, y: center.y + rotated.y },
      gridSize
    );
  }

  return points.map((point, index) => ({
    id: `${groupId}-${index}`,
    groupId,
    ...point,
    phase,
    nextPhaseAt: null
  }));
}

function rotateObstacleOffset(point, rotation) {
  const normalizedRotation = ((rotation % 4) + 4) % 4;
  if (normalizedRotation === 1) {
    return { x: -point.y, y: point.x };
  }
  if (normalizedRotation === 2) {
    return { x: -point.x, y: -point.y };
  }
  if (normalizedRotation === 3) {
    return { x: point.y, y: -point.x };
  }
  return point;
}

function addObstaclePoint(points, seen, point, gridSize) {
  if (point.x <= 1 || point.y <= 1 || point.x >= gridSize - 2 || point.y >= gridSize - 2) {
    return;
  }
  const key = toKey(point);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  points.push(point);
}

function wrapPoint(point, gridSize) {
  return {
    x: (point.x + gridSize) % gridSize,
    y: (point.y + gridSize) % gridSize
  };
}

function toKey(point) {
  return `${point.x},${point.y}`;
}

function getSpawnSlot(slotIndex, gridSize) {
  const margin = 3;
  const max = gridSize - 1 - margin;
  const middle = Math.floor(gridSize / 2);
  const quarter = Math.max(margin + 2, Math.floor(gridSize / 3));
  const threeQuarter = Math.min(max - 2, gridSize - 1 - quarter);
  const slots = [
    { head: { x: margin, y: margin }, direction: "RIGHT" },
    { head: { x: max, y: max }, direction: "LEFT" },
    { head: { x: margin, y: max }, direction: "RIGHT" },
    { head: { x: max, y: margin }, direction: "LEFT" },
    { head: { x: middle, y: margin }, direction: "DOWN" },
    { head: { x: middle, y: max }, direction: "UP" },
    { head: { x: margin, y: middle }, direction: "RIGHT" },
    { head: { x: max, y: middle }, direction: "LEFT" },
    { head: { x: quarter, y: margin }, direction: "DOWN" },
    { head: { x: threeQuarter, y: max }, direction: "UP" },
    { head: { x: margin, y: quarter }, direction: "RIGHT" },
    { head: { x: max, y: threeQuarter }, direction: "LEFT" }
  ];

  return slots[slotIndex % slots.length];
}

function normalizeGridSize(gridSize) {
  const parsed = Number.parseInt(gridSize, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GRID_SIZE;
  }
  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, parsed));
}

function normalizeRespawnDelay(respawnDelayMs) {
  const parsed = Number.parseInt(respawnDelayMs, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_RESPAWN_DELAY_MS;
  }

  return Math.min(MAX_RESPAWN_DELAY_MS, Math.max(MIN_RESPAWN_DELAY_MS, parsed));
}

function normalizeSpeedBoostDuration(speedBoostDurationMs) {
  const parsed = Number.parseInt(speedBoostDurationMs, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SPEED_BOOST_DURATION_MS;
  }

  return Math.min(MAX_SPEED_BOOST_DURATION_MS, Math.max(MIN_SPEED_BOOST_DURATION_MS, parsed));
}

function normalizeSpeedBoostMultiplier(speedBoostMultiplier) {
  const parsed = Number.parseInt(speedBoostMultiplier, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SPEED_BOOST_MULTIPLIER;
  }

  return Math.min(MAX_SPEED_BOOST_MULTIPLIER, Math.max(MIN_SPEED_BOOST_MULTIPLIER, parsed));
}

function normalizeMaxPlayers(maxPlayers) {
  const parsed = Number.parseInt(maxPlayers, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_PLAYERS;
  }

  return Math.min(MAX_ONLINE_PLAYERS, Math.max(MIN_ONLINE_PLAYERS, parsed));
}

function rebuildState(
  state,
  gridSize,
  respawnDelayMs,
  speedBoostDurationMs,
  speedBoostMultiplier,
  randomFn = Math.random
) {
  let nextState = createGameState(
    randomFn,
    gridSize,
    respawnDelayMs,
    speedBoostDurationMs,
    speedBoostMultiplier,
    state.foodDensity,
    state.maxPlayers
  );

  nextState.botCount = state.botCount || 0;

  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    nextState = addPlayer(nextState, playerId, player.name, randomFn, Boolean(player.isBot));
    nextState = {
      ...nextState,
      players: {
        ...nextState.players,
        [playerId]: {
          ...nextState.players[playerId],
          bestScore: Math.max(player.bestScore ?? 0, player.score)
        }
      }
    };
  }

  return withStatus(nextState);
}
