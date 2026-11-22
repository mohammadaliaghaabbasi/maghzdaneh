/* ==========================================================================
   مغزدانه — cinema-stage.js (Silky 60fps 5-Stage 3D Pistachio Peeling Engine)
   موتور سه‌بعدی واقعی ۵-مرحله‌ای باز شدن و پوست‌گیری پسته اکبری رفسنجان:
   ۰۱ پسته بسته ← ۰۲ خندانی طبیعی (مغز با پوست قرمز کامل) ←
   ۰۳ جدایی پوسته چوبی (مغز در لباس ارغوانی) ←
   ۰۴ پوست‌گیری سه‌بعدی غشای نازک قرمز ← ۰۵ مغز سبز خالص زمردی
   بهینه‌سازی ۶۰ فریم‌برثانیه: تک-نمونه‌برداری بافت در شیدر + هندسه بهینه + رندر بومی
   ========================================================================== */

import * as THREE from './three.module.js';

export const STAGE_ASSETS = {
  closedShell: 'src/assets/images/pistachio_stage_1_closed_1795339905135.jpg',
  redSkin: 'src/assets/images/pistachio_kernel_red_skin_1795349497936.jpg',
  pureGreen: 'src/assets/images/pistachio_kernel_pure_green_1795349498393.jpg',
};

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

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ==========================================================================
   FAST BORDER-BFS SILHOUETTE EXTRACTION & ORGANIC PROFILE MEASUREMENT (512px)
   ========================================================================== */
function processPhotoSubject(img, { flipY = false, mode = 'shell', size = 512 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.save();
  if (flipY) {
    // Upright orientation: stem scar at BOTTOM, pointed beak at TOP
    ctx.translate(0, size);
    ctx.scale(1, -1);
  }
  ctx.drawImage(img, 0, 0, size, size);
  ctx.restore();

  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  const total = size * size;

  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  function looksLikeBg(idx) {
    const p = idx * 4;
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    const maxC = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const minC = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const chroma = maxC - minC;
    if (mode === 'shell') {
      return maxC < 44 && (r - b) < 16 && chroma < 24;
    }
    if (mode === 'redSkin') {
      // Deep crimson/plum skin sits on pure obsidian (#060907); keep even dark burgundy edges intact
      return maxC < 26 && chroma < 14;
    }
    // Pure emerald green kernel on obsidian
    return maxC < 32 && chroma < 15;
  }

  function trySeed(x, y) {
    const idx = y * size + x;
    if (isBg[idx]) return;
    if (looksLikeBg(idx)) {
      isBg[idx] = 1;
      queue[qTail++] = idx;
    }
  }

  for (let x = 0; x < size; x++) {
    trySeed(x, 0);
    trySeed(x, size - 1);
  }
  for (let y = 0; y < size; y++) {
    trySeed(0, y);
    trySeed(size - 1, y);
  }

  while (qHead < qTail) {
    const cur = queue[qHead++];
    const cx = cur % size;
    const cy = (cur - cx) / size;
    if (cx > 0) trySeed(cx - 1, cy);
    if (cx < size - 1) trySeed(cx + 1, cy);
    if (cy > 0) trySeed(cx, cy - 1);
    if (cy < size - 1) trySeed(cx, cy + 1);
  }

  // Crisp 1-pass anti-aliased alpha edge with subtle fringe erosion (zero dark halo)
  const alphaA = new Float32Array(total);
  const alphaB = new Float32Array(total);
  for (let i = 0; i < total; i++) alphaA[i] = isBg[i] ? 0 : 1;

  for (let y = 1; y < size - 1; y++) {
    const row = y * size;
    for (let x = 1; x < size - 1; x++) {
      const i = row + x;
      const avg =
        (alphaA[i - size - 1] + alphaA[i - size] + alphaA[i - size + 1] +
          alphaA[i - 1] + alphaA[i] * 2 + alphaA[i + 1] +
          alphaA[i + size - 1] + alphaA[i + size] + alphaA[i + size + 1]) * 0.1;
      alphaB[i] = clamp01((avg - 0.16) / 0.74);
    }
  }

  let minX = size;
  let maxX = 0;
  let minY = size;
  let maxY = 0;

  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const i = row + x;
      const a = alphaB[i];
      d[i * 4 + 3] = Math.round(a * 255);
      if (a > 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const samples = 48;
  const xLeftProfile = new Float32Array(samples + 1);
  const xRightProfile = new Float32Array(samples + 1);
  const centerPx = (minX + maxX) * 0.5;
  const heightPx = Math.max(1, maxY - minY);

  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const py = Math.min(size - 1, Math.max(0, Math.round(maxY - t * heightPx)));
    let lx = centerPx;
    let rx = centerPx;
    let found = false;
    for (let x = minX; x <= maxX; x++) {
      if (alphaB[py * size + x] > 0.45) {
        lx = x;
        found = true;
        break;
      }
    }
    for (let x = maxX; x >= minX; x--) {
      if (alphaB[py * size + x] > 0.45) {
        rx = x;
        break;
      }
    }
    if (!found) {
      lx = centerPx;
      rx = centerPx;
    }
    xLeftProfile[s] = lx / size;
    xRightProfile[s] = rx / size;
  }

  const smoothProfile = (arr) => {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] =
        arr[Math.max(0, i - 1)] * 0.25 +
        arr[i] * 0.5 +
        arr[Math.min(arr.length - 1, i + 1)] * 0.25;
    }
    return out;
  };

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  return {
    texture: tex,
    bounds: {
      minU: minX / size,
      maxU: maxX / size,
      centerU: centerPx / size,
      bottomV: 1 - maxY / size,
      topV: 1 - minY / size,
      aspect: (maxX - minX) / heightPx,
    },
    xLeftProfile: smoothProfile(xLeftProfile),
    xRightProfile: smoothProfile(xRightProfile),
  };
}

