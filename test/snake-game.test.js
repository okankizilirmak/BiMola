import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlayer,
  createGameState,
  MAX_ONLINE_PLAYERS,
  MAX_SPEED_BOOST_MULTIPLIER,
  MAX_RESPAWN_DELAY_MS,
  MAX_SPEED_BOOST_DURATION_MS,
  MIN_SPEED_BOOST_MULTIPLIER,
  MIN_RESPAWN_DELAY_MS,
  MIN_SPEED_BOOST_DURATION_MS,
  OBSTACLE_PREVIEW_MS,
  OBSTACLE_WARNING_MS,
  queueDirection,
  removePlayer,
  restartGame,
  setFoodDensity,
  setRespawnDelay,
  setManualBoost,
  setMaxPlayers,
  setBotCount,
  calculateBotDirection,
  setSpeedBoostMultiplier,
  setSpeedBoostDuration,
  setGridSize,
  serializeGame,
  tickGame
} from "../server/games/snake/game.js";

test("host can raise the online player limit without overlapping spawn heads", () => {
  let state = setMaxPlayers(createGameState(() => 0), 8);

  for (let index = 1; index <= 8; index += 1) {
    state = addPlayer(state, `p${index}`, `Player ${index}`, () => 0);
  }

  assert.equal(state.maxPlayers, 8);
  assert.equal(state.playerOrder.length, 8);
  assert.equal(new Set(state.playerOrder.map((id) => {
    const head = state.players[id].snake[0];
    return `${head.x},${head.y}`;
  })).size, 8);
  assert.equal(new Set(state.playerOrder.map((id) => state.players[id].color)).size, 8);

  const fullState = addPlayer(state, "p9", "Player 9", () => 0);
  assert.equal(fullState.players.p9, undefined);
  assert.equal(serializeGame(state).maxPlayers, 8);
  assert.equal(setMaxPlayers(state, MAX_ONLINE_PLAYERS + 5).maxPlayers, MAX_ONLINE_PLAYERS);
  assert.equal(setMaxPlayers(state, 2).maxPlayers, 8);
});

test("game starts running when first player joins", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  assert.equal(state.status, "running");
  state = addPlayer(state, "p2", "B", () => 0);
  assert.equal(state.status, "running");
});

test("players wrap through walls", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [{ x: 63, y: 5 }],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const next = tickGame(state, () => 0);
  assert.deepEqual(next.players.p1.snake[0], { x: 0, y: 5 });
});

test("eating food grows snake and increases score", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  const head = state.players.p1.snake[0];
  state = {
    ...state,
    foods: [{ x: head.x + 1, y: head.y }, ...state.foods]
  };

  const beforeLength = state.players.p1.snake.length;
  const next = tickGame(state, () => 0);

  assert.equal(next.players.p1.score, 1);
  assert.equal(next.players.p1.snake.length, beforeLength + 1);
});

test("high-tier food gives higher score and growth", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  const head = state.players.p1.snake[0];
  state = {
    ...state,
    foods: [{ x: head.x + 1, y: head.y, tier: 3, score: 3, growth: 3 }]
  };

  const beforeLength = state.players.p1.snake.length;
  const next = tickGame(state, () => 0);

  assert.equal(next.players.p1.score, 3);
  assert.equal(next.players.p1.snake.length, beforeLength + 3);
});

test("gold food grants five points and five growth units", () => {
  let state = addPlayer(createGameState(() => 0, 16), "p1", "A", () => 0);
  const head = state.players.p1.snake[0];
  state = {
    ...state,
    foods: [
      { x: head.x + 1, y: head.y, tier: 5, score: 5, growth: 5, bonus: "gold" }
    ]
  };

  const beforeLength = state.players.p1.snake.length;
  const next = tickGame(state, () => 0, 0);

  assert.equal(next.players.p1.score, 5);
  assert.equal(next.players.p1.snake.length, beforeLength + 5);
});

