/* ==========================================================================
   مغزدانه — scene3d.js (Phase 6 Minimalist Luxury 3D Studio & Closed-to-Kernel Choreography)
   - کارگردانی سینمایی یک‌پارچه از «پسته بسته» (۰٪) ← «خندانی طبیعی» (۳۵٪) ←
     «جدایی پوسته‌ها» (۷۰٪) ← «مغز خالص زمردی» (۱۰۰٪)
   - نورپردازی گالری مینیمال (Cycles Softbox PMREM + نور کلیدی گرم + ریم زمردی)
   - پس‌زمینه تمیز و آرام با هاله نوری ملایم و ذرات بسیار ظریف (بدون شلوغی و حلقه‌های اضافی)
   - پشتیبانی از اسکرول پیوسته + اسلایدر مستقیم تبدیل (بسته ← مغز) + درگ ۳۶۰ درجه
   ========================================================================== */

import * as THREE from './three.module.js';
import {
  createPistachioAssembly,
  createSoftBokehTexture,
  PISTACHIO_VARIETIES,
} from './pistachio-model.js?v=7';

function detectSoftwareGl() {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/* ---------- Soft Gallery Studio PMREM Softboxes ---------- */
function buildStudioEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color('#060b08');

  const topStrip = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.25, 1.95), side: THREE.DoubleSide })
  );
  topStrip.position.set(0, 9.5, 2.8);
  topStrip.rotation.x = Math.PI / 2;
  envScene.add(topStrip);

  const keyBox = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.85, 1.38), side: THREE.DoubleSide })
  );
  keyBox.position.set(8.8, 3.6, 6.2);
  keyBox.lookAt(0, 0, 0);
  envScene.add(keyBox);

  const rimBox = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 11),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 1.38, 1.16), side: THREE.DoubleSide })
  );
  rimBox.position.set(-9.2, 2.0, -5.0);
  rimBox.lookAt(0, 0, 0);
  envScene.add(rimBox);

  const floorFill = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.28, 0.27, 0.22), side: THREE.DoubleSide })
  );
  floorFill.position.set(0, -7, 0);
  floorFill.rotation.x = -Math.PI / 2;
  envScene.add(floorFill);

  const envRT = pmrem.fromScene(envScene, 0.032);
  pmrem.dispose();
  envScene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return envRT.texture;
}

