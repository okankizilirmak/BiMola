import {
  getFoodVisualIdentity,
  getObstacleVisualIdentity,
  getPlayerVisualIdentity
} from "./visualIdentity.js";

const MIN_GRID_SIZE = 1;
const DEFAULT_GRID_SIZE = 16;

const DIRECTION_VECTORS = {
  UP: { x: 0, y: -1 },
  RIGHT: { x: 1, y: 0 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 }
};

export function gridPointToMinimap({
  point,
  gridSize,
  width,
  height,
  padding = 10
}) {
  const safeGridSize = normalizeGridSize(gridSize);
  const x = clamp(Number(point?.x) || 0, 0, safeGridSize - 1);
  const y = clamp(Number(point?.y) || 0, 0, safeGridSize - 1);
  const drawableWidth = Math.max(0, width - padding * 2);
  const drawableHeight = Math.max(0, height - padding * 2);

  return {
    x: roundCoordinate(padding + ((x + 0.5) / safeGridSize) * drawableWidth),
    y: roundCoordinate(padding + ((y + 0.5) / safeGridSize) * drawableHeight)
  };
}

export function buildMinimapModel(state, yourPlayerId = null) {
  const gridSize = normalizeGridSize(state?.gridSize);
  const players = Array.isArray(state?.players)
    ? state.players
        .filter(
          (player) =>
            player?.isAlive && Array.isArray(player.snake) && player.snake.length > 0
        )
        .map((player) => ({
          id: player.id,
          color: player.color,
          direction: player.direction,
          head: { x: player.snake[0].x, y: player.snake[0].y },
          snake: player.snake.map(({ x, y }) => ({ x, y })),
          isLocal: player.id === yourPlayerId
        }))
    : [];
  const obstacles = Array.isArray(state?.obstacles)
    ? state.obstacles.map(({ x, y, phase }) => ({ x, y, ...(phase ? { phase } : {}) }))
    : [];
  const foods = Array.isArray(state?.foods)
    ? state.foods.map(({ x, y, tier }) => ({ x, y, tier }))
    : [];

  return { gridSize, players, obstacles, foods };
}

export function getMinimapDirectionVector(direction) {
  return { ...(DIRECTION_VECTORS[direction] || DIRECTION_VECTORS.RIGHT) };
}

export function getMinimapPixelRatio(devicePixelRatio) {
  if (!Number.isFinite(devicePixelRatio)) {
    return 1;
  }
  return clamp(devicePixelRatio, 1, 2);
}

export function createMinimapRenderer(
  canvas,
  { devicePixelRatio = globalThis.window?.devicePixelRatio ?? 1 } = {}
) {
  if (!canvas) {
    throw new Error("Minimap canvas bulunamadi.");
  }

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Minimap 2B cizim baglami olusturulamadi.");
  }
  const pixelRatio = getMinimapPixelRatio(devicePixelRatio);

  function render(state, yourPlayerId = null) {
    const bounds = canvas.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (width <= 0 || height <= 0) {
      return;
    }

    const backingWidth = Math.round(width * pixelRatio);
    const backingHeight = Math.round(height * pixelRatio);
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawArena(context, width, height);

    const model = buildMinimapModel(state, yourPlayerId);
    const padding = Math.max(6, Math.min(width, height) * 0.06);
    const pointOptions = { gridSize: model.gridSize, width, height, padding };
    drawObstacles(context, model.obstacles, pointOptions);
    drawFoods(context, model.foods, pointOptions);
    drawPlayers(context, model.players, pointOptions);
  }

  return { render };
}

function drawArena(context, width, height) {
  context.fillStyle = "rgba(4, 9, 23, 0.9)";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(53, 246, 226, 0.34)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function drawObstacles(context, obstacles, pointOptions) {
  const cellSize = Math.min(
    (pointOptions.width - pointOptions.padding * 2) / pointOptions.gridSize,
    (pointOptions.height - pointOptions.padding * 2) / pointOptions.gridSize
  );
  const markerSize = clamp(cellSize * 0.92, 1.5, 4.5);
  for (const obstacle of obstacles) {
    context.fillStyle = getObstacleVisualIdentity(obstacle.phase).color;
    const point = gridPointToMinimap({ ...pointOptions, point: obstacle });
    context.fillRect(
      point.x - markerSize / 2,
      point.y - markerSize / 2,
      markerSize,
      markerSize
    );
  }
}

function drawFoods(context, foods, pointOptions) {
  const radius = clamp(Math.min(pointOptions.width, pointOptions.height) / 75, 1.5, 3);

  for (const food of foods) {
    const point = gridPointToMinimap({ ...pointOptions, point: food });
    const visual = getFoodVisualIdentity(food.tier);
    context.beginPath();
    if (visual.shape === "gold") {
      const diamondRadius = radius * 1.7;
      context.moveTo(point.x, point.y - diamondRadius);
      context.lineTo(point.x + diamondRadius, point.y);
      context.lineTo(point.x, point.y + diamondRadius);
      context.lineTo(point.x - diamondRadius, point.y);
      context.closePath();
    } else {
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    context.fillStyle = visual.color;
    context.fill();
    if (visual.shape === "gold") {
      context.strokeStyle = "#fff4b3";
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function drawPlayers(context, players, pointOptions) {
  const markerRadius = clamp(Math.min(pointOptions.width, pointOptions.height) / 28, 4, 7);
  const cellSize = Math.min(
    (pointOptions.width - pointOptions.padding * 2) / pointOptions.gridSize,
    (pointOptions.height - pointOptions.padding * 2) / pointOptions.gridSize
  );
  const bodyRadius = clamp(cellSize * 0.4, 1, 2.8);

  for (const player of players) {
    const playerColor = getPlayerVisualIdentity(player.color).color;
    context.save();
    context.fillStyle = playerColor;
    context.globalAlpha = player.isLocal ? 0.9 : 0.72;
    for (let index = player.snake.length - 1; index >= 1; index -= 1) {
      const segment = gridPointToMinimap({ ...pointOptions, point: player.snake[index] });
      context.beginPath();
      context.arc(segment.x, segment.y, bodyRadius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    const point = gridPointToMinimap({ ...pointOptions, point: player.head });
    const direction = getMinimapDirectionVector(player.direction);
    const perpendicular = { x: -direction.y, y: direction.x };
    const tip = {
      x: point.x + direction.x * markerRadius,
      y: point.y + direction.y * markerRadius
    };
    const back = {
      x: point.x - direction.x * markerRadius * 0.72,
      y: point.y - direction.y * markerRadius * 0.72
    };

    context.save();
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(
      back.x + perpendicular.x * markerRadius * 0.68,
      back.y + perpendicular.y * markerRadius * 0.68
    );
    context.lineTo(
      back.x - perpendicular.x * markerRadius * 0.68,
      back.y - perpendicular.y * markerRadius * 0.68
    );
    context.closePath();
    context.fillStyle = playerColor;
    context.shadowColor = context.fillStyle;
    context.shadowBlur = player.isLocal ? 12 : 6;
    context.fill();
    if (player.isLocal) {
      context.strokeStyle = "#efffff";
      context.lineWidth = 2;
      context.stroke();
    }
    context.restore();
  }
}

function normalizeGridSize(gridSize) {
  if (!Number.isFinite(gridSize)) {
    return DEFAULT_GRID_SIZE;
  }
  return Math.max(MIN_GRID_SIZE, Math.floor(gridSize));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function roundCoordinate(value) {
  return Number(value.toFixed(2));
}
