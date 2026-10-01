import * as THREE from "../../../vendor/three.module.js";
import {
  getAlignedCameraOffset,
  getCameraDistance,
  getDirectionRotation,
  getFollowCameraState,
  getPlayerLabelText,
  getRenderProfile,
  gridToWorld
} from "./sceneMath.js";
import {
  getFoodVisualIdentity,
  getObstacleVisualIdentity,
  getPlayerVisualIdentity
} from "./visualIdentity.js";

const ARENA_FLOOR_Y = 0;
const SNAKE_Y = 0.5;
const FOOD_Y = 0.55;

export function createScene3D(container) {
  if (!container) {
    throw new Error("3B sahne kapsayicisi bulunamadi.");
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const profile = getRenderProfile({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    reducedMotion
  });
  const renderer = new THREE.WebGLRenderer({
    antialias: profile.level !== "low",
    powerPreference: "high-performance"
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute("aria-label", "3B Yılan Meydanı oyun arenası");
  renderer.domElement.setAttribute("role", "img");
  container.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050713);
  scene.fog = new THREE.FogExp2(0x050713, 0.012);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
  const cameraLookTarget = new THREE.Vector3();
  const cameraGoalTarget = new THREE.Vector3();
  const cameraGoalPosition = new THREE.Vector3();
  const world = new THREE.Group();
  scene.add(world);

  const resources = createSharedResources(profile);

  const MAX_INSTANCES = 5000;
  const dummy = new THREE.Object3D();

  const instancedObstacles = {};
  for (const phase of ["stable", "warning", "preview"]) {
    const mesh = new THREE.InstancedMesh(resources.obstacleGeometry, resources.obstacleMaterials[phase], MAX_INSTANCES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = profile.shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    instancedObstacles[phase] = mesh;
    world.add(mesh);
  }

  const instancedFoodCores = {};
  const instancedFoodRings = {};
  const instancedFoodHalos = {}; // goldHalo and tier halos

  for (let tier = 1; tier <= 10; tier++) {
    const coreMat = resources.foodMaterials[tier] || resources.foodMaterials[1];
    const ringMat = resources.foodRingMaterials[tier] || resources.foodRingMaterials[1];

    const core = new THREE.InstancedMesh(resources.foodGeometry, coreMat, MAX_INSTANCES);
    core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    core.castShadow = profile.shadows;
    core.receiveShadow = true;
    core.frustumCulled = false;

    const ring = new THREE.InstancedMesh(resources.foodRingGeometry, ringMat, MAX_INSTANCES);
    ring.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ring.frustumCulled = false;

    const halo = new THREE.InstancedMesh(resources.foodRingGeometry, ringMat, MAX_INSTANCES);
    halo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halo.frustumCulled = false;

    core.count = 0;
    ring.count = 0;
    halo.count = 0;

    instancedFoodCores[tier] = core;
    instancedFoodRings[tier] = ring;
    instancedFoodHalos[tier] = halo;

    world.add(core, ring, halo);
  }

  const playerMeshes = new Map();

  let currentObstaclesData = [];
  let currentFoodsData = [];

  const floatingPopups = [];
  const shockwaves = [];
  let previousFoodPositions = null;
  let currentObstaclePositions = new Set();
  let arenaGroup = null;
  let gridSize = 16;
  let disposed = false;
  let cameraInitialized = false;
  let overviewRequested = false;
  let lastGameState = null;
  let lastYourPlayerId = null;

  addLighting(scene, profile);
  addStarField(scene, profile);
  rebuildArena(gridSize);
  resizeScene();

  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(container);
  window.addEventListener("orientationchange", resizeScene);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

  let lastTimeMs = performance.now();
  renderer.setAnimationLoop(animate);

  return {
    renderGameState,
    pause: () => renderer.setAnimationLoop(null),
    resume: () => { if (!disposed) renderer.setAnimationLoop(animate); },
    setOverviewRequested,
    resizeScene,
    disposeScene
  };

  function renderGameState(state, yourPlayerId = null) {
    if (!state || disposed) {
      return;
    }

    lastGameState = state;
    lastYourPlayerId = yourPlayerId;

    if (state.gridSize !== gridSize) {
      gridSize = state.gridSize;
      rebuildArena(gridSize);
      resizeScene();
    }

    syncObstacles(state.obstacles || []);
    syncFoods(state.foods || []);
    syncPlayers(state.players || [], yourPlayerId);
    updateCameraGoal();
  }

  function setOverviewRequested(requested) {
    overviewRequested = Boolean(requested);
    updateCameraGoal();
  }

  function syncObstacles(obstacles) {
    currentObstaclePositions = new Set(obstacles.map((o) => `${o.x},${o.y}`));
    currentObstaclesData = obstacles;
  }

  function syncFoods(foods) {
    currentFoodsData = foods;

    const currentFoodPositions = new Map();
    for (const food of foods) {
      if (food) {
        currentFoodPositions.set(`${food.x},${food.y}`, food.tier || 1);
      }
    }

    if (previousFoodPositions !== null) {
      for (const [key, tier] of previousFoodPositions.entries()) {
        if (!currentFoodPositions.has(key)) {
          const [gx, gy] = key.split(",").map(Number);
          spawnFloatingPopup(gx, gy, tier);
        }
      }
    }
    previousFoodPositions = currentFoodPositions;
  }

  const FOOD_POPUP_INFO = {
    1: { text: "+1", color: "#ff5e7e" },
    2: { text: "+2", color: "#ff8838" },
    3: { text: "+3", color: "#b388ff" },
    4: { text: "⚡ SPEED!", color: "#35f6e2" },
    5: { text: "🌟 GOLD +5", color: "#ffd700" },
    6: { text: "🛡️ SHIELD!", color: "#6cb0ff" },
    7: { text: "💥 MEGA +10", color: "#ffffff" }
  };

  function spawnFloatingPopup(gridX, gridY, tier) {
    if (!profile.animate) {
      return;
    }
    const pos = gridToWorld({ x: gridX, y: gridY }, gridSize);
    const texture = resources.popupTextures[tier] || resources.popupTextures[1];

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(pos.x, 1.0, pos.z);
    sprite.scale.set(4.8, 1.2, 1);
    scene.add(sprite);

    floatingPopups.push({ sprite, material, age: 0 });
  }

  function spawnCollisionFx(worldX, worldZ, isObstacle) {
    if (!profile.animate) {
      return;
    }
    const textureKey = isObstacle ? "crash_obstacle" : "crash_rival";
    const texture = resources.popupTextures[textureKey] || resources.popupTextures["crash_rival"];

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1,
      depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(worldX, 1.2, worldZ);
    sprite.scale.set(5.2, 1.3, 1);
    scene.add(sprite);

    floatingPopups.push({ sprite, material, age: 0 });

    const ringMat = new THREE.MeshBasicMaterial({
      color: isObstacle ? 0xff2e55 : 0xff4757,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(resources.shockwaveGeometry, ringMat);
    ringMesh.position.set(worldX, 0.15, worldZ);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.scale.set(0.2, 0.2, 0.2);
    world.add(ringMesh);

    shockwaves.push({ mesh: ringMesh, material: ringMat, age: 0 });
  }

  function syncPlayers(players, yourPlayerId) {
    const activePlayerIds = new Set(players.map((player) => player.id));
    for (const [playerId, entry] of playerMeshes.entries()) {
      if (!activePlayerIds.has(playerId)) {
        world.remove(entry.group);
        disposePlayerEntry(entry);
        playerMeshes.delete(playerId);
      }
    }

    for (const player of players) {
      let entry = playerMeshes.get(player.id);
      if (!entry) {
        entry = createPlayerEntry(player.color);
        playerMeshes.set(player.id, entry);
        world.add(entry.group);
      }

      if (!entry.userData) {
        entry.userData = {};
      }
      const wasAlive = entry.userData.isAlive ?? true;
      updatePlayerLabel(entry, player.name, player.id === yourPlayerId);

      if (!player.isAlive) {
        if (wasAlive && entry.userData.lastHeadPoint) {
          const headPoint = entry.userData.lastHeadPoint;
          const worldPos = gridToWorld(headPoint, gridSize);
          const isObstacleHit = currentObstaclePositions.has(`${headPoint.x},${headPoint.y}`);
          spawnCollisionFx(worldPos.x, worldPos.z, isObstacleHit);
          entry.userData.deathTime = performance.now();
        }
        entry.userData.isAlive = false;
        continue;
      }

      entry.group.visible = true;
      entry.userData.isAlive = true;
      entry.userData.deathTime = null;
      entry.userData.ghostUntil = player.ghostUntil;
      entry.userData.frozenUntil = player.frozenUntil;
      entry.userData.color = player.color;
      entry.userData.shieldRecovery = player.shieldRecoveryMsLeft > 0;
      if (player.snake && player.snake.length > 0) {
        entry.userData.lastHeadPoint = { x: player.snake[0].x, y: player.snake[0].y };
      }

      while (entry.segments.length < player.snake.length) {
        const segment = createSnakeSegment(entry.material);
        entry.segments.push(segment);
        entry.group.add(segment);
      }

      for (let index = 0; index < entry.segments.length; index += 1) {
        const segment = entry.segments[index];
        const point = player.snake[index];
        segment.visible = Boolean(point);
        if (!point) {
          continue;
        }

        const worldPoint = gridToWorld(point, gridSize);
        const target = segment.userData.target;
        target.set(worldPoint.x, SNAKE_Y, worldPoint.z);
        if (!segment.userData.placed || segment.position.distanceTo(target) > gridSize / 2) {
          segment.position.copy(target);
          segment.userData.placed = true;
        }

        const isHead = index === 0;
        segment.userData.isHead = isHead;
        segment.children[1].visible = isHead;
        segment.children[2].visible = isHead;
        segment.children[3].visible =
          isHead && (player.shieldCharges > 0 || player.shieldRecoveryMsLeft > 0);
        segment.userData.shieldRecovery = isHead && player.shieldRecoveryMsLeft > 0;
        segment.children[4].visible =
          isHead && (player.boostMsLeft > 0 || player.manualBoostActive);
        segment.children[5].visible = isHead && player.id === yourPlayerId;
        segment.children[6].visible = Boolean(isHead && player.magnetUntil && Date.now() < player.magnetUntil);

        const visibilityScale = gridSize >= 96 ? 1.35 : gridSize >= 48 ? 1.18 : 1;
        segment.scale.setScalar((isHead ? 1.12 : 1) * visibilityScale);
        segment.rotation.y = isHead ? getDirectionRotation(player.direction) : 0;

        if (isHead) {
          entry.label.userData.target.set(worldPoint.x, SNAKE_Y + 1.25, worldPoint.z);
          if (!entry.label.userData.placed) {
            entry.label.position.copy(entry.label.userData.target);
            entry.label.userData.placed = true;
          }
        }
      }
    }
  }

  function createPlayerEntry(colorClass) {
    const color = getPlayerVisualIdentity(colorClass).color;
    const group = new THREE.Group();
    const labelMaterial = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0.56,
      depthTest: false,
      depthWrite: false
    });
    const label = new THREE.Sprite(labelMaterial);
    label.renderOrder = 20;
    label.userData.target = new THREE.Vector3();
    label.userData.placed = false;
    label.userData.text = null;
    group.add(label);
    return {
      group,
      material: new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.42,
        roughness: 0.32,
        metalness: 0.2,
        transparent: true
      }),
      segments: [],
      label,
      userData: {}
    };
  }

  function updatePlayerLabel(entry, name, isLocal) {
    const labelText = getPlayerLabelText(name);
    entry.label.material.opacity = isLocal ? 0.66 : 0.48;
    if (entry.label.userData.text === labelText) {
      return;
    }

    entry.label.material.map?.dispose();
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) {
      entry.label.visible = false;
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "700 54px Trebuchet MS, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.shadowColor = "rgba(0, 0, 0, 0.9)";
    context.shadowBlur = 14;
    context.lineWidth = 8;
    context.strokeStyle = "rgba(2, 7, 18, 0.82)";
    context.strokeText(labelText, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "#f4fbff";
    context.fillText(labelText, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    entry.label.material.map = texture;
    entry.label.material.needsUpdate = true;
    entry.label.scale.set(Math.min(6, Math.max(2.7, labelText.length * 0.3)), 0.75, 1);
    entry.label.userData.text = labelText;
    entry.label.visible = true;
  }

  function disposePlayerEntry(entry) {
    entry.label.material.map?.dispose();
    entry.label.material.dispose();
    entry.material.dispose();
  }

  function createSnakeSegment(material) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(resources.snakeGeometry, material);
    body.castShadow = profile.shadows;
    body.receiveShadow = true;
    group.add(body);

    const leftEye = createEye(-0.18);
    const rightEye = createEye(0.18);
    const shield = new THREE.Mesh(resources.shieldGeometry, resources.shieldMaterial);
    const boost = new THREE.Mesh(resources.boostGeometry, resources.boostMaterial);
    const playerMarker = new THREE.Mesh(resources.markerGeometry, resources.markerMaterial);
    const magnetHalo = new THREE.Mesh(resources.magnetGeometry, resources.magnetMaterial);
    shield.rotation.x = Math.PI / 2;
    shield.position.y = -0.02;
    boost.rotation.x = Math.PI / 2;
    boost.position.y = -0.38;
    playerMarker.rotation.x = Math.PI / 2;
    playerMarker.position.y = -0.43;
    magnetHalo.rotation.x = Math.PI / 2;
    magnetHalo.position.y = 0.05;

    group.add(leftEye, rightEye, shield, boost, playerMarker, magnetHalo);
    group.userData.target = new THREE.Vector3();
    group.userData.placed = false;
    return group;
  }

  function createEye(x) {
    const eye = new THREE.Mesh(resources.eyeGeometry, resources.eyeMaterial);
    eye.position.set(x, 0.16, 0.35);
    return eye;
  }



  function rebuildArena(nextGridSize) {
    if (arenaGroup) {
      world.remove(arenaGroup);
      disposeObjectResources(arenaGroup);
    }

    arenaGroup = new THREE.Group();
    const floorGeometry = new THREE.PlaneGeometry(nextGridSize + 1, nextGridSize + 1);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x080d20,
      roughness: 0.72,
      metalness: 0.42
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = ARENA_FLOOR_Y;
    floor.receiveShadow = true;
    arenaGroup.add(floor);

    const grid = new THREE.GridHelper(nextGridSize, nextGridSize, 0x49ffe1, 0x183a58);
    grid.position.y = 0.015;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) {
      material.transparent = true;
      material.opacity = nextGridSize > 80 ? 0.22 : 0.42;
    }
    arenaGroup.add(grid);

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0x19335d,
      emissive: 0x148fb0,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.74
    });
    const horizontalEdge = new THREE.BoxGeometry(nextGridSize + 1.2, 0.34, 0.24);
    const verticalEdge = new THREE.BoxGeometry(0.24, 0.34, nextGridSize + 1.2);
    const half = nextGridSize / 2 + 0.5;
    const top = new THREE.Mesh(horizontalEdge, edgeMaterial);
    const bottom = new THREE.Mesh(horizontalEdge, edgeMaterial);
    const left = new THREE.Mesh(verticalEdge, edgeMaterial);
    const right = new THREE.Mesh(verticalEdge, edgeMaterial);
    top.position.set(0, 0.17, -half);
    bottom.position.set(0, 0.17, half);
    left.position.set(-half, 0.17, 0);
    right.position.set(half, 0.17, 0);
    arenaGroup.add(top, bottom, left, right);
    world.add(arenaGroup);
  }

  function resizeScene() {
    if (disposed) {
      return;
    }
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    updateCameraGoal(!cameraInitialized);
    scene.fog.density = 0.22 / Math.max(gridSize, 20);
  }

  function updateCameraGoal(immediate = false) {
    if (disposed) {
      return;
    }

    const player = lastGameState?.players?.find((candidate) => candidate.id === lastYourPlayerId);

    let isVisuallyAlive = player?.isAlive;
    if (player && !player.isAlive) {
      const entry = playerMeshes.get(player.id);
      if (entry && entry.userData.deathTime && (performance.now() - entry.userData.deathTime < 1000)) {
        isVisuallyAlive = true;
      }
    }

    const cameraState = getFollowCameraState({
      player: player ? { ...player, isAlive: isVisuallyAlive } : null,
      gridSize,
      aspectRatio: camera.aspect || 1,
      overviewRequested
    });
    const { distance, target } = cameraState;
    const cameraOffset = getAlignedCameraOffset(distance);
    cameraGoalTarget.set(target.x, 0, target.z);
    cameraGoalPosition.set(
      target.x + cameraOffset.x,
      cameraOffset.y,
      target.z + cameraOffset.z
    );

    const wrappedAcrossArena = cameraLookTarget.distanceTo(cameraGoalTarget) > gridSize * 0.45;
    if (immediate || !cameraInitialized || wrappedAcrossArena || !profile.animate) {
      cameraLookTarget.copy(cameraGoalTarget);
      camera.position.copy(cameraGoalPosition);
      cameraInitialized = true;
    }

    camera.near = Math.max(0.1, distance / 150);
    camera.far = getCameraDistance(gridSize, camera.aspect || 1) * 6;
    camera.updateProjectionMatrix();
  }

  function animate(timeMs = 0) {
    if (disposed) {
      return;
    }
    const now = performance.now();
    const dt = Math.max(0.001, Math.min((now - lastTimeMs) / 1000, 0.1));
    lastTimeMs = now;
    const elapsed = now / 1000;
    const timeScale = dt * 60;

    const segmentBlend = profile.animate ? Math.min(1, 0.16 * timeScale) : 1;
    const lookBlend = profile.animate ? Math.min(1, 0.07 * timeScale) : 1;
    const posBlend = profile.animate ? Math.min(1, 0.035 * timeScale) : 1;
    cameraLookTarget.lerp(cameraGoalTarget, lookBlend);
    camera.position.lerp(cameraGoalPosition, posBlend);
    camera.lookAt(cameraLookTarget);

    for (const entry of playerMeshes.values()) {
      if (!entry.userData.isAlive && entry.userData.deathTime) {
        if (now - entry.userData.deathTime < 1000) {
          entry.group.visible = Math.floor(now / 100) % 2 === 0;
        } else {
          entry.group.visible = false;
        }
      } else if (entry.userData.isAlive) {
        const isGhost = entry.userData.ghostUntil && Date.now() < entry.userData.ghostUntil;
        const isFrozen = entry.userData.frozenUntil && Date.now() < entry.userData.frozenUntil;

        entry.material.opacity = isGhost ? 0.25 : 1.0;
        entry.material.transparent = true;

        if (isFrozen) {
          entry.material.emissive.setHex(0x00ffff);
          entry.material.emissiveIntensity = 1.0;
        } else {
          const baseColor = getPlayerVisualIdentity(entry.userData.color || "p1").color;
          entry.material.emissive.set(baseColor);
          entry.material.emissiveIntensity = 0.42;
        }
      }

      for (const segment of entry.segments) {
        if (segment.visible) {
          segment.position.lerp(segment.userData.target, segmentBlend);
          if (segment.userData.isHead) {
            segment.children[3].rotation.z = elapsed * 1.4;
            segment.children[3].scale.setScalar(
              segment.userData.shieldRecovery ? 1.15 + Math.sin(elapsed * 18) * 0.18 : 1
            );
            segment.children[4].rotation.z = -elapsed * 2.6;
            segment.children[6].rotation.z = elapsed * 3;
            segment.children[6].scale.setScalar(1.2 + Math.sin(elapsed * 12) * 0.1);
            segment.children[5].rotation.z = elapsed * 0.8;
          }
        }
      }
      if (entry.label.visible) {
        entry.label.position.lerp(entry.label.userData.target, segmentBlend);
      }
    }

    const obstacleCounts = { stable: 0, warning: 0, preview: 0 };
    for (let index = 0; index < currentObstaclesData.length; index += 1) {
      const obstacleData = currentObstaclesData[index];
      if (!obstacleData) continue;

      const phase = obstacleData.phase || "stable";
      const count = obstacleCounts[phase];
      if (count >= MAX_INSTANCES) continue;

      const pos = gridToWorld(obstacleData, gridSize);
      const warningPulse = (phase !== "stable") && profile.animate
          ? 1 + Math.sin(elapsed * 10 + index * 0.35) * 0.12
          : 1;

      dummy.position.set(pos.x, 0.42, pos.z);
      dummy.scale.setScalar(warningPulse);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      instancedObstacles[phase].setMatrixAt(count, dummy.matrix);
      obstacleCounts[phase]++;
    }

    for (const phase of ["stable", "warning", "preview"]) {
      instancedObstacles[phase].count = obstacleCounts[phase];
      instancedObstacles[phase].instanceMatrix.needsUpdate = true;
    }

    const foodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
    for (let index = 0; index < currentFoodsData.length; index += 1) {
      const foodData = currentFoodsData[index];
      if (!foodData) continue;

      const tier = Number.isFinite(foodData.tier) ? foodData.tier : 1;
      const count = foodCounts[tier];
      if (count >= MAX_INSTANCES) continue;

      const visual = getFoodVisualIdentity(tier);
      const pos = gridToWorld(foodData, gridSize);

      const expiring = Number.isFinite(foodData.expiresInMs) && foodData.expiresInMs <= 3_000;
      const pulseSpeed = expiring ? 8 : 2.2;
      const pulseAmount = expiring ? 0.18 : 0.06;
      const pulse = 1 + Math.sin(elapsed * pulseSpeed + index) * pulseAmount;
      const arenaScale = gridSize >= 96 ? 1.35 : gridSize >= 48 ? 1.18 : 1;
      const baseScale = arenaScale * visual.scale;
      const finalScale = baseScale * (profile.animate ? pulse : 1);

      const rotY = profile.animate ? elapsed * 0.7 : 0;
      const posY = FOOD_Y + (profile.animate ? Math.sin(elapsed * 2 + index) * 0.08 : 0);

      // Core
      dummy.position.set(pos.x, posY, pos.z);
      dummy.scale.setScalar(finalScale);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      instancedFoodCores[tier].setMatrixAt(count, dummy.matrix);

      // Ring (Tilted flat)
      dummy.rotation.set(Math.PI / 2, rotY, 0, 'YXZ');
      dummy.updateMatrix();
      instancedFoodRings[tier].setMatrixAt(count, dummy.matrix);

      // Halo (optional, we set scale to 0 if no halo)
      if (visual.hasHalo) {
        dummy.scale.setScalar(finalScale * 1.16);
        dummy.rotation.set(0, rotY + Math.PI / 2, 0);
        dummy.updateMatrix();
        instancedFoodHalos[tier].setMatrixAt(count, dummy.matrix);
      } else {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        instancedFoodHalos[tier].setMatrixAt(count, dummy.matrix);
      }

      foodCounts[tier]++;
    }

    for (let tier = 1; tier <= 10; tier++) {
      instancedFoodCores[tier].count = foodCounts[tier];
      instancedFoodCores[tier].instanceMatrix.needsUpdate = true;
      instancedFoodRings[tier].count = foodCounts[tier];
      instancedFoodRings[tier].instanceMatrix.needsUpdate = true;
      instancedFoodHalos[tier].count = foodCounts[tier];
      instancedFoodHalos[tier].instanceMatrix.needsUpdate = true;
    }

    for (let i = floatingPopups.length - 1; i >= 0; i -= 1) {
      const popup = floatingPopups[i];
      popup.age += dt;
      popup.sprite.position.y += dt * 2.8;
      popup.material.opacity = popup.age > 0.6 ? Math.max(0, 1 - (popup.age - 0.6) / 0.4) : 1;
      if (popup.age >= 1.0) {
        scene.remove(popup.sprite);
        popup.material.dispose();
        floatingPopups.splice(i, 1);
      }
    }

    for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
      const sw = shockwaves[i];
      sw.age += dt;
      const progress = sw.age / 0.55;
      const s = 0.3 + progress * 3.8;
      sw.mesh.scale.set(s, s, s);
      sw.material.opacity = Math.max(0, 1 - progress);
      if (sw.age >= 0.55) {
        world.remove(sw.mesh);
        sw.material.dispose();
        shockwaves.splice(i, 1);
      }
    }



    renderer.render(scene, camera);
  }

  function handleContextLost(event) {
    event.preventDefault();
    container.classList.add("scene-context-lost");
  }

  function handleContextRestored() {
    container.classList.remove("scene-context-lost");
  }

  function disposeScene() {
    if (disposed) {
      return;
    }
    disposed = true;
    renderer.setAnimationLoop(null);
    resizeObserver.disconnect();
    window.removeEventListener("orientationchange", resizeScene);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
    scene.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
      }
    });
    for (const entry of playerMeshes.values()) {
      disposePlayerEntry(entry);
    }
    for (const popup of floatingPopups) {
      scene.remove(popup.sprite);
      popup.material.dispose();
    }
    floatingPopups.length = 0;
    for (const sw of shockwaves) {
      world.remove(sw.mesh);
      sw.material.dispose();
    }
    shockwaves.length = 0;
    for (const texture of Object.values(resources.popupTextures)) {
      texture.dispose();
    }
    renderer.dispose();
  }
}