export function createPistachioStage(canvas, options = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSoftwareGl = detectSoftwareGl();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSoftwareGl,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const initW = Math.max(1, window.innerWidth || 1280);
  const initH = Math.max(1, window.innerHeight || 800);
  renderer.setSize(initW, initH, false);

  const scene = new THREE.Scene();
  scene.environment = buildStudioEnv(renderer);

  const camera = new THREE.PerspectiveCamera(32, initW / initH, 0.1, 80);
  camera.position.set(0, 0.15, 6.8);

  /* ---------- Refined 3-Point Minimalist Macro Photography Lighting ---------- */
  const hemi = new THREE.HemisphereLight(0xf0f6ee, 0x141b16, 0.78);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff4e0, 2.55);
  keyLight.position.set(4.6, 5.8, 6.0);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.camera.left = -3.4;
    keyLight.shadow.camera.right = 3.4;
    keyLight.shadow.camera.top = 3.4;
    keyLight.shadow.camera.bottom = -3.4;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  // Warm champagne-ivory edge rim light so bone-ivory shells look authentically creamy (zero green tint!)
  const rimLight = new THREE.DirectionalLight(0xf6e6c4, 1.35);
  rimLight.position.set(-5.6, 2.4, -4.5);
  scene.add(rimLight);

  // Gentle warm studio floor bounce
  const warmFill = new THREE.PointLight(0xeec878, 1.10, 16, 1.6);
  warmFill.position.set(-1.5, -2.5, 3.6);
  scene.add(warmFill);

  /* ---------- Quiet Luxury Dark Gallery Backdrop (Zero noisy rings!) ---------- */
  const bgUniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(initW, initH) },
    uFocus: { value: new THREE.Vector2(0.32, 0.52) },
    uWarmth: { value: 0.0 },
  };
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: bgUniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: `void main() { gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `
        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uFocus;
        uniform float uWarmth;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

        void main() {
          vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          vec2 d = (uv - uFocus) * vec2(min(aspect, 1.65), 1.0);
          float dist = length(d);

          // Ultra-quiet deep obsidian studio cyclorama
          vec3 outerDark = vec3(0.022, 0.039, 0.029); // #060a07
          vec3 emeraldLight = vec3(0.072, 0.142, 0.098);
          vec3 saffronLight = vec3(0.155, 0.116, 0.048);
          vec3 poolColor = mix(emeraldLight, saffronLight, uWarmth);

          float spot = exp(-dist * dist * 3.4);
          vec3 col = mix(outerDark, poolColor, spot * 0.85);

          // Fine cinema film grain (zero dark banding)
          col += (hash(gl_FragCoord.xy + fract(uTime) * 60.0) - 0.5) * 0.014;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  /* ---------- Singular Sculpted Hero Pistachio ---------- */
  const assembly = createPistachioAssembly(renderer, isSoftwareGl);
  scene.add(assembly.root);

  /* ---------- Whisper-Subtle Ambient Dust Motes (Restrained, luxury!) ---------- */
  const bokehTex = createSoftBokehTexture();
  const dustCount = isSoftwareGl ? 22 : 42;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 1.9 + Math.random() * 3.8;
    const theta = Math.random() * Math.PI * 2;
    dustPos[i * 3] = Math.cos(theta) * r;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 4.4;
    dustPos[i * 3 + 2] = Math.sin(theta) * r * 0.65 - 0.8;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: bokehTex,
    color: new THREE.Color('#efd080'),
    size: 0.075,
    transparent: true,
    opacity: 0.36,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustField = new THREE.Points(dustGeo, dustMat);
  scene.add(dustField);

  /* ---------- State ---------- */
  const state = {
    pointerX: 0,
    pointerY: 0,
    smoothPX: 0,
    smoothPY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
    dragY: 0,
    dragX: 0,
    targetDragY: 0,
    targetDragX: 0,
    scrollT: 0,
    manualStage: null, // null = scroll drives closed->kernel transformation; number = scrubber override
    smoothStage: 0.02, // Starts CLOSED at the top of the page!
    smoothScrollT: 0,
    smoothWarmth: 0.05,
    smoothRootX: -1.45,
    smoothRootY: 0.04,
    variety: 'akbari',
  };

  function isInteractiveTarget(el) {
    if (!el || !el.closest) return false;
    return Boolean(el.closest('a, button, input, select, textarea, label, .site-header, .minimal-dock, .storefront-shell'));
  }

  function onPointerDown(e) {
    if (isInteractiveTarget(e.target)) return;
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  }
  function onPointerMove(e) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    state.pointerX = THREE.MathUtils.clamp((e.clientX / w - 0.5) * 2, -1, 1);
    state.pointerY = THREE.MathUtils.clamp((e.clientY / h - 0.5) * 2, -1, 1);

    if (state.dragging) {
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.targetDragY += dx * 0.011;
      state.targetDragX = THREE.MathUtils.clamp(state.targetDragX + dy * 0.008, -0.85, 0.85);
      state.lastX = e.clientX;
      state.lastY = e.clientY;
    }
  }
  function onPointerUp() {
    state.dragging = false;
  }

  addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerup', onPointerUp, { passive: true });

  const _look = new THREE.Vector3(0, 0, 0);
  const _saffronCol = new THREE.Color('#f0c258');
  const _emeraldCol = new THREE.Color('#f6e6c4');

  const clock = new THREE.Clock();
  let frameId = 0;
  let running = true;
  let externalPaused = false;
  let contextLost = false;

  function smoothMix(a, b, t) {
    const u = THREE.MathUtils.clamp(t, 0, 1);
    const s = u * u * (3 - 2 * u);
    return a + (b - a) * s;
  }

  // Smooth 4-Stage Choreography from CLOSED -> NATURAL CRACK -> SHELL PEEL -> PURE KERNEL:
  // Keeps the pistachio calmly anchored in generous open gallery space opposite minimal typography!
  function sampleChoreography(t, isMobile) {
    if (isMobile) {
      return {
        rootX: 0,
        rootY: 0.52,
        camZ: smoothMix(6.9, 5.5, t),
        camY: 0.14,
        rotY: -0.45 + t * Math.PI * 1.15,
        stage: t,
        warmth: THREE.MathUtils.smoothstep(t, 0.68, 0.98) * 0.75,
      };
    }

    // Desktop: graceful subtle gallery pan LEFT -> CENTER-RIGHT -> LEFT -> CENTER-LEFT
    // Act 0 (0.00): CLOSED pistachio tilted to show its natural seam (-0.42 rad) on the LEFT
    // Act 1 (0.33): CRACKING / SMILING open toward the camera (0.0 rad) gliding subtly RIGHT
    // Act 2 (0.66): SHELLS PEELING OFF in 3D space on the LEFT, camera gliding closer
    // Act 3 (1.00): PURE NAKED EMERALD KERNEL in macro close-up, rotating cleanly to reveal emerald + rose testa!
    let rootX, camZ, rotY;
    if (t < 0.333) {
      const u = t / 0.333;
      rootX = smoothMix(-1.44, 1.38, u);
      camZ = smoothMix(6.55, 6.25, u);
      rotY = smoothMix(-0.34, 0.08, u);
    } else if (t < 0.666) {
      const u = (t - 0.333) / 0.333;
      rootX = smoothMix(1.38, -2.05, u);
      camZ = smoothMix(6.25, 6.75, u);
      rotY = smoothMix(0.08, -0.22, u);
    } else {
      const u = (t - 0.666) / 0.334;
      rootX = smoothMix(-2.05, 1.34, u);
      camZ = smoothMix(6.75, 5.15, u); // Luxury macro close-up on pure peeled kernel!
      rotY = smoothMix(-0.22, 0.36, u);
    }

    return {
      rootX,
      rootY: 0.04,
      camZ,
      camY: 0.10,
      rotY,
      stage: t,
      warmth: THREE.MathUtils.smoothstep(t, 0.68, 0.98) * 0.72,
    };
  }

  function afterDraw(cb) {
    const gl = renderer.getContext();
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 85);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (!running || externalPaused || contextLost) return;
      const status = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (status === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 8);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 72);
      }
    };
    frameId = window.setTimeout(poll, 8);
  }

  function tick() {
    if (!running || externalPaused || contextLost) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();
    bgUniforms.uTime.value = t;

    const isMobile = window.innerWidth < 960;

    state.smoothPX = THREE.MathUtils.damp(state.smoothPX, state.pointerX, 4.0, dt);
    state.smoothPY = THREE.MathUtils.damp(state.smoothPY, state.pointerY, 4.0, dt);
    state.dragY = THREE.MathUtils.damp(state.dragY, state.targetDragY, 7.0, dt);
    state.dragX = THREE.MathUtils.damp(state.dragX, state.targetDragX, 7.0, dt);
    state.smoothScrollT = THREE.MathUtils.damp(state.smoothScrollT, state.scrollT, 5.8, dt);

    const k = sampleChoreography(state.smoothScrollT, isMobile);
    const targetStage = state.manualStage !== null ? state.manualStage : k.stage;
    const targetWarmth = state.variety === 'roasted' ? Math.max(0.85, k.warmth) : k.warmth;

    state.smoothStage = THREE.MathUtils.damp(state.smoothStage, targetStage, 5.2, dt);
    state.smoothWarmth = THREE.MathUtils.damp(state.smoothWarmth, targetWarmth, 4.0, dt);
    state.smoothRootX = THREE.MathUtils.damp(state.smoothRootX, k.rootX, 5.0, dt);
    state.smoothRootY = THREE.MathUtils.damp(state.smoothRootY, k.rootY, 5.0, dt);

    assembly.root.position.set(state.smoothRootX, state.smoothRootY, 0);

    bgUniforms.uFocus.value.set(0.5 + state.smoothRootX / 7.2, 0.5 + state.smoothRootY / 6.0);
    bgUniforms.uWarmth.value = state.smoothWarmth;

    warmFill.intensity = 1.0 + state.smoothWarmth * 1.35;
    warmFill.position.x = state.smoothRootX - 1.0;
    rimLight.color.copy(_emeraldCol).lerp(_saffronCol, state.smoothWarmth * 0.55);

    // Calm living float & gentle inspection sway (never frenetic!)
    const calmSway = reduceMotion ? 0 : Math.sin(t * 0.45) * 0.18;
    assembly.nutGroup.rotation.y = k.rotY + calmSway + state.dragY + state.smoothPX * 0.22;
    assembly.nutGroup.rotation.x = 0.06 + state.dragX + state.smoothPY * 0.12 + (reduceMotion ? 0 : Math.sin(t * 0.55) * 0.03);
    assembly.nutGroup.position.y = reduceMotion ? 0 : Math.sin(t * 0.85) * 0.075;

    assembly.update(dt, t, state.smoothStage);

    if (!reduceMotion) {
      dustField.rotation.y = -t * 0.025 + state.smoothScrollT * 0.45;
      dustField.position.x = state.smoothRootX * 0.25;
    }

    camera.position.z = THREE.MathUtils.damp(camera.position.z, k.camZ, 4.8, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, k.camY - state.smoothPY * 0.18, 4.8, dt);
    camera.position.x = THREE.MathUtils.damp(camera.position.x, state.smoothPX * 0.18, 4.5, dt);
    _look.set(0, 0.02, 0);
    camera.lookAt(_look);

    renderer.render(scene, camera);

    if (isSoftwareGl) afterDraw(tick);
    else frameId = requestAnimationFrame(tick);
  }

  function resize() {
    const w = Math.max(1, window.innerWidth || 1280);
    const h = Math.max(1, window.innerHeight || 800);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 640 ? 38 : 32;
    camera.updateProjectionMatrix();
    bgUniforms.uResolution.value.set(w, h);
  }
  addEventListener('resize', resize);
  resize();

  function onContextLost(e) {
    e.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  }
  function onContextRestored() {
    contextLost = false;
    clock.getDelta();
    tick();
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  function onVisibility() {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    } else if (!running && !contextLost) {
      running = true;
      clock.getDelta();
      tick();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }
  if (typeof options.onReady === 'function') options.onReady();
  tick();

  return {
    varieties: PISTACHIO_VARIETIES,
    setVariety(key) {
      if (!PISTACHIO_VARIETIES[key]) return;
      state.variety = key;
      assembly.setVariety(key);
      state.targetDragY += 0.55;
    },
    setStage(val) {
      state.manualStage = val === null ? null : THREE.MathUtils.clamp(Number(val) || 0, 0, 1);
    },
    setScrollProgress(t) {
      state.scrollT = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
    },
    setPaused(paused) {
      const next = Boolean(paused);
      if (externalPaused === next) return;
      externalPaused = next;
      if (externalPaused) {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
      } else if (running && !contextLost) {
        clock.getDelta();
        tick();
      }
    },
    resetView() {
      state.targetDragX = 0;
      state.targetDragY = 0;
      state.manualStage = null;
    },
    dispose() {
      running = false;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      removeEventListener('resize', resize);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      assembly.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      bokehTex.dispose();
      renderer.dispose();
    },
  };
}

export const createHeroScene = createPistachioStage;