test("dead player respawns after 10 seconds", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        isAlive: false,
        snake: [],
        respawnAt: 10_000
      }
    },
    status: "waiting"
  };

  const before = tickGame(state, () => 0, 9_999);
  assert.equal(before.players.p1.isAlive, false);

  const after = tickGame(state, () => 0, 10_000);
  assert.equal(after.players.p1.isAlive, true);
  assert.equal(after.players.p1.snake.length, 3);
  assert.equal(after.players.p1.respawnAt, null);
  assert.equal(after.players.p1.score, 0);
});

test("when player hits another player, half of hitter size transfers", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    foods: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 4, y: 5 },
          { x: 3, y: 5 },
          { x: 2, y: 5 },
          { x: 1, y: 5 },
          { x: 0, y: 5 },
          { x: 0, y: 4 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      },
      p2: {
        ...state.players.p2, ghostUntil: null,
        snake: [
          { x: 7, y: 5 },
          { x: 6, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 6 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const next = tickGame(state, () => 0, 0);
  assert.equal(next.players.p1.isAlive, false);
  assert.equal(next.players.p2.isAlive, true);
  assert.equal(next.players.p2.snake.length, 7);
});

test("food count matches the exact density number", () => {
  let i = 0;
  const randomValues = [0.0, 0.4, 0.9, 0.2, 0.8, 0.6];
  const randomFn = () => {
    const value = randomValues[i % randomValues.length];
    i += 1;
    return value;
  };

  let state = createGameState(randomFn);
  state = addPlayer(state, "p1", "A", randomFn);
  state = addPlayer(state, "p2", "B", randomFn);

  assert.equal(state.foods.length, 10);
});

test("host food density can be configured to an exact number", () => {
  let state = createGameState(() => 0);

  assert.equal(state.foodDensity, 10);
  state = setFoodDensity(state, 15, () => 0.5);

  assert.equal(state.foodDensity, 15);
  assert.equal(state.foods.length, 15);
  assert.equal(setFoodDensity(state, -5, () => 0), state);
  assert.equal(setFoodDensity(state, "toString", () => 0), state);
});

test("lowering food density does not remove food already in the arena", () => {
  let state = setFoodDensity(createGameState(() => 0), 15, () => 0.5);
  const foodCount = state.foods.length;

  state = setFoodDensity(state, 5, () => 0);

  assert.equal(state.foodDensity, 5);
  assert.equal(state.foods.length, foodCount);
});

test("direction reversal is ignored", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);

  const next = queueDirection(state, "p1", "LEFT");
  assert.equal(next.players.p1.pendingDirection, "RIGHT");
});

test("restart resets alive state and scores", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1, ghostUntil: null, isAlive: false, snake: [], score: 3, bestScore: 3 }
    }
  };

  const next = restartGame(state, () => 0);
  assert.equal(next.players.p1.isAlive, true);
  assert.equal(next.players.p1.score, 0);
  assert.equal(next.players.p1.bestScore, 3);
  assert.equal(next.status, "running");
});

test("grid size can be changed from user input flow", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  const next = setGridSize(state, 48, () => 0);
  assert.equal(next.gridSize, 48);
  assert.equal(next.players.p1.isAlive, true);
  assert.equal(next.players.p2.isAlive, true);
  assert.equal(next.players.p1.snake[0].x >= 0 && next.players.p1.snake[0].x < 48, true);
});

test("best score is kept after respawn while score resets", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        isAlive: false,
        snake: [],
        score: 6,
        bestScore: 6,
        respawnAt: 10_000
      }
    }
  };

  const after = tickGame(state, () => 0, 10_000);
  assert.equal(after.players.p1.isAlive, true);
  assert.equal(after.players.p1.score, 0);
  assert.equal(after.players.p1.bestScore, 6);
});

test("respawn delay can be changed and is clamped", () => {
  let state = createGameState(() => 0);
  state = setRespawnDelay(state, MIN_RESPAWN_DELAY_MS - 500);
  assert.equal(state.respawnDelayMs, MIN_RESPAWN_DELAY_MS);

  state = setRespawnDelay(state, MAX_RESPAWN_DELAY_MS + 500);
  assert.equal(state.respawnDelayMs, MAX_RESPAWN_DELAY_MS);
});