function sampleProfile(arr, t) {
  const f = clamp01(t) * (arr.length - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(arr.length - 1, i0 + 1);
  const frac = f - i0;
  return arr[i0] * (1 - frac) + arr[i1] * frac;
}

/* ==========================================================================
   1. LIGHTWEIGHT 3D WOODY HALF-SHELL CUP GEOMETRY (36×20)
   ========================================================================== */
function buildHalfShellGeometry(shellData, side, totalHeight = 2.34) {
  const { bounds, xLeftProfile, xRightProfile } = shellData;
  const segV = 36;
  const segU = 20;
  const depthScale = 0.78;
  const wallThick = 0.088;
  const seamU = bounds.centerU;

  const spanV = Math.max(1e-4, bounds.topV - bounds.bottomV);
  const worldPerUv = totalHeight / spanV;

  function sutureOffsetW(vFrac) {
    const env = Math.sin(clamp01(vFrac) * Math.PI);
    return (Math.sin(vFrac * 10.5) * 0.015 + Math.sin(vFrac * 22.0) * 0.005) * env;
  }

  function evalOuter(vFrac, uFrac) {
    const edgeU = side < 0 ? sampleProfile(xLeftProfile, vFrac) : sampleProfile(xRightProfile, vFrac);
    const halfWidthU = Math.abs(edgeU - seamU);
    const halfWidthW = halfWidthU * worldPerUv;
    const seamShift = sutureOffsetW(vFrac);

    const theta = uFrac * (Math.PI * 0.76);
    const x = seamShift * (1 - uFrac) + side * halfWidthW * Math.sin(theta);

    const endTaper = Math.sin(Math.pow(clamp01(vFrac), 0.9) * Math.PI);
    const bulge = 0.30 + 0.70 * Math.pow(endTaper, 0.7);
    const cupDepth = Math.max(0.04, halfWidthW * 1.02 * bulge + depthScale * 0.16 * endTaper);
    const z = cupDepth * Math.cos(theta);
    const y = vFrac * totalHeight;

    const projFrac = Math.sin(Math.min(theta, Math.PI * 0.5));
    const u = clamp01(seamU + (seamShift / worldPerUv) * (1 - uFrac) + side * halfWidthU * projFrac);
    const v = bounds.bottomV + vFrac * spanV;

    return { x, y, z, u, v, theta, endTaper };
  }

  function evalInner(vFrac, uFrac) {
    const o = evalOuter(vFrac, uFrac);
    const nx = side * Math.sin(o.theta);
    const nz = Math.cos(o.theta);
    const localThick = wallThick * (0.48 + 0.52 * o.endTaper);
    return {
      x: o.x - nx * localThick * 0.76,
      y: o.y,
      z: o.z - nz * localThick,
      u: uFrac,
      v: vFrac,
    };
  }

  const outerGeo = new THREE.BufferGeometry();
  const oPos = [];
  const oUv = [];
  const oIdx = [];
  for (let iv = 0; iv <= segV; iv++) {
    const vf = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const p = evalOuter(vf, iu / segU);
      oPos.push(p.x, p.y, p.z);
      oUv.push(p.u, p.v);
    }
  }
  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side > 0) oIdx.push(a, b, d, a, d, c);
      else oIdx.push(a, d, b, a, c, d);
    }
  }
  outerGeo.setAttribute('position', new THREE.Float32BufferAttribute(oPos, 3));
  outerGeo.setAttribute('uv', new THREE.Float32BufferAttribute(oUv, 2));
  outerGeo.setIndex(oIdx);
  outerGeo.computeVertexNormals();

  const innerGeo = new THREE.BufferGeometry();
  const iPos = [];
  const iUv = [];
  const iIdx = [];
  for (let iv = 0; iv <= segV; iv++) {
    const vf = iv / segV;
    for (let iu = 0; iu <= segU; iu++) {
      const p = evalInner(vf, iu / segU);
      iPos.push(p.x, p.y, p.z);
      iUv.push(p.u, p.v);
    }
  }
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side > 0) iIdx.push(a, d, b, a, c, d);
      else iIdx.push(a, b, d, a, d, c);
    }
  }

  // Stitch front split rim & back rim
  const stitchRim = (uAt, flipOrder) => {
    const base = iPos.length / 3;
    for (let iv = 0; iv <= segV; iv++) {
      const vf = iv / segV;
      const po = evalOuter(vf, uAt);
      const pi = evalInner(vf, uAt);
      iPos.push(po.x, po.y, po.z, pi.x, pi.y, pi.z);
      iUv.push(uAt < 0.5 ? 0.04 : 0.96, vf, uAt < 0.5 ? 0.14 : 0.86, vf);
    }
    for (let iv = 0; iv < segV; iv++) {
      const a = base + iv * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const fwd = side > 0 ? !flipOrder : flipOrder;
      if (fwd) iIdx.push(a, c, d, a, d, b);
      else iIdx.push(a, d, c, a, b, d);
    }
  };
  stitchRim(0, false);
  stitchRim(1, true);

  innerGeo.setAttribute('position', new THREE.Float32BufferAttribute(iPos, 3));
  innerGeo.setAttribute('uv', new THREE.Float32BufferAttribute(iUv, 2));
  innerGeo.setIndex(iIdx);
  innerGeo.computeVertexNormals();

  return { outerGeo, innerGeo };
}

/* ==========================================================================
   2. VOLUMETRIC 3D PURE EMERALD KERNEL GEOMETRY (34×24)
   ========================================================================== */
