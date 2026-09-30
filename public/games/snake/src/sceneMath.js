export function gridToWorld(point, gridSize) {
  const offset = (gridSize - 1) / 2;
  return {
    x: point.x - offset,
    z: point.y - offset
  };
}

export function getCameraDistance(gridSize, aspectRatio = 1) {
  if (aspectRatio < 0.8) {
    return gridSize * 1.7;
  }
  if (aspectRatio < 1.2) {
    return gridSize * 1.32;
  }
  return gridSize * 1.14;
}

export function getAlignedCameraOffset(distance) {
  return {
    x: 0,
    y: Number((distance * 0.88).toFixed(2)),
    z: Number((distance * 0.88).toFixed(2))
  };
}

export function getFollowCameraDistance(viewCells, aspectRatio = 1) {
  const portraitCompensation = 1 / Math.min(Math.max(aspectRatio, 0.5), 1);
  return Number((viewCells * 1.12 * portraitCompensation).toFixed(2));
}

const DIRECTION_VECTORS = {
  UP: { x: 0, z: -1 },
  DOWN: { x: 0, z: 1 },
  LEFT: { x: -1, z: 0 },
  RIGHT: { x: 1, z: 0 }
};

export function getFollowCameraState({
  player,
  gridSize,
  aspectRatio = 1,
  overviewRequested = false
}) {
  if (
    overviewRequested ||
    !player?.isAlive ||
    !Array.isArray(player.snake) ||
    player.snake.length === 0
  ) {
    return {
      mode: "overview",
      target: { x: 0, z: 0 },
      distance: getCameraDistance(gridSize, aspectRatio),
      viewCells: gridSize
    };
  }

  const isBoosted = player.boostMsLeft > 0 || player.manualBoostActive;
  const viewCells = Math.min(gridSize, isBoosted ? 32 : 24);
  const sample = player.snake.slice(0, 3);
  const center = sample.reduce(
    (result, point) => {
      const world = gridToWorld(point, gridSize);
      return { x: result.x + world.x, z: result.z + world.z };
    },
    { x: 0, z: 0 }
  );
  center.x /= sample.length;
  center.z /= sample.length;

  const direction = DIRECTION_VECTORS[player.direction] || DIRECTION_VECTORS.RIGHT;
  const leadDistance = viewCells / 20;
  const limit = Math.max(0, gridSize / 2 - viewCells / 4);
  const target = {
    x: clamp(center.x + direction.x * leadDistance, -limit, limit),
    z: clamp(center.z + direction.z * leadDistance, -limit, limit)
  };

  return {
    mode: "follow",
    target,
    distance: getFollowCameraDistance(viewCells, aspectRatio),
    viewCells
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const DIRECTION_ROTATIONS = {
  DOWN: 0,
  RIGHT: Math.PI / 2,
  UP: Math.PI,
  LEFT: -Math.PI / 2
};

export function getDirectionRotation(direction) {
  return DIRECTION_ROTATIONS[direction] ?? 0;
}

export function shouldHandleOverviewKey(event) {
  if (event?.code !== "Space") {
    return false;
  }

  const target = event.target;
  const tagName = target?.tagName?.toUpperCase();
  const isFormControl = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tagName);
  return !isFormControl && !target?.isContentEditable;
}

export function shouldHandleManualBoostKey(event) {
  if (!["ShiftLeft", "ShiftRight"].includes(event?.code)) {
    return false;
  }

  return shouldHandleGameplayKey(event);
}

export function shouldHandleGameplayKey(event) {
  const target = event.target;
  const tagName = target?.tagName?.toUpperCase();
  const isFormControl = ["INPUT", "TEXTAREA", "SELECT"].includes(tagName);
  return !isFormControl && !target?.isContentEditable;
}

export function getPlayerLabelText(name) {
  return String(name ?? "").trim().slice(0, 20) || "Player";
}

export function getRenderProfile({
  width,
  hardwareConcurrency = 4,
  reducedMotion = false
}) {
  if (hardwareConcurrency <= 2) {
    return {
      level: "low",
      shadows: false,
      maxPixelRatio: 1,
      radialSegments: 8,
      animate: !reducedMotion
    };
  }

  if (width < 720 || hardwareConcurrency < 8) {
    return {
      level: "balanced",
      shadows: false,
      maxPixelRatio: 1.5,
      radialSegments: 12,
      animate: !reducedMotion
    };
  }

  return {
    level: "high",
    shadows: true,
    maxPixelRatio: 1.75,
    radialSegments: 16,
    animate: !reducedMotion
  };
}