test("speed boost duration can be changed and is clamped", () => {
  let state = createGameState(() => 0);
  state = setSpeedBoostDuration(state, MIN_SPEED_BOOST_DURATION_MS - 500);
  assert.equal(state.speedBoostDurationMs, MIN_SPEED_BOOST_DURATION_MS);

  state = setSpeedBoostDuration(state, MAX_SPEED_BOOST_DURATION_MS + 500);
  assert.equal(state.speedBoostDurationMs, MAX_SPEED_BOOST_DURATION_MS);
});

test("speed boost multiplier can be changed and is clamped", () => {
  let state = createGameState(() => 0);
  state = setSpeedBoostMultiplier(state, MIN_SPEED_BOOST_MULTIPLIER - 1);
  assert.equal(state.speedBoostMultiplier, MIN_SPEED_BOOST_MULTIPLIER);

  state = setSpeedBoostMultiplier(state, MAX_SPEED_BOOST_MULTIPLIER + 1);
  assert.equal(state.speedBoostMultiplier, MAX_SPEED_BOOST_MULTIPLIER);
});

test("bonus food gives temporary speed boost", () => {
  let state = createGameState(() => 0);
  state = setSpeedBoostDuration(state, 2_000);
  state = setSpeedBoostMultiplier(state, 3);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  state = {
    ...state,
    foods: [{ x: 4, y: 3, tier: 4, score: 0, growth: 0, bonus: "speed" }],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 3, y: 3 },
          { x: 2, y: 3 },
          { x: 1, y: 3 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      },
      p2: {
        ...state.players.p2, ghostUntil: null,
        snake: [
          { x: 20, y: 20 },
          { x: 19, y: 20 },
          { x: 18, y: 20 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const boosted = tickGame(state, () => 0, 1_000);
  assert.equal(boosted.players.p1.speedBoostUntil, 3_000);
  assert.deepEqual(boosted.players.p1.snake[0], { x: 4, y: 3 });
  assert.equal(
    boosted.foods.some((food) => food.x === 4 && food.y === 3 && food.bonus === "speed"),
    false
  );

  const fastMove = tickGame(boosted, () => 0, 1_100);
  assert.deepEqual(fastMove.players.p1.snake[0], { x: 7, y: 3 });
});

test("large grids start with multiple compact obstacle groups", () => {
  const state = createGameState(() => 0, 64);
  const groupIds = new Set(state.obstacles.map((obstacle) => obstacle.groupId));

  assert.equal(groupIds.size >= 3, true);
  for (const groupId of groupIds) {
    assert.equal(state.obstacles.filter((obstacle) => obstacle.groupId === groupId).length <= 7, true);
  }
  const serialized = serializeGame(state, 0);
  assert.equal(serialized.obstacles.length > 0, true);
});

test("serialized players include their facing direction for 3D rendering", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);

  const serialized = serializeGame(state, 0);

  assert.equal(serialized.players[0].direction, "RIGHT");
});

test("obstacle collision kills player without shield", () => {
  let state = createGameState(() => 0, 64);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  const obstacle = state.obstacles[0];
  state = {
    ...state,
    foods: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: obstacle.x - 1, y: obstacle.y },
          { x: obstacle.x - 2, y: obstacle.y },
          { x: obstacle.x - 3, y: obstacle.y }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT",
        shieldCharges: 0
      }
    }
  };

  const next = tickGame(state, () => 0, 0);
  assert.equal(next.players.p1.isAlive, false);
});