function buildVolumetricKernelGeometry(kernelData, totalHeight = 1.88) {
  const { bounds, xLeftProfile, xRightProfile } = kernelData;
  const segV = 34;
  const segU = 24;
  const spanV = Math.max(1e-4, bounds.topV - bounds.bottomV);
  const worldPerUv = totalHeight / spanV;
  const centerU = bounds.centerU;

  const pos = [];
  const uv = [];
  const idx = [];

  for (let sideFace = 0; sideFace < 2; sideFace++) {
    const zSign = sideFace === 0 ? 1 : -1;
    const baseVertex = pos.length / 3;

    for (let iv = 0; iv <= segV; iv++) {
      const vf = iv / segV;
      const lu = sampleProfile(xLeftProfile, vf);
      const ru = sampleProfile(xRightProfile, vf);
      const widthU = Math.max(0.002, ru - lu);
      const halfW = widthU * 0.5 * worldPerUv;
      const midW = ((lu + ru) * 0.5 - centerU) * worldPerUv;
      const endTaper = Math.sin(Math.pow(clamp01(vf), 0.9) * Math.PI);
      const maxZ = Math.max(0.04, halfW * 0.72 * (0.35 + 0.65 * endTaper));

      for (let iu = 0; iu <= segU; iu++) {
        const uf = iu / segU;
        const s = uf * 2 - 1;
        const x = midW + s * halfW;
        const y = (vf - 0.5) * totalHeight;
        const dome = Math.sqrt(Math.max(0, 1 - s * s * 0.96));
        const z = zSign * maxZ * Math.pow(dome, 0.82);

        pos.push(x, y, z);
        uv.push(lu + uf * widthU, bounds.bottomV + vf * spanV);
      }
    }

    const stride = segU + 1;
    for (let iv = 0; iv < segV; iv++) {
      for (let iu = 0; iu < segU; iu++) {
        const a = baseVertex + iv * stride + iu;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        if (sideFace === 0) idx.push(a, b, d, a, d, c);
        else idx.push(a, d, b, a, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
   3. TRUE 3D PAPERY CRIMSON RED-SKIN PEEL PETALS (28×18, LEFT & RIGHT HALVES)
   - Clean front-to-flank botanical petal shells (zero back-wrap stretching!)
   - Wraps tightly around the emerald kernel (+0.028 normal offset)
   - Carries `aPeelCoord` (uFrac from central seam, vFrac from bottom to top)
     for true arc-length circular peeling without mesh distortion!
   ========================================================================== */
function buildRedSkinPeelHalfGeometry(greenData, redData, side, totalHeight = 1.88) {
  const { bounds: gb, xLeftProfile: gLeft, xRightProfile: gRight } = greenData;
  const { bounds: rb, xLeftProfile: rLeft, xRightProfile: rRight } = redData;

  const segV = 30;
  const segU = 16;
  const spanGV = Math.max(1e-4, gb.topV - gb.bottomV);
  const spanRV = Math.max(1e-4, rb.topV - rb.bottomV);
  const worldPerUv = totalHeight / spanGV;
  const gCenterU = gb.centerU;
  const skinGap = 0.028;

  const pos = [];
  const uv = [];
  const peelCoord = [];
  const idx = [];

  function tearSeamS(vf) {
    const env = Math.sin(clamp01(vf) * Math.PI);
    return (Math.sin(vf * 10.0) * 0.04 + Math.sin(vf * 21.0) * 0.015) * env;
  }

  for (let iv = 0; iv <= segV; iv++) {
    const vf = iv / segV;
    const gLu = sampleProfile(gLeft, vf);
    const gRu = sampleProfile(gRight, vf);
    const gWidthU = Math.max(0.002, gRu - gLu);
    const halfW = gWidthU * 0.5 * worldPerUv;
    const midW = ((gLu + gRu) * 0.5 - gCenterU) * worldPerUv;
    const endTaper = Math.sin(Math.pow(clamp01(vf), 0.9) * Math.PI);
    const maxZ = Math.max(0.04, halfW * 0.72 * (0.35 + 0.65 * endTaper));

    const rLu = sampleProfile(rLeft, vf);
    const rRu = sampleProfile(rRight, vf);
    const rWidthU = Math.max(0.002, rRu - rLu);
    const seamS = tearSeamS(vf);

    for (let iu = 0; iu <= segU; iu++) {
      const uf = iu / segU; // 0 = central seam, 1 = outer flank silhouette
      const s = THREE.MathUtils.lerp(seamS, side * 1.0, uf);
      const sClamped = Math.max(-1, Math.min(1, s));
      const dome = Math.sqrt(Math.max(0, 1 - sClamped * sClamped * 0.96));

      const x = midW + sClamped * (halfW + skinGap * 0.85);
      const y = (vf - 0.5) * (totalHeight + skinGap * 1.0);
      const z = (maxZ + skinGap) * Math.pow(dome, 0.82);

      const rFrac = (sClamped + 1) * 0.5;
      const uTex = clamp01(rLu + clamp01(rFrac) * rWidthU);
      const vTex = clamp01(rb.bottomV + vf * spanRV);

      pos.push(x, y, z);
      uv.push(uTex, vTex);
      peelCoord.push(uf, vf);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (side > 0) idx.push(a, b, d, a, d, c);
      else idx.push(a, d, b, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aPeelCoord', new THREE.Float32BufferAttribute(peelCoord, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
   SINGLE-FETCH 60FPS STUDIO SHADERS (ZERO 5-TAP LAG!)
   ========================================================================== */
function createOuterShellMaterial(shellTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: shellTex },
      uLightDir: { value: new THREE.Vector3(0.45, 0.55, 0.78).normalize() },
      uOpacity: { value: 1.0 },
      uCrackGlow: { value: 0.0 },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uLightDir;
      uniform float uOpacity;
      uniform float uCrackGlow;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.08) discard;

        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPos);
        float ndl = max(dot(n, uLightDir), 0.0);
        float shading = 0.74 + 0.30 * ndl;
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

        vec3 col = tex.rgb * shading + vec3(0.94, 0.84, 0.64) * fresnel * (0.20 + uCrackGlow * 0.10);
        gl_FragColor = vec4(col, tex.a * uOpacity);
      }
    `,
  });
}

function createInnerShellCupMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLightDir: { value: new THREE.Vector3(0.45, 0.55, 0.78).normalize() },
      uOpacity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uLightDir;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
        vec3 v = normalize(vViewPos);

        // Ultra-subtle natural vertical wood-fiber variation (zero artificial waves!)
        float vFiber = 0.965 + 0.035 * sin(vUv.x * 62.0 + vUv.y * 4.0) * sin(vUv.x * 29.0);
        float rimDist = min(vUv.x, 1.0 - vUv.x);
        float isRim = 1.0 - smoothstep(0.03, 0.15, rimDist);
        float cupDepth = smoothstep(0.06, 0.78, sin(vUv.x * 3.14159) * sin(vUv.y * 3.14159));

        vec3 woodyRim = vec3(0.75, 0.61, 0.44);
        vec3 innerCream = vec3(0.58, 0.42, 0.29);
        vec3 deepHollow = vec3(0.20, 0.12, 0.08);

        vec3 base = mix(mix(innerCream, deepHollow, cupDepth * 0.86), woodyRim, isRim) * vFiber;
        float wrap = max(0.0, (dot(n, uLightDir) + 0.45) / 1.45);
        vec3 h = normalize(uLightDir + v);
        float spec = pow(max(dot(n, h), 0.0), 24.0) * 0.08 * (1.0 - isRim * 0.6);

        gl_FragColor = vec4(base * (0.36 + 0.68 * wrap) + vec3(0.92, 0.78, 0.60) * spec, uOpacity);
      }
    `,
  });
}

function createRedSkinPeelMaterial(redTex, side) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: redTex },
      uLightDir: { value: new THREE.Vector3(0.45, 0.55, 0.78).normalize() },
      uSide: { value: side },
      uPeel: { value: 0.0 },
      uDetach: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uOpenness: { value: 0.0 },
      uTime: { value: 0.0 },
    },
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute vec2 aPeelCoord;
      uniform float uSide;
      uniform float uPeel;
      uniform float uDetach;
      uniform float uTime;

      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying float vLocalPeel;
      varying float vUFrac;

      void main() {
        vUv = uv;
        float uFrac = aPeelCoord.x; // 0 = center split seam, 1 = outer flank
        float vFrac = aPeelCoord.y; // 0 = bottom stem, 1 = top tip
        vUFrac = uFrac;

        // Clean rigid-arc botanical peel: hinges smoothly from TOP (1.0) down toward BOTTOM (0.0)
        // Slight diagonal bias (0.09) so the central crease splits just ahead of the flank, without stretching!
        float hingeV = 1.04 - uPeel * 1.24;
        float distPastHinge = max(0.0, (vFrac + (1.0 - uFrac) * 0.09) - hingeV);
        float localPeel = clamp(distPastHinge / 0.58, 0.0, 1.0);
        vLocalPeel = localPeel;

        vec3 pos = position;
        vec3 nrm = normal;

        if (distPastHinge > 0.0005 || uDetach > 0.001) {
          // True circular arc curling (preserves papery skin length — zero triangular stretching!)
          float arc = distPastHinge * 1.65;
          float curlR = 0.34;
          float theta = min(arc / curlR, 2.35);

          // Roll the peeled petal outward along uSide & gently forward/downward like a real banana/pistachio testa curl
          float dY = curlR * sin(theta) - arc;
          float outDist = curlR * (1.0 - cos(theta));

          // Lateral outward fan angle + subtle papery flutter
          float wave = sin(vFrac * 7.5 + uTime * 2.0 + uSide) * 0.016 * localPeel;
          pos.y += dY * 0.72 - uDetach * 0.42;
          pos.x += uSide * (outDist * 1.22 + uDetach * 0.56) + wave * uSide;
          pos.z += outDist * 0.42 - localPeel * localPeel * 0.24 - uDetach * 0.44;

          // Smoothly rotate normal with the curl angle so studio rim light glides across the curled edge
          float c = cos(theta * 0.65);
          float s = sin(theta * 0.65);
          nrm = normalize(vec3(nrm.x * c + uSide * nrm.z * s, nrm.y * c - nrm.z * s * 0.4, nrm.z * c - uSide * nrm.x * s));
        }

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * nrm);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uLightDir;
      uniform float uOpacity;
      uniform float uOpenness;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      varying float vLocalPeel;
      varying float vUFrac;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.08) discard;

        vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
        vec3 v = normalize(vViewPos);
        float ndl = max(dot(n, uLightDir), 0.0);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.8);

        // Rich velvety crimson-plum front vs. natural muted matte-plum papery underside when curled back
        vec3 baseCol = gl_FrontFacing
          ? tex.rgb
          : mix(tex.rgb * vec3(0.68, 0.48, 0.54), vec3(0.38, 0.19, 0.23), 0.42);

        float sideDist = abs(vUv.x - 0.5) * 2.0;
        float cavity = mix(1.0 - smoothstep(0.14, 0.80, sideDist) * 0.56, 1.0, smoothstep(0.15, 0.72, uOpenness));
        float topReveal = mix(0.48 + 0.52 * smoothstep(0.24, 0.85, vUv.y), 1.0, smoothstep(0.18, 0.68, uOpenness));

        vec3 col = baseCol * (0.76 + 0.30 * ndl) * cavity * topReveal;
        col += vec3(0.76, 0.34, 0.42) * fresnel * (0.14 + vLocalPeel * 0.24);

        // Soft feathered edge along the outer papery margin so the peeled petals look organic
        float edgeFade = mix(1.0, smoothstep(1.0, 0.88, vUFrac), vLocalPeel * 0.55);
        gl_FragColor = vec4(col, tex.a * uOpacity * edgeFade);
      }
    `,
  });
}

function createPureGreenKernelMaterial(greenTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: greenTex },
      uLightDir: { value: new THREE.Vector3(0.45, 0.55, 0.78).normalize() },
      uReveal: { value: 0.0 }, // 0 = covered by red skin, 1 = 100% pure peeled emerald in studio spotlight
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform vec3 uLightDir;
      uniform float uReveal;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      void main() {
        vec4 tex = texture2D(uMap, vUv);
        if (tex.a < 0.08) discard;

        vec3 n = normalize(vNormal);
        vec3 v = normalize(vViewPos);
        float ndl = max(dot(n, uLightDir), 0.0);
        vec3 h = normalize(uLightDir + v);
        float spec = pow(max(dot(n, h), 0.0), 34.0) * (0.06 + 0.14 * uReveal);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);

        // Soft cast shadow just below the retreating red-skin peel line for true depth
        float peelLight = mix(0.62, 1.0, smoothstep(0.0, 0.85, uReveal));
        vec3 col = tex.rgb * (0.76 + 0.30 * ndl) * peelLight;
        col += vec3(0.78, 0.96, 0.48) * spec;
        col += vec3(0.38, 0.68, 0.28) * fresnel * 0.20 * uReveal;

        gl_FragColor = vec4(col, tex.a);
      }
    `,
  });
}

