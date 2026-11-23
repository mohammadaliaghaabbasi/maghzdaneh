/* ==========================================================================
   مغزدانه — cinema-stage.js (Botanical Dry-Skin Flaking 3D Engine · 60fps)
   موتور سه‌بعدی واقعی ۵-مرحله‌ای باز شدن و پوست‌گیری طبیعی پسته اکبری رفسنجان:
   ۰۱ پسته بسته ← ۰۲ خندانی طبیعی (مغز در پوست قرمز کامل) ←
   ۰۳ جدایی پوسته چوبی (مغز در غشای ارغوانی) ←
   ۰۴ ورقه‌ورقه شدن طبیعی غشای خشک و کاغذی قرمز (بدون حالت پارچه‌ای!) ←
   ۰۵ مغز سبز خالص زمردی
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
      return maxC < 26 && chroma < 14;
    }
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
   1. 3D WOODY HALF-SHELL CUP GEOMETRY (36×20)
   ========================================================================== */
function buildHalfShellGeometry(shellData, side, totalHeight = 2.34) {
  const { bounds, xLeftProfile, xRightProfile } = shellData;
  const segV = 48;
  const segU = 26;
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
   2. DUAL-MAPPED VOLUMETRIC 3D KERNEL GEOMETRY (40×28)
   Carries exact aligned UVs for BOTH:
   - `uv`: Pure emerald green kernel photo
   - `aRedUv`: Intact red-skinned kernel photo (mapped to its own silhouette!)
   - `aKernCoord`: Normalized anatomical coordinates (uf, vf) for botanical flaking
   ========================================================================== */
function buildDualMappedKernelGeometry(greenData, redData, totalHeight = 1.92) {
  const { bounds: gb, xLeftProfile: gLeft, xRightProfile: gRight } = greenData;
  const { bounds: rb, xLeftProfile: rLeft, xRightProfile: rRight } = redData;

  const segV = 56;
  const segU = 36;
  const spanGV = Math.max(1e-4, gb.topV - gb.bottomV);
  const spanRV = Math.max(1e-4, rb.topV - rb.bottomV);
  const worldPerUv = totalHeight / spanGV;
  const centerU = gb.centerU;

  const pos = [];
  const uv = [];
  const redUv = [];
  const kernCoord = [];
  const idx = [];

  for (let sideFace = 0; sideFace < 2; sideFace++) {
    const zSign = sideFace === 0 ? 1 : -1;
    const baseVertex = pos.length / 3;

    for (let iv = 0; iv <= segV; iv++) {
      const vf = iv / segV;
      const gLu = sampleProfile(gLeft, vf);
      const gRu = sampleProfile(gRight, vf);
      const gWidthU = Math.max(0.002, gRu - gLu);
      const halfW = gWidthU * 0.5 * worldPerUv;
      const midW = ((gLu + gRu) * 0.5 - centerU) * worldPerUv;
      const endTaper = Math.sin(Math.pow(clamp01(vf), 0.9) * Math.PI);
      const maxZ = Math.max(0.04, halfW * 0.74 * (0.36 + 0.64 * endTaper));

      const rLu = sampleProfile(rLeft, vf);
      const rRu = sampleProfile(rRight, vf);
      const rWidthU = Math.max(0.002, rRu - rLu);

      for (let iu = 0; iu <= segU; iu++) {
        const uf = iu / segU;
        const s = uf * 2 - 1;
        const x = midW + s * halfW;
        const y = (vf - 0.5) * totalHeight;
        const dome = Math.sqrt(Math.max(0, 1 - s * s * 0.96));
        const z = zSign * maxZ * Math.pow(dome, 0.82);

        pos.push(x, y, z);
        uv.push(gLu + uf * gWidthU, gb.bottomV + vf * spanGV);
        redUv.push(rLu + uf * rWidthU, rb.bottomV + vf * spanRV);
        kernCoord.push(uf, vf);
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
  geo.setAttribute('aRedUv', new THREE.Float32BufferAttribute(redUv, 2));
  geo.setAttribute('aKernCoord', new THREE.Float32BufferAttribute(kernCoord, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* ==========================================================================
   BOTANICAL SHADERS (Zero Fabric Curtains — True Dry-Testa Flaking!)
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

        // Subtle macro luminance relief bump so woody pistachio shell pores catch studio light
        float eps = 0.0022;
        float hC = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
        float hX = dot(texture2D(uMap, vUv + vec2(eps, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float hY = dot(texture2D(uMap, vUv + vec2(0.0, eps)).rgb, vec3(0.299, 0.587, 0.114));
        vec3 n = normalize(vNormal + vec3((hC - hX) * 2.1, (hC - hY) * 2.1, 0.0));
        vec3 v = normalize(vViewPos);
        vec3 fillDir = normalize(vec3(-0.65, 0.25, 0.55));
        float ndl = max(dot(n, uLightDir), 0.0);
        float fill = max(dot(n, fillDir), 0.0);
        vec3 h = normalize(uLightDir + v);
        float woodySpec = pow(max(dot(n, h), 0.0), 22.0) * 0.065;
        float shading = 0.72 + 0.30 * ndl + 0.08 * fill;
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.2);

        vec3 col = tex.rgb * shading + vec3(0.95, 0.86, 0.68) * (woodySpec + fresnel * (0.20 + uCrackGlow * 0.10));
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

/* ---------- Organic Botanical Dry-Skin Delamination Kernel Shader ---------- */
function createBotanicalFlakingKernelMaterial(redTex, greenTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRedMap: { value: redTex },
      uGreenMap: { value: greenTex },
      uLightDir: { value: new THREE.Vector3(0.45, 0.55, 0.78).normalize() },
      uPeel: { value: 0.0 },      // 0 = 100% intact red skin, 1 = 100% pure emerald kernel
      uOpenness: { value: 0.0 },  // 0 = shadowed inside shell cavity, 1 = open studio light
      uHero: { value: 0.0 },      // Stage 05 studio emerald sheen
    },
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    vertexShader: `
      attribute vec2 aRedUv;
      attribute vec2 aKernCoord;
      varying vec2 vGreenUv;
      varying vec2 vRedUv;
      varying vec2 vKernCoord;
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vGreenUv = uv;
        vRedUv = aRedUv;
        vKernCoord = aKernCoord;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPos.xyz;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uRedMap;
      uniform sampler2D uGreenMap;
      uniform vec3 uLightDir;
      uniform float uPeel;
      uniform float uOpenness;
      uniform float uHero;

      varying vec2 vGreenUv;
      varying vec2 vRedUv;
      varying vec2 vKernCoord;
      varying vec3 vNormal;
      varying vec3 vViewPos;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 34.5);
        return fract(p.x * p.y);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash21(i);
        float b = hash21(i + vec2(1.0, 0.0));
        float c = hash21(i + vec2(0.0, 1.0));
        float d = hash21(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      float fbm(vec2 p) {
        float val = 0.0;
        float amp = 0.52;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          val += amp * vnoise(p);
          p = rot * p * 2.08 + vec2(13.7, 7.3);
          amp *= 0.5;
        }
        return val;
      }

      void main() {
        vec4 gTex = texture2D(uGreenMap, vGreenUv);
        vec4 rTex = texture2D(uRedMap, vRedUv);
        float alpha = max(gTex.a, rTex.a * (1.0 - smoothstep(0.65, 0.98, uPeel)));
        if (gTex.a < 0.08) discard;

        vec3 v = normalize(vViewPos);
        float eps = 0.0020;
        float gHC = dot(gTex.rgb, vec3(0.299, 0.587, 0.114));
        float gHX = dot(texture2D(uGreenMap, vGreenUv + vec2(eps, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float gHY = dot(texture2D(uGreenMap, vGreenUv + vec2(0.0, eps)).rgb, vec3(0.299, 0.587, 0.114));
        float rHC = dot(rTex.rgb, vec3(0.299, 0.587, 0.114));
        float rHX = dot(texture2D(uRedMap, vRedUv + vec2(eps, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
        float rHY = dot(texture2D(uRedMap, vRedUv + vec2(0.0, eps)).rgb, vec3(0.299, 0.587, 0.114));

        // Organic botanical flaking map:
        // Dry pistachio testa cracks & flakes from top crown + raised ridges first,
        // leaving natural ragged dry-skin islands along the creases before clearing completely!
        vec2 kc = vKernCoord;
        float nCoarse = fbm(kc * vec2(4.4, 5.2));
        float nFine = fbm(kc * vec2(16.0, 18.0) + vec2(3.1, 1.7));
        float ridgeBias = (1.0 - abs(kc.x - 0.5) * 1.45) * 0.14;
        float topToBottom = (1.0 - kc.y) * 0.62;
        float flakeOrder = clamp(topToBottom + nCoarse * 0.44 + (nFine - 0.5) * 0.14 - ridgeBias + 0.06, 0.0, 1.0);

        // uPeel sweeps smoothly from 0 -> 1.08 so 0 = 100% red skin, 1 = 0% red skin
        float sweep = uPeel * 1.18 - 0.06;
        float dist = flakeOrder - sweep;

        // Sharp organic papery edge (not a blurry crossfade!)
        float skinMask = smoothstep(-0.018, 0.022, dist);
        if (uPeel <= 0.002) skinMask = 1.0;
        if (uPeel >= 0.995) skinMask = 0.0;

        vec3 nG = normalize(vNormal + vec3((gHC - gHX) * 1.85, (gHC - gHY) * 1.85, 0.0));
        vec3 nR = normalize(vNormal + vec3((rHC - rHX) * 2.20, (rHC - rHY) * 2.20, 0.0));
        vec3 n = normalize(mix(nG, nR, skinMask));
        vec3 fillDir = normalize(vec3(-0.62, 0.22, 0.58));
        float ndl = max(dot(n, uLightDir), 0.0);
        float fill = max(dot(n, fillDir), 0.0);
        vec3 h = normalize(uLightDir + v);
        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.1);

        // Crisp lifted dry papery edge lip (thin warm burgundy-tan fibrous margin of natural pistachio testa)
        float peelActive = smoothstep(0.005, 0.06, uPeel) * (1.0 - smoothstep(0.92, 0.995, uPeel));
        float paperyLip = smoothstep(0.024, 0.004, abs(dist - 0.009)) * smoothstep(-0.004, 0.010, dist) * peelActive;
        // Subtle contact micro-shadow cast onto the exposed emerald green just under the dry skin edge
        float underShadow = smoothstep(-0.048, -0.004, dist) * (1.0 - smoothstep(-0.006, 0.012, dist)) * peelActive;

        // Cavity shading when nested inside the woody shell (Stages 01–02)
        float sideDist = abs(kc.x - 0.5) * 2.0;
        float cavity = mix(1.0 - smoothstep(0.14, 0.82, sideDist) * 0.54, 1.0, smoothstep(0.15, 0.72, uOpenness));
        float topLit = mix(0.52 + 0.48 * smoothstep(0.22, 0.85, kc.y), 1.0, smoothstep(0.18, 0.68, uOpenness));

        // 1. Matte velvety red-plum pistachio skin color
        vec3 redCol = rTex.rgb * (0.74 + 0.28 * ndl + 0.07 * fill) * cavity * topLit;
        // Subtle dry fibrous tan-burgundy margin where thin papery skin fractures
        vec3 dryEdgeTone = mix(rTex.rgb * 1.15, vec3(0.62, 0.40, 0.34), 0.38);
        redCol = mix(redCol, dryEdgeTone * (0.88 + 0.22 * ndl), paperyLip * 0.72);
        redCol += vec3(0.70, 0.36, 0.42) * fresnel * 0.14 * uOpenness;

        // 2. Vivid radiant emerald green kernel color with subtle organic satin sheen
        float greenSpec = pow(max(dot(n, h), 0.0), 38.0) * (0.09 + 0.15 * uHero);
        vec3 greenCol = gTex.rgb * (0.76 + 0.29 * ndl + 0.08 * fill) * (1.0 - underShadow * 0.36);
        greenCol += vec3(0.80, 0.97, 0.50) * greenSpec;
        greenCol += vec3(0.36, 0.72, 0.26) * fresnel * (0.14 + 0.13 * uHero);

        vec3 finalCol = mix(greenCol, redCol, skinMask);
        gl_FragColor = vec4(finalCol, gTex.a);
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
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(devicePixelRatio || 1, 2.0));

  const initW = Math.max(1, window.innerWidth || 1440);
  const initH = Math.max(1, window.innerHeight || 900);
  renderer.setSize(initW, initH, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#060907');

  const camera = new THREE.PerspectiveCamera(34, initW / initH, 0.1, 40);
  camera.position.set(0, 0, 5.65);

  /* ---------- Soft Studio Radial Back-Halo (Gold → Deep Plum → Emerald) ---------- */
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

  const kernelPivot = new THREE.Group();
  kernelPivot.position.set(0, 0.02, 0.02);
  nutAssembly.add(kernelPivot);

  /* ---------- 34 Natural Crisp Dry Crimson Testa Micro-Flakes (Detach Along Flaking Front) ---------- */
  const flakeGroup = new THREE.Group();
  kernelPivot.add(flakeGroup);
  const flakes = [];

  // Build 3 irregular organic papery flake silhouettes
  function makeFlakeGeo(seed) {
    const s = new THREE.Shape();
    const r1 = 0.032 + (seed % 3) * 0.008;
    const r2 = 0.022 + ((seed + 1) % 3) * 0.007;
    s.moveTo(-r1 * 0.6, -r2 * 0.8);
    s.lineTo(r1 * 0.75, -r2 * 0.55);
    s.lineTo(r1 * 0.95, r2 * 0.35);
    s.lineTo(r1 * 0.1, r2 * 0.95);
    s.lineTo(-r1 * 0.85, r2 * 0.42);
    s.closePath();
    const g = new THREE.ShapeGeometry(s, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const fx = p.getX(i);
      const fy = p.getY(i);
      // Slight crisp dry-leaf cup curvature
      p.setZ(i, (fx * fx * 7.5 + fy * fy * 4.0) * (seed % 2 ? 1 : -1));
    }
    g.computeVertexNormals();
    return g;
  }

  const flakeGeos = [makeFlakeGeo(0), makeFlakeGeo(1), makeFlakeGeo(2)];
  const flakePalette = ['#70243d', '#8e3852', '#a85a68', '#5e1d33'];
  const flakeMats = flakePalette.map(
    (hex) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(hex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })
  );

  const flakeCount = isSoftwareGl ? 18 : 34;
  for (let i = 0; i < flakeCount; i++) {
    const mat = flakeMats[i % flakeMats.length].clone();
    const mesh = new THREE.Mesh(flakeGeos[i % flakeGeos.length], mat);
    // Distribute spawn times evenly across Stage 04 flaking sweep (0.04 → 0.86)
    const triggerPeel = 0.03 + (i / flakeCount) * 0.82;
    const spawnY = 0.72 - (i / flakeCount) * 1.46; // Top crown down to base
    const side = i % 2 === 0 ? 1 : -1;
    const radialSpread = 0.14 + ((i * 37) % 100) / 100 * 0.32;
    const spawnX = side * radialSpread;
    const spawnZ = 0.24 + ((i * 19) % 100) / 100 * 0.16;

    mesh.scale.setScalar(0.55 + ((i * 29) % 100) / 100 * 0.85);
    mesh.visible = false;
    flakeGroup.add(mesh);

    flakes.push({
      mesh,
      mat,
      triggerPeel,
      spawnX,
      spawnY,
      spawnZ,
      velX: side * (0.48 + ((i * 13) % 100) / 100 * 0.78),
      velY: -0.26 - ((i * 23) % 100) / 100 * 0.42,
      velZ: 0.22 + ((i * 17) % 100) / 100 * 0.36,
      rotX: (i % 2 ? 1 : -1) * (2.6 + (i % 4) * 0.9),
      rotY: (i % 3 ? 1 : -1) * (2.2 + (i % 5) * 0.7),
      rotZ: (i % 2 ? -1 : 1) * 1.9,
    });
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

  /* ---------- Async Build of All 3 Real-Photo Layers ---------- */
  let leftOuterMat = null;
  let rightOuterMat = null;
  let innerCupMat = null;
  let kernelMat = null;

  const disposables = [...flakeGeos, ...flakeMats, dustGeo, dustMat, bokehTex];
  let disposed = false;
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

  Promise.all([
    loadImage(STAGE_ASSETS.closedShell),
    loadImage(STAGE_ASSETS.redSkin),
    loadImage(STAGE_ASSETS.pureGreen),
  ])
    .then(async ([shellImg, redImg, greenImg]) => {
      if (disposed) return;
      const texSize = isSoftwareGl ? 768 : 1024;

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
      const dualKernelGeo = buildDualMappedKernelGeometry(greenData, redData, 1.92);

      disposables.push(
        leftParts.outerGeo,
        leftParts.innerGeo,
        rightParts.outerGeo,
        rightParts.innerGeo,
        dualKernelGeo
      );

      leftOuterMat = createOuterShellMaterial(shellData.texture);
      rightOuterMat = createOuterShellMaterial(shellData.texture);
      innerCupMat = createInnerShellCupMaterial();
      kernelMat = createBotanicalFlakingKernelMaterial(redData.texture, greenData.texture);
      disposables.push(leftOuterMat, rightOuterMat, innerCupMat, kernelMat);

      leftShellPivot.add(new THREE.Mesh(leftParts.outerGeo, leftOuterMat));
      leftShellPivot.add(new THREE.Mesh(leftParts.innerGeo, innerCupMat));

      rightShellPivot.add(new THREE.Mesh(rightParts.outerGeo, rightOuterMat));
      rightShellPivot.add(new THREE.Mesh(rightParts.innerGeo, innerCupMat));

      const kernelMesh = new THREE.Mesh(dualKernelGeo, kernelMat);
      kernelMesh.renderOrder = 1;
      kernelPivot.add(kernelMesh);

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

    state.smoothPX = THREE.MathUtils.damp(state.smoothPX, state.pointerX, 2.8, dt);
    state.smoothPY = THREE.MathUtils.damp(state.smoothPY, state.pointerY, 2.8, dt);
    if (!state.dragging) {
      state.targetDragYaw = THREE.MathUtils.damp(state.targetDragYaw, 0, 1.2, dt);
    }
    state.dragYaw = THREE.MathUtils.damp(state.dragYaw, state.targetDragYaw, 4.0, dt);

    const targetStage = state.manualStage !== null ? state.manualStage : state.scrollT;
    state.smoothStage = THREE.MathUtils.damp(state.smoothStage, targetStage, 3.2, dt);

    const p = state.smoothStage;

    /* --- 5-STAGE CHOREOGRAPHY TIMELINE (p ∈ [0.00 → 1.00]) ---
       Stage 01 (0.00): Closed upright woody pistachio shell
       Stage 02 (0.25): Woody shells hinge open → reveals INTACT RED-SKINNED kernel inside
       Stage 03 (0.50): Woody shells detach & glide away → INTACT RED-SKINNED kernel centered
       Stage 04 (0.75): Natural organic dry-skin flaking + 34 3D micro-flakes shedding off kernel
       Stage 05 (1.00): Pure vivid emerald-green kernel in macro spotlight + gateway CTA */
    const crackT = smoothstep(0.08, 0.30, p);
    const detachT = smoothstep(0.30, 0.52, p);
    const shellExitT = smoothstep(0.46, 0.60, p);
    const peelT = smoothstep(0.56, 0.90, p);
    const heroT = smoothstep(0.86, 1.00, p);

    const targetX = isMobile ? 0 : THREE.MathUtils.lerp(-1.14, -1.04, p);
    const targetY = isMobile ? 0.34 : -0.02;
    const targetZ = isMobile ? -0.68 : THREE.MathUtils.lerp(0.0, 0.18, heroT);

    state.smoothX = THREE.MathUtils.damp(state.smoothX, targetX, 3.2, dt);
    state.smoothY = THREE.MathUtils.damp(state.smoothY, targetY, 3.2, dt);
    state.smoothZ = THREE.MathUtils.damp(state.smoothZ, targetZ, 3.2, dt);

    rigRoot.position.set(
      state.smoothX,
      state.smoothY + (reduceMotion ? 0 : Math.sin(t * 0.36) * 0.020),
      state.smoothZ
    );

    const cinemaYaw = Math.sin(p * Math.PI * 1.45) * 0.18 + heroT * 0.08;
    const cinemaPitch = Math.sin(p * Math.PI) * 0.036;
    nutAssembly.rotation.y = cinemaYaw + state.smoothPX * 0.20 + state.dragYaw;
    nutAssembly.rotation.x = cinemaPitch + state.smoothPY * 0.09;
    nutAssembly.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.24) * 0.007;

    /* --- 1. Left & Right Woody Half-Shells --- */
    const hingeZ = crackT * 0.25 + detachT * 0.15 + shellExitT * 0.16;
    const shellYaw = crackT * 0.36 + detachT * 0.58 + shellExitT * 0.36;
    const shellPitch = detachT * 0.12 + shellExitT * 0.28;
    const spreadLeft = crackT * 0.06 + detachT * 0.72 + shellExitT * 0.48;
    const spreadRight = crackT * 0.06 + detachT * 0.62 + shellExitT * 0.12;
    const dropY = -detachT * 0.08 - shellExitT * 0.92;
    const recedeZ = -crackT * 0.05 - detachT * 0.36 - shellExitT * 1.85;
    const shellScale = 1.0 - shellExitT * 0.28;
    const shellOpacity = 1.0 - smoothstep(0.48, 0.60, p);

    leftShellPivot.position.set(-spreadLeft, STEM_PIVOT_Y + dropY, recedeZ);
    leftShellPivot.rotation.set(shellPitch, -shellYaw, hingeZ);
    leftShellPivot.scale.setScalar(shellScale);
    leftShellPivot.visible = shellOpacity > 0.01;

    rightShellPivot.position.set(spreadRight, STEM_PIVOT_Y + dropY, recedeZ);
    rightShellPivot.rotation.set(-shellPitch * 0.5, shellYaw, -hingeZ);
    rightShellPivot.scale.setScalar(shellScale);
    rightShellPivot.visible = shellOpacity > 0.01;

    /* --- 2. Dual-Mapped Volumetric Kernel (Organic Dry-Skin Flaking) --- */
    const kernelScale = THREE.MathUtils.lerp(0.84, 0.98, crackT) + detachT * 0.06 + heroT * 0.08;
    const kernelZ = THREE.MathUtils.lerp(-0.08, 0.14, crackT) + detachT * 0.20 + heroT * 0.16;
    const kernelY = THREE.MathUtils.lerp(-0.03, 0.02, crackT);
    kernelPivot.position.set(0, kernelY, kernelZ);
    kernelPivot.scale.setScalar(kernelScale);
    kernelPivot.visible = p > 0.04;
    kernelPivot.rotation.y =
      (detachT - 0.3) * 0.12 + (reduceMotion ? 0 : Math.sin(t * 0.68) * 0.055 * (detachT * 0.4 + heroT * 0.6));

    /* --- 3. 34 Dry Crimson Testa Micro-Flakes Shedding Off the Active Flaking Band --- */
    const globalFlakeFade = 1 - smoothstep(0.84, 0.96, peelT);
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      const life = clamp01((peelT - f.triggerPeel) / 0.30);
      if (life <= 0.002 || life >= 0.998 || peelT <= 0.01 || globalFlakeFade <= 0.01) {
        f.mesh.visible = false;
        continue;
      }
      f.mesh.visible = true;
      const easeOut = 1 - Math.pow(1 - life, 2.2);
      const flutter = Math.sin(life * 8.5 + i) * 0.055 * easeOut;
      f.mesh.position.set(
        f.spawnX + f.velX * easeOut + flutter,
        f.spawnY + f.velY * life * life + Math.sin(life * 4.0 + i) * 0.04,
        f.spawnZ + f.velZ * easeOut
      );
      f.mesh.rotation.set(f.rotX * life, f.rotY * life, f.rotZ * life);
      const fadeIn = smoothstep(0.0, 0.12, life);
      const fadeOut = 1 - smoothstep(0.42, 0.98, life);
      f.mat.opacity = fadeIn * fadeOut * globalFlakeFade * 0.92;
    }

    /* --- 4. Studio Lighting & Shader Uniforms --- */
    lightVec.set(0.45 + state.smoothPX * 0.18, 0.55 - state.smoothPY * 0.14, 0.78).normalize();
    if (leftOuterMat) {
      leftOuterMat.uniforms.uOpacity.value = shellOpacity;
      leftOuterMat.uniforms.uCrackGlow.value = crackT;
      leftOuterMat.uniforms.uLightDir.value.copy(lightVec);
    }
    if (rightOuterMat) {
      rightOuterMat.uniforms.uOpacity.value = shellOpacity;
      rightOuterMat.uniforms.uCrackGlow.value = crackT;
      rightOuterMat.uniforms.uLightDir.value.copy(lightVec);
    }
    if (innerCupMat) {
      innerCupMat.uniforms.uOpacity.value = shellOpacity;
      innerCupMat.uniforms.uLightDir.value.copy(lightVec);
    }
    if (kernelMat) {
      kernelMat.uniforms.uPeel.value = peelT;
      kernelMat.uniforms.uOpenness.value = smoothstep(0.10, 0.52, p);
      kernelMat.uniforms.uHero.value = heroT;
      kernelMat.uniforms.uLightDir.value.copy(lightVec);
    }

    haloUniforms.uRedPhase.value = smoothstep(0.24, 0.52, p) * (1 - smoothstep(0.66, 0.90, p));
    haloUniforms.uGreenPhase.value = smoothstep(0.62, 0.94, p);

    dustField.rotation.y = t * 0.008 + p * 0.22;
    dustField.rotation.x = Math.sin(t * 0.14) * 0.04;

    renderer.render(scene, camera);
    scheduleNext();
  }

  function handleResize() {
    const w = Math.max(1, window.innerWidth || 1440);
    const h = Math.max(1, window.innerHeight || 900);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  addEventListener('resize', handleResize);

  const onVisibility = () => {
    if (document.hidden) {
      running = false;
      if (isSoftwareGl) clearTimeout(frameId);
      else cancelAnimationFrame(frameId);
    } else if (!disposed) {
      running = true;
      clock.getDelta();
      scheduleNext();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const onContextLost = (e) => {
    e.preventDefault();
    contextLost = true;
  };
  const onContextRestored = () => {
    contextLost = false;
    clock.getDelta();
    scheduleNext();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  tick();

  return {
    setScrollProgress(val) {
      state.scrollT = clamp01(val);
    },
    setStage(stageOrNull) {
      state.manualStage = stageOrNull === null ? null : clamp01(stageOrNull);
    },
    setPaused(paused) {
      externalPaused = Boolean(paused);
      if (!externalPaused && !disposed) {
        clock.getDelta();
        scheduleNext();
      }
    },
    getProgress() {
      return state.smoothStage;
    },
    dispose() {
      disposed = true;
      running = false;
      if (isSoftwareGl) clearTimeout(frameId);
      else cancelAnimationFrame(frameId);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposables.forEach((d) => d && typeof d.dispose === 'function' && d.dispose());
      flakes.forEach((f) => f.mat && f.mat.dispose());
      renderer.dispose();
    },
  };
}