test("shield absorbs one collision", () => {
  let state = createGameState(() => 0, 64);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);

  const obstacle = state.obstacles[0];
  state = {
    ...state,
    foods: [{ x: 4, y: 3, tier: 7, score: 0, growth: 0, bonus: "shield" }],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 3, y: 3 },
          { x: 2, y: 3 },
          { x: 1, y: 3 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      },
      p2: {
        ...state.players.p2, ghostUntil: null,
        snake: [
          { x: obstacle.x + 5, y: obstacle.y + 5 },
          { x: obstacle.x + 4, y: obstacle.y + 5 },
          { x: obstacle.x + 3, y: obstacle.y + 5 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const withShield = tickGame(state, () => 0, 0);
  assert.equal(withShield.players.p1.shieldCharges, 1);

  const collideState = {
    ...withShield,
    foods: [],
    players: {
      ...withShield.players,
      p1: {
        ...withShield.players.p1,
        snake: [
          { x: obstacle.x - 1, y: obstacle.y },
          { x: obstacle.x - 2, y: obstacle.y },
          { x: obstacle.x - 3, y: obstacle.y }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const afterHit = tickGame(collideState, () => 0, 100);
  assert.equal(afterHit.players.p1.isAlive, true);
  assert.equal(afterHit.players.p1.shieldCharges, 0);
});

test("shield absorbs a rival collision and grants a visible recovery window", () => {
  let state = createGameState(() => 0, 64);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);
  state = {
    ...state,
    foods: [],
    obstacles: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 5, y: 3 },
          { x: 4, y: 3 },
          { x: 3, y: 3 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT",
        shieldCharges: 1,
        manualBoostRequested: true,
        manualBoostChargedAt: 0
      },
      p2: {
        ...state.players.p2, ghostUntil: null,
        snake: [
          { x: 8, y: 3 },
          { x: 7, y: 3 },
          { x: 6, y: 3 },
          { x: 5, y: 3 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT"
      }
    }
  };

  const next = tickGame(state, () => 0, 100);
  const serialized = serializeGame(next, 100);
  const player = serialized.players.find(({ id }) => id === "p1");

  assert.equal(next.players.p1.isAlive, true);
  assert.equal(next.players.p1.shieldCharges, 0);
  assert.equal(next.players.p1.manualBoostRequested, false);
  assert.equal(player.shieldRecoveryMsLeft > 0, true);
  assert.equal(next.players.p2.snake.length, 4);

  const recoveryCollision = tickGame(
    {
      ...next,
      foods: [],
      obstacles: [{ x: 6, y: 3, phase: "stable" }]
    },
    () => 0,
    200
  );
  assert.equal(recoveryCollision.players.p1.isAlive, true);
  assert.equal(recoveryCollision.players.p1.shieldCharges, 0);
});

test("generated bonus food retains its effect metadata", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);

  assert.equal(state.foods.length > 0, true);
  assert.equal(state.foods[0].tier, 8);
  assert.equal(state.foods[0].bonus, "ghost");
  assert.equal(Number.isFinite(state.foods[0].expiresAt), true);
});

test("expired poison food rotates without requiring a player to eat it", () => {
  let state = createGameState(() => 0, 16);
  state = setFoodDensity(state, 1, () => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = {
    ...state,
    foods: [
      { x: 10, y: 10, tier: 6, score: -2, growth: -1, bonus: "poison", expiresAt: 1_000 },
      { x: 11, y: 10, tier: 6, score: -2, growth: -1, bonus: "poison", expiresAt: 1_000 }
    ]
  };

  const next = tickGame(state, () => 0, 1_000);

  assert.equal(next.foods.length, 1);
  assert.equal(next.foods.every((food) => food.bonus === "ghost"), true);
  assert.equal(next.foods.every((food) => food.expiresAt === 13_000), true);
});

test("higher scoring base food has a shorter visibility window", () => {
  const legend = serializeGame(createGameState(() => 0), 0).foodLegend;
  const tier1 = legend.find((food) => food.tier === 1);
  const tier2 = legend.find((food) => food.tier === 2);
  const tier3 = legend.find((food) => food.tier === 3);
  const gold = legend.find((food) => food.bonus === "gold");

  assert.equal(tier1.visibleForMs > tier2.visibleForMs, true);
  assert.equal(tier2.visibleForMs > tier3.visibleForMs, true);
  assert.equal(tier3.visibleForMs > gold.visibleForMs, true);
  assert.equal(gold.growth, 5);
});

test("a replacement player reuses the free spawn slot", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);
  state = addPlayer(state, "p3", "C", () => 0);
  state = removePlayer(state, "p2", () => 0);
  state = addPlayer(state, "p4", "D", () => 0);

  assert.equal(state.players.p4.slotIndex, 1);
  assert.notDeepEqual(state.players.p4.snake, state.players.p3.snake);
});

test("boosted movement cannot pass through another snake", () => {
  let state = createGameState(() => 0, 16);
  state = setSpeedBoostMultiplier(state, 3);
  state = addPlayer(state, "p1", "A", () => 0);
  state = addPlayer(state, "p2", "B", () => 0);
  state = {
    ...state,
    foods: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 1, y: 5 },
          { x: 0, y: 5 },
          { x: 0, y: 4 }
        ],
        direction: "RIGHT",
        pendingDirection: "RIGHT",
        speedBoostUntil: 1_000
      },
      p2: {
        ...state.players.p2, ghostUntil: null,
        snake: [
          { x: 3, y: 4 },
          { x: 3, y: 5 },
          { x: 3, y: 6 }
        ],
        direction: "UP",
        pendingDirection: "UP"
      }
    }
  };

  const next = tickGame(state, () => 0, 0);
  assert.equal(next.players.p1.isAlive, false);
  assert.equal(next.players.p2.isAlive, true);
});