function createSharedResources(profile) {
  const popupTextures = {};
  const FOOD_POPUP_INFO = {
    1: { text: "+1 SCORE", color: "#ff5e7e" },
    2: { text: "+2 SCORE", color: "#ff8838" },
    3: { text: "+3 SCORE", color: "#b388ff" },
    4: { text: "⚡ SPEED BOOST", color: "#35f6e2" },
    5: { text: "🌟 GOLD +5", color: "#ffd700" },
    6: { text: "☠️ POISON -2", color: "#ff4d4d" },
    7: { text: "🛡️ SHIELD CHARGE", color: "#45a9ff" },
    8: { text: "👻 GHOST MODE", color: "#4aff87" },
    9: { text: "❄️ FREEZE", color: "#0088ff" },
    10: { text: "🧲 MAGNET", color: "#ff00ff" }
  };

  for (let tier = 1; tier <= 10; tier += 1) {
    const info = FOOD_POPUP_INFO[tier];
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");

    ctx.font = "900 44px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.strokeText(info.text, 256, 64);
    ctx.fillStyle = info.color;
    ctx.shadowColor = info.color;
    ctx.shadowBlur = 14;
    ctx.fillText(info.text, 256, 64);

    popupTextures[tier] = new THREE.CanvasTexture(canvas);
  }

  function createTextTexture(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.font = "900 40px 'Segoe UI', system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.95)";
    ctx.strokeText(text, 256, 64);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(canvas);
  }

  popupTextures["crash_obstacle"] = createTextTexture("💥 ENGELE ÇARPTI!", "#ff2e55");
  popupTextures["crash_rival"] = createTextTexture("💥 YILAN ÇARPIŞMASI!", "#ff4757");

  const shockwaveGeometry = new THREE.RingGeometry(0.6, 1.2, 32);

  const foodMaterials = {};
  const foodRingMaterials = {};
  for (let tier = 1; tier <= 10; tier += 1) {
    const visual = getFoodVisualIdentity(tier);
    const color = visual.color;
    foodMaterials[tier] = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: tier === 7 ? 1.8 : 1.3,
      roughness: 0.22,
      metalness: 0.42
    });
    foodRingMaterials[tier] = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x07101c, roughness: 0.18 });
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x9cecff,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const boostMaterial = new THREE.MeshBasicMaterial({
    color: 0x4dffe0,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const magnetMaterial = new THREE.MeshBasicMaterial({
    color: 0xff00ff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const stableObstacle = getObstacleVisualIdentity("stable");
  const warningObstacle = getObstacleVisualIdentity("warning");
  const previewObstacle = getObstacleVisualIdentity("preview");
  const obstacleMaterials = {
    stable: new THREE.MeshStandardMaterial({
      color: stableObstacle.surfaceColor,
      emissive: stableObstacle.color,
      emissiveIntensity: 0.34,
      roughness: 0.36,
      metalness: 0.72
    }),
    warning: new THREE.MeshStandardMaterial({
      color: warningObstacle.surfaceColor,
      emissive: warningObstacle.color,
      emissiveIntensity: 1.1,
      roughness: 0.32,
      metalness: 0.64
    }),
    preview: new THREE.MeshStandardMaterial({
      color: previewObstacle.surfaceColor,
      emissive: previewObstacle.color,
      emissiveIntensity: 1.15,
      roughness: 0.32,
      metalness: 0.64
    })
  };

  return {
    popupTextures,
    shockwaveGeometry,
    snakeGeometry: new THREE.SphereGeometry(0.42, profile.radialSegments, profile.radialSegments),
    eyeGeometry: new THREE.SphereGeometry(0.075, 8, 8),
    foodGeometry: new THREE.IcosahedronGeometry(0.38, profile.level === "high" ? 1 : 0),
    foodRingGeometry: new THREE.TorusGeometry(0.55, 0.025, 6, 20),
    obstacleGeometry: new THREE.BoxGeometry(0.86, 0.84, 0.86),
    shieldGeometry: new THREE.TorusGeometry(0.62, 0.035, 8, 28),
    boostGeometry: new THREE.TorusGeometry(0.52, 0.055, 8, 20),
    markerGeometry: new THREE.RingGeometry(0.54, 0.61, 28),
    magnetGeometry: new THREE.TorusGeometry(0.7, 0.05, 8, 24),
    magnetGeometry: new THREE.TorusGeometry(0.7, 0.05, 8, 24),
    eyeMaterial,
    shieldMaterial,
    boostMaterial,
    markerMaterial,
    magnetMaterial,
    obstacleMaterials,
    foodMaterials,
    foodRingMaterials,
    materials: [
      eyeMaterial,
      shieldMaterial,
      boostMaterial,
      markerMaterial,
      magnetMaterial,
      ...Object.values(obstacleMaterials),
      ...Object.values(foodMaterials),
      ...Object.values(foodRingMaterials),
      ...Object.values(popupTextures)
    ]
  };
}

function addLighting(scene, profile) {
  const hemisphere = new THREE.HemisphereLight(0xb8ddff, 0x0b1026, 2.15);
  const keyLight = new THREE.DirectionalLight(0xdceaff, 2.2);
  keyLight.position.set(-14, 24, 16);
  keyLight.castShadow = profile.shadows;
  if (profile.shadows) {
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -40;
    keyLight.shadow.camera.right = 40;
    keyLight.shadow.camera.top = 40;
    keyLight.shadow.camera.bottom = -40;
  }
  const cyanLight = new THREE.PointLight(0x24e6d2, 18, 70, 2);
  cyanLight.position.set(-14, 7, -10);
  const magentaLight = new THREE.PointLight(0xe944ff, 14, 65, 2);
  magentaLight.position.set(16, 6, 12);
  scene.add(hemisphere, keyLight, cyanLight, magentaLight);
}

function addStarField(scene, profile) {
  const count = profile.level === "low" ? 80 : 180;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    const radius = 28 + (index % 31) * 1.8;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 8 + (index % 19) * 1.7;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x7bcfff,
    size: 0.13,
    transparent: true,
    opacity: 0.55,
    depthWrite: false
  });
  scene.add(new THREE.Points(geometry, material));
}

function disposeObjectResources(object) {
  const geometries = new Set();
  const materials = new Set();
  object.traverse((child) => {
    if (child.geometry) {
      geometries.add(child.geometry);
    }
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      if (material) {
        materials.add(material);
      }
    }
  });
  for (const geometry of geometries) {
    geometry.dispose();
  }
  for (const material of materials) {
    material.dispose();
  }
}