function createBokehTexture() {
  const size = 48;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 248, 224, 0.92)');
  g.addColorStop(0.35, 'rgba(232, 206, 138, 0.42)');
  g.addColorStop(1, 'rgba(232, 206, 138, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ==========================================================================
   MAIN EXPORTED 5-STAGE 3D CINEMA ENGINE
   ========================================================================== */
export function createPistachioCinemaStage(canvas, options = {}) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSoftwareGl = detectSoftwareGl();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !isSoftwareGl,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(devicePixelRatio || 1, 1.75));

  const initW = Math.max(1, window.innerWidth || 1440);
  const initH = Math.max(1, window.innerHeight || 900);
  renderer.setSize(initW, initH, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#060907');

  const camera = new THREE.PerspectiveCamera(34, initW / initH, 0.1, 40);
  camera.position.set(0, 0, 5.65);

  /* ---------- Soft Studio Radial Back-Halo (Transitions Gold → Plum → Emerald) ---------- */
  const haloUniforms = {
    uRedPhase: { value: 0.0 },
    uGreenPhase: { value: 0.0 },
  };
  const haloPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.ShaderMaterial({
      uniforms: haloUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uRedPhase;
        uniform float uGreenPhase;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float g = exp(-dot(p, p) * 2.3);
          vec3 col = mix(vec3(0.085, 0.075, 0.052), vec3(0.12, 0.048, 0.068), uRedPhase);
          col = mix(col, vec3(0.055, 0.155, 0.075), uGreenPhase);
          gl_FragColor = vec4(col, g * (0.28 + uRedPhase * 0.08 + uGreenPhase * 0.18));
        }
      `,
    })
  );
  haloPlane.position.z = -1.6;

  /* ---------- Articulated 3D Rig Hierarchy ---------- */
  const rigRoot = new THREE.Group();
  rigRoot.add(haloPlane);
  scene.add(rigRoot);

  const nutAssembly = new THREE.Group();
  rigRoot.add(nutAssembly);

  const STEM_PIVOT_Y = -1.17;
  const leftShellPivot = new THREE.Group();
  leftShellPivot.position.set(0, STEM_PIVOT_Y, 0);
  nutAssembly.add(leftShellPivot);

  const rightShellPivot = new THREE.Group();
  rightShellPivot.position.set(0, STEM_PIVOT_Y, 0);
  nutAssembly.add(rightShellPivot);

  // Kernel + 3D Papery Red-Skin Peel Halves live inside kernelPivot so they stay 100% locked together!
  const kernelPivot = new THREE.Group();
  kernelPivot.position.set(0, 0.02, 0.02);
  nutAssembly.add(kernelPivot);

  // Organic curled papery plum-skin micro-flakes released during Stage 04 peeling
  const flakeGroup = new THREE.Group();
  nutAssembly.add(flakeGroup);
  const flakes = [];
  const flakeShape = new THREE.Shape();
  flakeShape.moveTo(0, -0.028);
  flakeShape.bezierCurveTo(0.026, -0.016, 0.032, 0.014, 0.004, 0.038);
  flakeShape.bezierCurveTo(-0.024, 0.018, -0.026, -0.014, 0, -0.028);
  const flakeGeo = new THREE.ShapeGeometry(flakeShape, 5);
  const fp = flakeGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const fx = fp.getX(i);
    fp.setZ(i, fx * fx * 9.0);
  }
  flakeGeo.computeVertexNormals();

  const flakeMatPlum = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7a2b44'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const flakeMatRose = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#9c445c'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });

  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(flakeGeo, i % 2 === 0 ? flakeMatPlum : flakeMatRose);
    const angle = (i / 12) * Math.PI * 2 + 0.35;
    const dirX = Math.cos(angle) * (0.46 + (i % 3) * 0.24);
    const dirY = Math.sin(angle) * 0.44 - 0.08;
    const dirZ = 0.14 + (i % 4) * 0.11;
    m.scale.setScalar(0.55 + (i % 3) * 0.22);
    flakeGroup.add(m);
    flakes.push({ mesh: m, dirX, dirY, dirZ, spinX: (i % 2 ? 1 : -1) * 1.4, spinY: (i % 3 ? 1 : -1) * 1.7 });
  }

  /* ---------- Whisper-Subtle Gallery Dust Bokeh ---------- */
  const bokehTex = createBokehTexture();
  const dustCount = isSoftwareGl ? 12 : 20;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 1.6 + Math.random() * 2.8;
    const th = Math.random() * Math.PI * 2;
    dustPos[i * 3] = Math.cos(th) * r;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 3.4;
    dustPos[i * 3 + 2] = -0.7 - Math.random() * 1.4;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: bokehTex,
    color: new THREE.Color('#e8ce8a'),
    size: 0.048,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustField = new THREE.Points(dustGeo, dustMat);
  scene.add(dustField);

  /* ---------- Async Build of All 3 Real-Photo Layers (Yields Between BFS Passes) ---------- */
  let leftOuterMat = null;
  let rightOuterMat = null;
  let innerCupMat = null;
  let redPeelLeftMat = null;
  let redPeelRightMat = null;
  let redPeelLeftMesh = null;
  let redPeelRightMesh = null;
  let greenKernelMat = null;

  const disposables = [];
  let disposed = false;
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;

  Promise.all([
    loadImage(STAGE_ASSETS.closedShell),
    loadImage(STAGE_ASSETS.redSkin),
    loadImage(STAGE_ASSETS.pureGreen),
  ])
    .then(async ([shellImg, redImg, greenImg]) => {
      if (disposed) return;
      const texSize = 512;

      const shellData = processPhotoSubject(shellImg, { flipY: true, mode: 'shell', size: texSize });
      await nextFrame();
      if (disposed) return;

      const redData = processPhotoSubject(redImg, { flipY: false, mode: 'redSkin', size: texSize });
      await nextFrame();
      if (disposed) return;

      const greenData = processPhotoSubject(greenImg, { flipY: false, mode: 'green', size: texSize });
      if (disposed) return;

      shellData.texture.anisotropy = maxAniso;
      redData.texture.anisotropy = maxAniso;
      greenData.texture.anisotropy = maxAniso;
      disposables.push(shellData.texture, redData.texture, greenData.texture);

      const leftParts = buildHalfShellGeometry(shellData, -1, 2.34);
      const rightParts = buildHalfShellGeometry(shellData, +1, 2.34);
      const greenGeo = buildVolumetricKernelGeometry(greenData, 1.88);
      const redPeelLeftGeo = buildRedSkinPeelHalfGeometry(greenData, redData, -1, 1.88);
      const redPeelRightGeo = buildRedSkinPeelHalfGeometry(greenData, redData, +1, 1.88);

      disposables.push(
        leftParts.outerGeo,
        leftParts.innerGeo,
        rightParts.outerGeo,
        rightParts.innerGeo,
        greenGeo,
        redPeelLeftGeo,
        redPeelRightGeo
      );

      leftOuterMat = createOuterShellMaterial(shellData.texture);
      rightOuterMat = createOuterShellMaterial(shellData.texture);
      innerCupMat = createInnerShellCupMaterial();
      redPeelLeftMat = createRedSkinPeelMaterial(redData.texture, -1);
      redPeelRightMat = createRedSkinPeelMaterial(redData.texture, +1);
      greenKernelMat = createPureGreenKernelMaterial(greenData.texture);
      disposables.push(leftOuterMat, rightOuterMat, innerCupMat, redPeelLeftMat, redPeelRightMat, greenKernelMat);

      leftShellPivot.add(new THREE.Mesh(leftParts.outerGeo, leftOuterMat));
      leftShellPivot.add(new THREE.Mesh(leftParts.innerGeo, innerCupMat));

      rightShellPivot.add(new THREE.Mesh(rightParts.outerGeo, rightOuterMat));
      rightShellPivot.add(new THREE.Mesh(rightParts.innerGeo, innerCupMat));

      const greenMesh = new THREE.Mesh(greenGeo, greenKernelMat);
      greenMesh.renderOrder = 1;
      kernelPivot.add(greenMesh);

      redPeelLeftMesh = new THREE.Mesh(redPeelLeftGeo, redPeelLeftMat);
      redPeelRightMesh = new THREE.Mesh(redPeelRightGeo, redPeelRightMat);
      redPeelLeftMesh.renderOrder = 2;
      redPeelRightMesh.renderOrder = 2;
      kernelPivot.add(redPeelLeftMesh);
      kernelPivot.add(redPeelRightMesh);

      if (typeof options.onReady === 'function') options.onReady();
    })
    .catch((err) => {
      console.warn('Pistachio 3D texture build warning:', err);
    });

  /* ---------- Silky State & Controls ---------- */
  const state = {
    pointerX: 0,
    pointerY: 0,
    smoothPX: 0,
    smoothPY: 0,
    dragging: false,
    lastX: 0,
    dragYaw: 0,
    targetDragYaw: 0,
    scrollT: 0,
    manualStage: null,
    smoothStage: 0,
    smoothX: -1.14,
    smoothY: -0.02,
    smoothZ: 0,
  };

  function isInteractiveTarget(el) {
    if (!el || !el.closest) return false;
    return Boolean(el.closest('a, button, input, select, textarea, label, .site-header, .stage-rail, .prologue-top'));
  }

  function onPointerDown(e) {
    if (isInteractiveTarget(e.target)) return;
    state.dragging = true;
    state.lastX = e.clientX;
  }
  function onPointerMove(e) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    state.pointerX = THREE.MathUtils.clamp((e.clientX / w - 0.5) * 2, -1, 1);
    state.pointerY = THREE.MathUtils.clamp((e.clientY / h - 0.5) * 2, -1, 1);
    if (state.dragging) {
      const dx = e.clientX - state.lastX;
      state.targetDragYaw = THREE.MathUtils.clamp(state.targetDragYaw + dx * 0.0055, -1.15, 1.15);
      state.lastX = e.clientX;
    }
  }
  function onPointerUp() {
    state.dragging = false;
  }

  addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerup', onPointerUp, { passive: true });

  const clock = new THREE.Clock();
  let frameId = 0;
  let running = true;
  let externalPaused = false;
  let contextLost = false;
  const lightVec = new THREE.Vector3(0.45, 0.55, 0.78).normalize();

  function scheduleNext() {
    if (!running || externalPaused || contextLost) return;
    if (isSoftwareGl) {
      frameId = window.setTimeout(tick, 24);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  function tick() {
    if (!running || externalPaused || contextLost) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.getElapsedTime();
    const isMobile = window.innerWidth < 900;

    state.smoothPX = THREE.MathUtils.damp(state.smoothPX, state.pointerX, 5.2, dt);
    state.smoothPY = THREE.MathUtils.damp(state.smoothPY, state.pointerY, 5.2, dt);
    if (!state.dragging) {
      state.targetDragYaw = THREE.MathUtils.damp(state.targetDragYaw, 0, 1.6, dt);
    }
    state.dragYaw = THREE.MathUtils.damp(state.dragYaw, state.targetDragYaw, 6.5, dt);

    const targetStage = state.manualStage !== null ? state.manualStage : state.scrollT;
    state.smoothStage = THREE.MathUtils.damp(state.smoothStage, targetStage, 7.5, dt);

    const p = state.smoothStage;

    /* --- 5-STAGE CHOREOGRAPHY TIMELINE (p ∈ [0.00 → 1.00]) ---
       Stage 01 (0.00): Closed upright woody pistachio shell
       Stage 02 (0.25): Woody shells hinge open → reveals INTACT RED-SKINNED kernel inside
       Stage 03 (0.50): Woody shells detach & glide down → INTACT RED-SKINNED kernel centered
       Stage 04 (0.75): 3D papery red skin splits at top & curls outward/downward → reveals pure emerald green
       Stage 05 (1.00): Pure vivid emerald-green kernel in macro spotlight + gateway CTA */
    const crackT = smoothstep(0.08, 0.30, p);
    const detachT = smoothstep(0.30, 0.52, p);
    const shellExitT = smoothstep(0.46, 0.62, p);
    const peelT = smoothstep(0.55, 0.84, p);
    const peelDetachT = smoothstep(0.76, 0.94, p);
    const heroT = smoothstep(0.84, 1.00, p);

    const targetX = isMobile ? 0 : THREE.MathUtils.lerp(-1.14, -1.06, p);
    const targetY = isMobile ? 0.34 : -0.02;
    const targetZ = isMobile ? -0.68 : THREE.MathUtils.lerp(0.0, 0.16, heroT);

    state.smoothX = THREE.MathUtils.damp(state.smoothX, targetX, 5.5, dt);
    state.smoothY = THREE.MathUtils.damp(state.smoothY, targetY, 5.5, dt);
    state.smoothZ = THREE.MathUtils.damp(state.smoothZ, targetZ, 5.5, dt);

    rigRoot.position.set(
      state.smoothX,
      state.smoothY + (reduceMotion ? 0 : Math.sin(t * 0.78) * 0.036),
      state.smoothZ
    );

    const cinemaYaw = Math.sin(p * Math.PI * 1.65) * 0.22 + heroT * 0.10;
    const cinemaPitch = Math.sin(p * Math.PI) * 0.045;
    nutAssembly.rotation.y = cinemaYaw + state.smoothPX * 0.26 + state.dragYaw;
    nutAssembly.rotation.x = cinemaPitch + state.smoothPY * 0.12;
    nutAssembly.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.45) * 0.01;

    /* --- 1. Left & Right Woody Half-Shells --- */
    const hingeZ = crackT * 0.25 + detachT * 0.15 + shellExitT * 0.16;
    const shellYaw = crackT * 0.36 + detachT * 0.58 + shellExitT * 0.36;
    const shellPitch = detachT * 0.12 + shellExitT * 0.28;
    const spreadLeft = crackT * 0.06 + detachT * 0.72 + shellExitT * 0.48;
    const spreadRight = crackT * 0.06 + detachT * 0.62 + shellExitT * 0.12;
    const dropY = -detachT * 0.08 - shellExitT * 0.92;
    const recedeZ = -crackT * 0.05 - detachT * 0.36 - shellExitT * 1.85;
    const shellScale = 1.0 - shellExitT * 0.28;
    const shellOpacity = 1.0 - smoothstep(0.48, 0.62, p);

    leftShellPivot.position.set(-spreadLeft, STEM_PIVOT_Y + dropY, recedeZ);
    leftShellPivot.rotation.set(shellPitch, -shellYaw, hingeZ);
    leftShellPivot.scale.setScalar(shellScale);
    leftShellPivot.visible = shellOpacity > 0.01;

    rightShellPivot.position.set(spreadRight, STEM_PIVOT_Y + dropY, recedeZ);
    rightShellPivot.rotation.set(-shellPitch * 0.5, shellYaw, -hingeZ);
    rightShellPivot.scale.setScalar(shellScale);
    rightShellPivot.visible = shellOpacity > 0.01;

    /* --- 2. Central Kernel + 3D Papery Red-Skin Peel Layer --- */
    const kernelScale = THREE.MathUtils.lerp(0.84, 0.98, crackT) + detachT * 0.06 + heroT * 0.07;
    const kernelZ = THREE.MathUtils.lerp(-0.08, 0.14, crackT) + detachT * 0.20 + heroT * 0.16;
    const kernelY = THREE.MathUtils.lerp(-0.03, 0.02, crackT);
    kernelPivot.position.set(0, kernelY, kernelZ);
    kernelPivot.scale.setScalar(kernelScale);
    kernelPivot.visible = p > 0.04;
    kernelPivot.rotation.y =
      (detachT - 0.3) * 0.12 + (reduceMotion ? 0 : Math.sin(t * 0.68) * 0.06 * (detachT * 0.4 + heroT * 0.6));

    const redSkinOpacity = 1.0 - smoothstep(0.81, 0.94, p);
    if (redPeelLeftMesh) redPeelLeftMesh.visible = redSkinOpacity > 0.01;
    if (redPeelRightMesh) redPeelRightMesh.visible = redSkinOpacity > 0.01;

    /* --- 3. Delicate Papery Red-Skin Flakes Bursting During Stage 04 Peeling --- */
    const flakeBurst = smoothstep(0.56, 0.88, p);
    const flakeAlpha = smoothstep(0.56, 0.68, p) * (1.0 - smoothstep(0.84, 0.95, p));
    flakeMatPlum.opacity = flakeAlpha * 0.82;
    flakeMatRose.opacity = flakeAlpha * 0.68;
    flakeGroup.visible = flakeAlpha > 0.01;
    if (flakeGroup.visible) {
      for (let i = 0; i < flakes.length; i++) {
        const f = flakes[i];
        const dist = 0.24 + flakeBurst * 1.05;
        f.mesh.position.set(
          f.dirX * dist,
          f.dirY * dist - flakeBurst * 0.22 + Math.sin(t * 0.9 + i) * 0.03,
          f.dirZ * dist
        );
        f.mesh.rotation.set(t * 0.38 * f.spinX + flakeBurst * 1.5, t * 0.44 * f.spinY, flakeBurst * 0.9);
      }
    }

    /* --- 4. Update Fast Uniforms --- */
    lightVec.set(0.45 + state.smoothPX * 0.34, 0.55 - state.smoothPY * 0.24, 0.78).normalize();
    const openness = clamp01(crackT * 0.52 + detachT * 0.48);

    if (leftOuterMat) {
      leftOuterMat.uniforms.uLightDir.value.copy(lightVec);
      leftOuterMat.uniforms.uOpacity.value = shellOpacity;
      leftOuterMat.uniforms.uCrackGlow.value = crackT * (1.0 - shellExitT);
    }
    if (rightOuterMat) {
      rightOuterMat.uniforms.uLightDir.value.copy(lightVec);
      rightOuterMat.uniforms.uOpacity.value = shellOpacity;
      rightOuterMat.uniforms.uCrackGlow.value = crackT * (1.0 - shellExitT);
    }
    if (innerCupMat) {
      innerCupMat.uniforms.uLightDir.value.copy(lightVec);
      innerCupMat.uniforms.uOpacity.value = shellOpacity;
    }
    if (redPeelLeftMat) {
      redPeelLeftMat.uniforms.uLightDir.value.copy(lightVec);
      redPeelLeftMat.uniforms.uPeel.value = peelT;
      redPeelLeftMat.uniforms.uDetach.value = peelDetachT;
      redPeelLeftMat.uniforms.uOpacity.value = redSkinOpacity;
      redPeelLeftMat.uniforms.uOpenness.value = openness;
      redPeelLeftMat.uniforms.uTime.value = reduceMotion ? 0 : t;
    }
    if (redPeelRightMat) {
      redPeelRightMat.uniforms.uLightDir.value.copy(lightVec);
      redPeelRightMat.uniforms.uPeel.value = peelT;
      redPeelRightMat.uniforms.uDetach.value = peelDetachT;
      redPeelRightMat.uniforms.uOpacity.value = redSkinOpacity;
      redPeelRightMat.uniforms.uOpenness.value = openness;
      redPeelRightMat.uniforms.uTime.value = reduceMotion ? 0 : t;
    }
    if (greenKernelMat) {
      greenKernelMat.uniforms.uLightDir.value.copy(lightVec);
      greenKernelMat.uniforms.uReveal.value = clamp01(peelT * 0.75 + heroT * 0.25);
    }

    haloUniforms.uRedPhase.value = clamp01(crackT * 0.45 + detachT * 0.55) * (1.0 - peelT * 0.85);
    haloUniforms.uGreenPhase.value = clamp01(peelT * 0.65 + heroT * 0.35);

    if (!reduceMotion) {
      dustField.rotation.y = -t * 0.016 + p * 0.26;
      dustField.position.x = state.smoothX * 0.38;
    }

    renderer.render(scene, camera);
    scheduleNext();
  }

  function resize() {
    const w = Math.max(1, window.innerWidth || 1440);
    const h = Math.max(1, window.innerHeight || 900);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 640 ? 40 : 34;
    camera.updateProjectionMatrix();
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

  tick();

  return {
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
    dispose() {
      disposed = true;
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
      disposables.forEach((d) => d && typeof d.dispose === 'function' && d.dispose());
      haloPlane.geometry.dispose();
      haloPlane.material.dispose();
      flakeGeo.dispose();
      flakeMatPlum.dispose();
      flakeMatRose.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      bokehTex.dispose();
      renderer.dispose();
    },
  };
}