test("manual boost spends one tail segment per second and uses the session multiplier", () => {
  let state = createGameState(() => 0, 16);
  state = addPlayer(state, "p1", "A", () => 0);
  state = {
    ...state,
    foods: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          { x: 3, y: 8 },
          { x: 2, y: 8 },
          { x: 1, y: 8 },
          { x: 0, y: 8 },
          { x: 0, y: 7 },
          { x: 0, y: 6 }
        ]
      }
    }
  };

  state = setManualBoost(state, "p1", true, 0);
  const beforeCost = tickGame(state, () => 0, 999);
  const afterCost = tickGame(beforeCost, () => 0, 1_000);

  assert.deepEqual(beforeCost.players.p1.snake[0], { x: 5, y: 8 });
  assert.equal(beforeCost.players.p1.snake.length, 6);
  assert.deepEqual(afterCost.players.p1.snake[0], { x: 7, y: 8 });
  assert.equal(afterCost.players.p1.snake.length, 5);
  assert.equal(serializeGame(afterCost, 1_000).players[0].manualBoostActive, true);
});

test("manual boost stops automatically at the minimum snake length", () => {
  let state = addPlayer(createGameState(() => 0, 16), "p1", "A", () => 0);
  state = setManualBoost(state, "p1", true, 0);

  assert.equal(state.players.p1.manualBoostRequested, false);

  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [...state.players.p1.snake, { ...state.players.p1.snake.at(-1) }]
      }
    }
  };
  state = setManualBoost(state, "p1", true, 0);
  state = tickGame(state, () => 0, 1_000);

  assert.equal(state.players.p1.snake.length, 3);
  assert.equal(state.players.p1.manualBoostRequested, false);
});

test("repeated boost start messages cannot postpone the tail cost", () => {
  let state = addPlayer(createGameState(() => 0, 16), "p1", "A", () => 0);
  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          ...state.players.p1.snake,
          { ...state.players.p1.snake.at(-1) },
          { ...state.players.p1.snake.at(-1) }
        ]
      }
    }
  };

  state = setManualBoost(state, "p1", true, 0);
  state = setManualBoost(state, "p1", true, 900);
  state = tickGame(state, () => 0, 1_000);

  assert.equal(state.players.p1.snake.length, 4);
});

test("food boost takes priority without stacking manual boost cost", () => {
  let state = addPlayer(createGameState(() => 0, 16), "p1", "A", () => 0);
  state = {
    ...state,
    foods: [],
    players: {
      ...state.players,
      p1: {
        ...state.players.p1, ghostUntil: null,
        snake: [
          ...state.players.p1.snake,
          { ...state.players.p1.snake.at(-1) },
          { ...state.players.p1.snake.at(-1) }
        ],
        speedBoostUntil: 5_000
      }
    }
  };

  state = setManualBoost(state, "p1", true, 0);
  const duringFoodBoost = tickGame(state, () => 0, 4_999);
  const asFoodBoostEnds = tickGame(duringFoodBoost, () => 0, 5_000);

  assert.equal(duringFoodBoost.players.p1.snake.length, 5);
  assert.equal(asFoodBoostEnds.players.p1.snake.length, 5);
  assert.equal(asFoodBoostEnds.players.p1.manualBoostRequested, true);
});

test("obstacle groups warn and preview new shapes independently", () => {
  let state = createGameState(() => 0, 64);
  const movingGroupId = state.obstacles[0].groupId;
  const originalMovingPoints = state.obstacles
    .filter((obstacle) => obstacle.groupId === movingGroupId)
    .map(({ x, y }) => ({ x, y }));
  const stationaryPoints = state.obstacles
    .filter((obstacle) => obstacle.groupId !== movingGroupId)
    .map(({ x, y, groupId }) => ({ x, y, groupId }));
  state = {
    ...state,
    obstacles: state.obstacles.map((obstacle) => ({
      ...obstacle,
      nextPhaseAt: obstacle.groupId === movingGroupId ? 1_000 : 99_000
    }))
  };

  const warning = tickGame(state, () => 0, 1_000);
  assert.equal(warning.obstaclePhase, "warning");
  assert.equal(
    warning.obstacles
      .filter((obstacle) => obstacle.groupId === movingGroupId)
      .every((obstacle) => obstacle.phase === "warning"),
    true
  );
  assert.equal(
    warning.obstacles
      .filter((obstacle) => obstacle.groupId !== movingGroupId)
      .every((obstacle) => obstacle.phase === "stable"),
    true
  );

  const preview = tickGame(warning, () => 0, 1_000 + OBSTACLE_WARNING_MS);
  assert.equal(preview.obstaclePhase, "preview");
  assert.deepEqual(
    preview.obstacles
      .filter((obstacle) => obstacle.groupId !== movingGroupId)
      .map(({ x, y, groupId }) => ({ x, y, groupId })),
    stationaryPoints
  );
  assert.notDeepEqual(
    preview.obstacles
      .filter((obstacle) => obstacle.groupId === movingGroupId)
      .map(({ x, y }) => ({ x, y })),
    originalMovingPoints
  );

  const stable = tickGame(
    preview,
    () => 0,
    1_000 + OBSTACLE_WARNING_MS + OBSTACLE_PREVIEW_MS
  );
  assert.equal(
    stable.obstacles
      .filter((obstacle) => obstacle.groupId === movingGroupId)
      .every((obstacle) => obstacle.phase === "stable"),
    true
  );
});

test("preview obstacles are visible but not collidable", () => {
  let state = addPlayer(createGameState(() => 0, 16), "p1", "A", () => 0);
  state = {
    ...state,
    foods: [],
    obstacles: [
      {
        id: "preview-0",
        groupId: "preview",
        x: 4,
        y: 3,
        phase: "preview",
        nextPhaseAt: 5_000
      }
    ]
  };

  const next = tickGame(state, () => 0, 0);

  assert.equal(next.players.p1.isAlive, true);
  assert.deepEqual(next.players.p1.snake[0], { x: 4, y: 3 });

  const deferredActivation = tickGame(next, () => 0, 5_000);
  assert.equal(deferredActivation.players.p1.isAlive, true);
  assert.equal(deferredActivation.obstacles[0].phase, "preview");
  assert.equal(deferredActivation.obstacles[0].nextPhaseAt, 6_000);
});

test("host can set bot count and bots automatically spawn and move towards food", () => {
  let state = createGameState(() => 0);
  state = setMaxPlayers(state, 4);
  state = setBotCount(state, 2, () => 0);

  const botIds = state.playerOrder.filter((id) => state.players[id]?.isBot);
  assert.equal(botIds.length, 2);
  assert.equal(state.players[botIds[0]].isBot, true);

  const ticked = tickGame(state, () => 0, 100);
  assert.equal(ticked.playerOrder.filter((id) => ticked.players[id]?.isBot).length, 2);
});

test("bot AI avoids immediate wall collisions and seeks food", () => {
  let state = createGameState(() => 0);
  state = addPlayer(state, "bot1", "🤖 TestBot", () => 0, true);
  state.foods = [{ id: "f1", x: 10, y: 5, tier: 1 }];

  const bot = state.players.bot1;
  const dir = calculateBotDirection(state, bot);
  assert.equal(["UP", "DOWN", "LEFT", "RIGHT"].includes(dir), true);
});
