/* ==========================================================================
   مغزدانه — pistachio-model.js (Phase 6 Photorealistic Iranian Pistachio)
   بازطراحی واقع‌گرایانه در سطح عکاسی ماکرو استودیویی:
   - بافت‌دهی با نویز ایزوتروپیک سه‌بعدی (3D Value/FBM Noise) روی مختصات واقعی سطح
     ← حذف کامل خطوط عمودی/سیرمانند و جمع‌شدگی UV در قطب‌ها
   - پوسته واقعی استخوانی-عاجی مات (Calcified Ivory-Beige) با لکه ساقه‌گاه در پایه،
     درز طبیعی بسته، لبه پخ‌دار واقعی و آستر داخلی کرم-صورتی (Pellicle Blush)
   - مغز پسته آناتومیک دو‌لپه‌ای با انحنای طبیعی، رنگ سبز پسته‌ای اشتهاآور و
     پوست نازک کاغذی عنابی-ارغوانی (Testa) با لبه‌های پوسته‌شده واقعی
   - انیمیشن پیوسته ۴ مرحله‌ای: بسته (۰٪) ← خندانی طبیعی (۳۵٪) ← جدایی پوسته (۷۰٪) ← مغز خالص (۱۰۰٪)
   ========================================================================== */

import * as THREE from './three.module.js';

/* ---------- True Isotropic 3D Value Noise & Domain-Warped FBM (Zero UV Pole Stretching!) ---------- */
function hash3(ix, iy, iz, seed) {
  let n =
    Math.imul(ix, 374761393) +
    Math.imul(iy, 668265263) +
    Math.imul(iz, 2147483647) +
    Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function noise3(x, y, z, seed = 19) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);

  const c000 = hash3(ix, iy, iz, seed);
  const c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed);
  const c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed);
  const c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed);
  const c111 = hash3(ix + 1, iy + 1, iz + 1, seed);

  const x00 = lerp(c000, c100, fx);
  const x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx);
  const x11 = lerp(c011, c111, fx);

  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function fbm3(x, y, z, octaves = 4, seed = 19) {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise3(x * freq, y * freq, z * freq, seed + i * 37);
    norm += amp;
    amp *= 0.5;
    freq *= 2.04;
  }
  return val / norm;
}

/* ---------- Four Authentic Iranian Pistachio Varieties (Natural Edible Photography Palette) ---------- */
export const PISTACHIO_VARIETIES = {
  akbari: {
    label: 'اکبری ممتاز',
    origin: 'رفسنجان',
    kernelScale: [0.88, 1.15, 0.86],
    shellScale: [0.92, 1.14, 0.91],
    fleshBase: [132, 182, 56],     // Appetizing Rafsanjan emerald-chartreuse pistachio meat
    fleshLight: [188, 222, 88],    // Creamy sunlit inner pistachio green
    fleshDeep: [74, 122, 34],      // Rich chlorophyll depth
    testaMain: [96, 40, 58],       // Deep velvety Rafsanjan plum-burgundy papery testa
    testaLight: [148, 84, 92],     // Dusty sun-dried rose papery edge
    testaCover: 0.46,
    roastWarmth: 0.0,
    roughFlesh: 0.46,
    roughTesta: 0.86,
  },
  kallehghoochi: {
    label: 'کله‌قوچی',
    origin: 'یزد و رفسنجان',
    kernelScale: [1.06, 0.98, 1.02],
    shellScale: [1.08, 0.98, 1.04],
    fleshBase: [146, 186, 60],
    fleshLight: [204, 226, 94],
    fleshDeep: [84, 126, 38],
    testaMain: [104, 46, 56],
    testaLight: [158, 96, 96],
    testaCover: 0.38,
    roastWarmth: 0.0,
    roughFlesh: 0.44,
    roughTesta: 0.84,
  },
  fandoghi: {
    label: 'فندقی',
    origin: 'دامغان و رفسنجان',
    kernelScale: [0.98, 0.92, 0.96],
    shellScale: [1.00, 0.93, 0.98],
    fleshBase: [110, 178, 60],
    fleshLight: [172, 220, 88],
    fleshDeep: [56, 118, 36],
    testaMain: [106, 48, 62],
    testaLight: [162, 102, 106],
    testaCover: 0.30,
    roastWarmth: 0.0,
    roughFlesh: 0.48,
    roughTesta: 0.84,
  },
  roasted: {
    label: 'برشته زعفرانی',
    origin: 'برشته‌کاری روز',
    kernelScale: [0.92, 1.10, 0.90],
    shellScale: [0.95, 1.10, 0.94],
    fleshBase: [162, 174, 54],
    fleshLight: [226, 202, 82],
    fleshDeep: [106, 116, 36],
    testaMain: [110, 52, 36],
    testaLight: [174, 112, 70],
    testaCover: 0.40,
    roastWarmth: 0.48,
    roughFlesh: 0.38,
    roughTesta: 0.76,
  },
};

/* ---------- Heightfield → Smooth Tangent-Space Normal Map (Sobel) ---------- */
function heightToNormalTexture(heightData, size, strength, maxAniso) {
  const rgba = new Uint8Array(size * size * 4);
  const sample = (x, y) => {
    const wx = ((x % size) + size) % size;
    const wy = y < 0 ? 0 : y >= size ? size - 1 : y;
    return heightData[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sample(x - 1, y - 1);
      const t = sample(x, y - 1);
      const tr = sample(x + 1, y - 1);
      const l = sample(x - 1, y);
      const r = sample(x + 1, y);
      const bl = sample(x - 1, y + 1);
      const b = sample(x, y + 1);
      const br = sample(x + 1, y + 1);

      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);

      let nx = -dx * strength;
      let ny = -dy * strength;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      rgba[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      rgba[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      rgba[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

/* ---------- Bake Photorealistic Isotropic 3D-Noise Kernel PBR Maps (Zero Pole Lines!) ---------- */
function bakeKernelPBR(cfg, maxAniso, seed = 41) {
  const size = 512;
  const albedo = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1); // 0 = plump rounded base, 1 = tapered crown tip
    const polar = v * Math.PI;
    const sinP = Math.sin(polar);
    const py = -Math.cos(polar) * 1.35;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const az = u * Math.PI * 2; // 0 = ventral front (+Z), PI = dorsal back (-Z)
      // True 3D unit-ellipsoid coordinates -> ZERO pole stretching or garlic stripes!
      const px = sinP * Math.sin(az);
      const pz = sinP * Math.cos(az);

      // Domain warp in 3D space for organic peeling skin contours
      const wx = fbm3(px * 2.3 + 3.1, py * 2.3 + 1.7, pz * 2.3 + 5.2, 3, seed) - 0.5;
      const wy = fbm3(px * 2.3 + 8.3, py * 2.3 + 4.9, pz * 2.3 + 2.1, 3, seed + 17) - 0.5;
      const wz = fbm3(px * 2.3 + 1.5, py * 2.3 + 7.2, pz * 2.3 + 9.4, 3, seed + 31) - 0.5;

      const qx = px + wx * 0.58;
      const qy = py + wy * 0.58;
      const qz = pz + wz * 0.58;

      const macro = fbm3(qx * 2.0, qy * 2.0, qz * 2.0, 4, seed + 7);
      const dimple = fbm3(px * 7.2 + wx * 0.35, py * 7.2, pz * 7.2 + wz * 0.35, 3, seed + 53);
      const micro = fbm3(px * 22.0, py * 22.0, pz * 22.0, 2, seed + 97);

      // Vibrant edible pistachio-green flesh gradient (brightest on sunlit shoulders & cheeks)
      const lightMix = smoothstep(0.26, 0.78, macro * 0.7 + v * 0.35);
      const deepMix = smoothstep(0.64, 0.22, macro);

      let r = lerp(cfg.fleshBase[0], cfg.fleshLight[0], lightMix);
      let g = lerp(cfg.fleshBase[1], cfg.fleshLight[1], lightMix);
      let b = lerp(cfg.fleshBase[2], cfg.fleshLight[2], lightMix);

      r = lerp(r, cfg.fleshDeep[0], deepMix * 0.32);
      g = lerp(g, cfg.fleshDeep[1], deepMix * 0.32);
      b = lerp(b, cfg.fleshDeep[2], deepMix * 0.32);

      // Warm golden saffron glaze for roasted variety
      if (cfg.roastWarmth > 0) {
        const toast = smoothstep(0.28, 0.84, macro * 0.6 + v * 0.45) * cfg.roastWarmth;
        r = lerp(r, 224, toast * 0.50);
        g = lerp(g, 182, toast * 0.38);
        b = lerp(b, 72, toast * 0.30);
      }

      // Authentic Rafsanjan plum-purple papery testa skin:
      // Cloaks the lower base, dorsal back, and flanks organically, tearing away cleanly across
      // the upper cheeks and crown to expose lush bright emerald meat (never a horizontal stripe!)
      const testaNoise = fbm3(qx * 2.5 + 4.0, qy * 2.2 + 2.0, qz * 2.5 + 6.0, 4, seed + 131);
      const fineTear = fbm3(px * 10.5, py * 10.5, pz * 10.5, 3, seed + 157);
      const baseBias = (1.0 - smoothstep(0.18, 0.76, v)) * 0.42; // Naturally thicker toward base!
      const dorsalBias = smoothstep(-0.55, 0.80, -pz) * 0.30;    // Wraps around back/flanks
      const field = testaNoise * 0.68 + fineTear * 0.14 + baseBias + dorsalBias;
      const threshold = 0.86 - cfg.testaCover * 0.56;
      const testaMask = smoothstep(threshold - 0.055, threshold + 0.055, field);

      // Delicate pale-beige papery edge right where the thin testa flakes off the green flesh
      const peelEdge = smoothstep(0.06, 0.34, testaMask) * (1.0 - smoothstep(0.56, 0.90, testaMask));
      const skinVar = fbm3(px * 11.0, py * 11.0, pz * 11.0, 3, seed + 173);

      let tr = lerp(cfg.testaMain[0], cfg.testaLight[0], skinVar * 0.68 + peelEdge * 0.40);
      let tg = lerp(cfg.testaMain[1], cfg.testaLight[1], skinVar * 0.68 + peelEdge * 0.40);
      let tb = lerp(cfg.testaMain[2], cfg.testaLight[2], skinVar * 0.68 + peelEdge * 0.40);

      // Fine flaky paper-tan edge highlight
      tr = lerp(tr, 212, peelEdge * 0.34);
      tg = lerp(tg, 182, peelEdge * 0.34);
      tb = lerp(tb, 152, peelEdge * 0.34);

      r = lerp(r, tr, testaMask * 0.92);
      g = lerp(g, tg, testaMask * 0.92);
      b = lerp(b, tb, testaMask * 0.92);

      // Subtle natural ventral cotyledon cleft shading + warm tan hilum dot at very base
      const seamDist = Math.min(u, 1 - u);
      const seamShadow = 1.0 - (1.0 - smoothstep(0.0, 0.036, seamDist)) * 0.22 * sinP;
      const hilum = (1.0 - smoothstep(0.0, 0.07, v)) * 0.35;
      r = lerp(r, 178, hilum);
      g = lerp(g, 146, hilum);
      b = lerp(b, 108, hilum);

      const idx = (y * size + x) * 4;
      albedo[idx] = Math.round(clamp01((r * seamShadow) / 255) * 255);
      albedo[idx + 1] = Math.round(clamp01((g * seamShadow) / 255) * 255);
      albedo[idx + 2] = Math.round(clamp01((b * seamShadow) / 255) * 255);
      albedo[idx + 3] = 255;

      // Per-pixel roughness: crisp waxy-matte pistachio meat (~0.46) vs dry papery testa (~0.86)
      const rgVal = lerp(cfg.roughFlesh, cfg.roughTesta, testaMask) + (micro - 0.5) * 0.07;
      const rgByte = Math.round(clamp01(rgVal) * 255);
      rough[idx] = rgByte;
      rough[idx + 1] = rgByte;
      rough[idx + 2] = rgByte;
      rough[idx + 3] = 255;

      // Delicate organic nut dimples + fine papery wrinkles on testa + clean cleft groove
      const paperWrinkle = testaMask * (skinVar * 0.22 + fineTear * 0.14);
      height[y * size + x] =
        dimple * 0.30 +
        micro * 0.12 +
        testaMask * 0.18 +
        paperWrinkle -
        (1.0 - seamShadow) * 0.42;
    }
  }

  const map = new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAniso;
  map.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(rough, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  roughnessMap.anisotropy = maxAniso;
  roughnessMap.needsUpdate = true;

  const normalMap = heightToNormalTexture(height, size, 1.55, maxAniso);
  return { map, roughnessMap, normalMap };
}

/* ---------- Bake Photorealistic Smooth Calcified Bone-Ivory Shell PBR Maps ---------- */
function bakeShellPBR(maxAniso) {
  const size = 512;
  const outerAlb = new Uint8Array(size * size * 4);
  const outerRough = new Uint8Array(size * size * 4);
  const outerHeight = new Float32Array(size * size);
  const innerAlb = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    const v = y / (size - 1); // 0 = stem base, 1 = curved beak tip
    const polar = v * Math.PI;
    const sinP = Math.sin(polar);
    const py = -Math.cos(polar) * 1.4;

    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);
      const phi = (u - 0.5) * Math.PI;
      const px = sinP * Math.cos(phi);
      const pz = sinP * Math.sin(phi);

      // Authentic sun-dried Iranian pistachio shell: fine creamy calcified bone with
      // soft warm mottling and delicate micro-striations along the growth axis
      const macro = fbm3(px * 2.4 + 1.2, py * 2.0 + 3.4, pz * 2.4 + 2.1, 3, 211);
      const fineFiber = fbm3(px * 16.0, py * 4.5, pz * 16.0, 3, 239);
      const microPore = fbm3(px * 32.0, py * 32.0, pz * 32.0, 2, 271);

      // Warm creamy bone-ivory palette (#ece0c8 -> #ccb58f) matching studio macro photography
      let r = lerp(238, 206, macro * 0.70 + fineFiber * 0.30);
      let g = lerp(224, 186, macro * 0.70 + fineFiber * 0.30);
      let b = lerp(196, 150, macro * 0.70 + fineFiber * 0.30);

      // Natural toasted-tan base warmth & tiny dark woody pedicel scar at v = 0
      const baseWarm = 1.0 - smoothstep(0.0, 0.26, v);
      const stemScar = 1.0 - smoothstep(0.0, 0.075, v);
      r = lerp(r, 174, baseWarm * 0.36);
      g = lerp(g, 138, baseWarm * 0.38);
      b = lerp(b, 98, baseWarm * 0.42);
      r = lerp(r, 94, stemScar * 0.70);
      g = lerp(g, 68, stemScar * 0.70);
      b = lerp(b, 44, stemScar * 0.70);

      // Subtle darker natural groove tint right at the split seam lip (u -> 1)
      const seamLip = smoothstep(0.90, 1.0, u);
      r = lerp(r, 182, seamLip * 0.35);
      g = lerp(g, 152, seamLip * 0.35);
      b = lerp(b, 114, seamLip * 0.35);

      const mod = 0.96 + fineFiber * 0.07 + (microPore - 0.5) * 0.03;
      const idx = (y * size + x) * 4;
      outerAlb[idx] = Math.round(clamp01((r * mod) / 255) * 255);
      outerAlb[idx + 1] = Math.round(clamp01((g * mod) / 255) * 255);
      outerAlb[idx + 2] = Math.round(clamp01((b * mod) / 255) * 255);
      outerAlb[idx + 3] = 255;

      // Authentic matte eggshell-porcelain roughness (0.74..0.88)
      const rg = Math.round(clamp01(0.74 + (1 - fineFiber) * 0.12 + (microPore - 0.5) * 0.04) * 255);
      outerRough[idx] = rg;
      outerRough[idx + 1] = rg;
      outerRough[idx + 2] = rg;
      outerRough[idx + 3] = 255;

      // Fine natural calcified shell micro-grain
      outerHeight[y * size + x] = fineFiber * 0.36 + macro * 0.24 + microPore * 0.12;

      // Inner concave shell cavity: smooth satin ivory with warm rose-taupe pellicle blush
      const pellicle = smoothstep(0.24, 0.74, macro) * Math.sin(Math.PI * v);
      innerAlb[idx] = Math.round(lerp(236, 178, pellicle * 0.58));
      innerAlb[idx + 1] = Math.round(lerp(218, 138, pellicle * 0.62));
      innerAlb[idx + 2] = Math.round(lerp(186, 122, pellicle * 0.56));
      innerAlb[idx + 3] = 255;
    }
  }

  const outerMap = new THREE.DataTexture(outerAlb, size, size, THREE.RGBAFormat);
  outerMap.colorSpace = THREE.SRGBColorSpace;
  outerMap.wrapS = outerMap.wrapT = THREE.ClampToEdgeWrapping;
  outerMap.anisotropy = maxAniso;
  outerMap.needsUpdate = true;

  const outerRoughnessMap = new THREE.DataTexture(outerRough, size, size, THREE.RGBAFormat);
  outerRoughnessMap.wrapS = outerRoughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  outerRoughnessMap.anisotropy = maxAniso;
  outerRoughnessMap.needsUpdate = true;

  const outerNormalMap = heightToNormalTexture(outerHeight, size, 1.05, maxAniso);

  const innerMap = new THREE.DataTexture(innerAlb, size, size, THREE.RGBAFormat);
  innerMap.colorSpace = THREE.SRGBColorSpace;
  innerMap.wrapS = innerMap.wrapT = THREE.ClampToEdgeWrapping;
  innerMap.anisotropy = maxAniso;
  innerMap.needsUpdate = true;

  return { outerMap, outerRoughnessMap, outerNormalMap, innerMap };
}

/* ---------- Anatomically True Iranian Pistachio Kernel Geometry (STRICT OUTWARD NORMALS!) ---------- */
function buildSculptedKernelGeometry(segsU = 96, segsV = 68) {
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = plump rounded base, 1 = gently tapered crown tip
    const yBase = (v - 0.49) * 1.64;
    const sinV = Math.sin(Math.PI * v);

    // Authentic plump Iranian Akbari kernel silhouette: full lower belly, graceful almond taper
    const dome = Math.pow(sinV, 0.45);
    const belly = 1.0 + 0.17 * Math.sin(Math.PI * Math.pow(v, 0.72));
    const tipSoft = 1.0 - 0.22 * Math.pow(v, 2.2);
    const radiusV = Math.max(dome * 0.54 * belly * tipSoft, 0.0008);

    // Signature subtle curved kidney-arch of a real pistachio kernel
    const spineZ = -0.11 * Math.sin(Math.PI * v) + 0.06 * Math.pow(v, 2.1);

    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const theta = u * Math.PI * 2; // 0 = ventral front (+Z)
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      // Authentic ventral cotyledon suture cleft along +Z face
      const ventral = Math.max(0, cosT);
      const cleft = Math.pow(ventral, 9.0) * 0.072 * sinV;

      // Plump bilateral cotyledon cheeks & softly keeled dorsal spine
      const dorsalKeel = Math.pow(Math.max(0, -cosT), 3.0) * 0.052 * sinV;
      const cheeks = 1.0 + 0.09 * Math.sin(theta * 2.0 - Math.PI * 0.5) * sinV;

      // Subtle 3D-isotropic organic nut contour
      const ux = sinV * sinT;
      const uy = (v - 0.5) * 2.0;
      const uz = sinV * cosT;
      const org = (fbm3(ux * 1.7 + 2.1, uy * 1.7 + 4.3, uz * 1.7 + 1.9, 3, 73) - 0.5) * 0.042 * sinV;

      const x = (radiusV * 0.86 * cheeks + org) * sinT;
      const z = (radiusV * 1.04 + dorsalKeel - cleft + org * 0.75) * cosT + spineZ;

      positions.push(x, yBase, z);
      uvs.push(u, v);
    }
  }

  // Verified outward CCW winding:
  // At theta=0 (+Z), (b - a) = +X and (c - a) = +Y -> (b - a) x (c - a) = +Z (OUTWARD!)
  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- Watertight Closed-Fit Pistachio Clamshell Valve (STRICT OUTWARD NORMALS!) ---------- */
function buildSolidShellValveGeometry(sideSign = 1, segsV = 64, segsA = 44) {
  const rimSteps = 5;
  const ringCount = (segsA + 1) + rimSteps + (segsA + 1) + rimSteps;

  const positions = [];
  const uvs = [];
  const outerIndices = [];
  const innerIndices = [];

  function shellPoint(v, phiNorm, isInner, wallFrac) {
    const y = (v - 0.49) * 1.98;
    const sinV = Math.sin(Math.PI * v);

    // True Iranian Akbari pistachio shell silhouette: plump base, elegant asymmetric beak top
    const dome = Math.pow(sinV, 0.45);
    const belly = 1.0 + 0.14 * Math.sin(Math.PI * Math.pow(v, 0.76));
    const beakTaper = 1.0 - 0.19 * Math.pow(v, 2.4);
    const profile = dome * belly * beakTaper;

    // Gentle real pistachio beak curve toward front near apex
    const beakCurveZ = -0.10 * sinV + 0.10 * Math.pow(v, 2.2);

    // Delicate, photorealistic thin calcified shell wall (~0.058 units, never clunky!)
    const wallThick = 0.058 * Math.pow(sinV, 0.36);
    const effectiveThick = isInner ? wallThick : wallThick * wallFrac;

    // Full snug 180-degree wrap so at stage = 0 the pistachio is AUTHENTICALLY CLOSED
    // with only a razor-thin natural hairline seam!
    const phiMin = -Math.PI * 0.499;
    const phiMax = Math.PI * 0.498;
    const phi = phiMin + phiNorm * (phiMax - phiMin);

    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);

    const rx = Math.max(0.0012, profile * 0.71 - effectiveThick);
    const rz = Math.max(0.0012, profile * 0.83 - effectiveThick);

    const ux = sideSign * sinV * cosP;
    const uy = (v - 0.5) * 2.0;
    const uz = sinV * sinP;
    const ripple = isInner ? 0 : (fbm3(ux * 2.6 + 1.4, uy * 2.6, uz * 2.6 + 3.1, 2, 311) - 0.5) * 0.015 * sinV;

    const yOut = y + (isInner ? (0.5 - v) * 0.09 : 0);
    const x = sideSign * Math.max(0.0005, rx * cosP + ripple);
    const z = rz * sinP + beakCurveZ + ripple * 0.35;

    return [x, yOut, z];
  }

  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV;

    // 1. Outer smooth calcified hull
    for (let ia = 0; ia <= segsA; ia++) {
      const p = ia / segsA;
      const [x, y, z] = shellPoint(v, p, false, 0);
      positions.push(x, y, z);
      uvs.push(p, v);
    }

    // 2. Smooth rounded beveled ventral seam lip
    for (let ir = 1; ir <= rimSteps; ir++) {
      const t = ir / (rimSteps + 1);
      const ang = t * Math.PI;
      const wf = 0.5 - 0.5 * Math.cos(ang);
      const bulge = Math.sin(ang) * 0.008 * Math.sin(Math.PI * v);
      const [x, y, z] = shellPoint(v, 1.0, false, wf);
      positions.push(x, y, z + bulge);
      uvs.push(1.0, v);
    }

    // 3. Inner satin-ivory concave bowl
    for (let ia = segsA; ia >= 0; ia--) {
      const p = ia / segsA;
      const [x, y, z] = shellPoint(v, p, true, 1);
      positions.push(x, y, z);
      uvs.push(p, v);
    }

    // 4. Rounded dorsal hinge rim
    for (let ir = 1; ir <= rimSteps; ir++) {
      const t = ir / (rimSteps + 1);
      const ang = t * Math.PI;
      const wf = 0.5 + 0.5 * Math.cos(ang);
      const bulge = Math.sin(ang) * 0.008 * Math.sin(Math.PI * v);
      const [x, y, z] = shellPoint(v, 0.0, false, wf);
      positions.push(x, y, z - bulge);
      uvs.push(0.0, v);
    }
  }

  const innerStart = (segsA + 1) + rimSteps;
  const innerEnd = innerStart + segsA;

  // Verified outward CCW winding:
  // For sideSign = +1 at phi=0 (+X): (b - a) = +Z, (c - a) = +Y -> (c - a) x (b - a) = +X (OUTWARD!)
  // Therefore sideSign > 0 uses (a, c, b, b, c, d), and sideSign < 0 uses (a, b, c, b, d, c)!
  for (let iv = 0; iv < segsV; iv++) {
    const rowA = iv * ringCount;
    const rowB = (iv + 1) * ringCount;
    for (let ir = 0; ir < ringCount; ir++) {
      const irNext = (ir + 1) % ringCount;
      const a = rowA + ir;
      const b = rowA + irNext;
      const c = rowB + ir;
      const d = rowB + irNext;

      const isInnerFace = ir >= innerStart && ir < innerEnd;
      const target = isInnerFace ? innerIndices : outerIndices;

      if (sideSign > 0) target.push(a, c, b, b, c, d);
      else target.push(a, b, c, b, d, c);
    }
  }

  const combined = [...outerIndices, ...innerIndices];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(combined);
  geo.addGroup(0, outerIndices.length, 0);
  geo.addGroup(outerIndices.length, innerIndices.length, 1);
  geo.computeVertexNormals();
  return geo;
}

export function createSoftBokehTexture() {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  g.addColorStop(0.32, 'rgba(255, 244, 212, 0.65)');
  g.addColorStop(0.68, 'rgba(255, 224, 150, 0.14)');
  g.addColorStop(1, 'rgba(255, 224, 150, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- Singular Luxury Hero Pistachio Assembly (Zero clutter!) ---------- */
export function createPistachioAssembly(renderer, isSoftwareGl) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;

  const varietyMats = {};
  let seedOffset = 41;
  for (const [key, cfg] of Object.entries(PISTACHIO_VARIETIES)) {
    const tex = bakeKernelPBR(cfg, maxAniso, seedOffset);
    seedOffset += 19;
    varietyMats[key] = {
      cfg,
      tex,
      mat: new THREE.MeshPhysicalMaterial({
        map: tex.map,
        normalMap: tex.normalMap,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughnessMap: tex.roughnessMap,
        roughness: 1.0,
        metalness: 0.0,
        clearcoat: 0.08,
        clearcoatRoughness: 0.48,
        sheen: 0.22,
        sheenRoughness: 0.72,
        sheenColor: new THREE.Color('#d2eb9e'),
        envMapIntensity: 0.85,
      }),
    };
  }

  // Smooth matte calcified bone-ivory shell — opaque during Acts 0–2 (clean depth!), smooth fade only on exit
  const shellTex = bakeShellPBR(maxAniso);
  const shellOuterMat = new THREE.MeshStandardMaterial({
    map: shellTex.outerMap,
    normalMap: shellTex.outerNormalMap,
    normalScale: new THREE.Vector2(0.82, 0.82),
    roughnessMap: shellTex.outerRoughnessMap,
    roughness: 1.0,
    metalness: 0.0,
    envMapIntensity: 0.45,
    transparent: false,
    opacity: 1.0,
  });

  const shellInnerMat = new THREE.MeshStandardMaterial({
    map: shellTex.innerMap,
    roughness: 0.56,
    metalness: 0.0,
    envMapIntensity: 0.48,
    transparent: false,
    opacity: 1.0,
  });

  const root = new THREE.Group();
  const nutGroup = new THREE.Group();
  root.add(nutGroup);

  const heroTilt = new THREE.Group();
  heroTilt.rotation.set(0.08, 0.0, -0.28);
  nutGroup.add(heroTilt);

  const kernelGeo = buildSculptedKernelGeometry(96, 68);
  const kernelMesh = new THREE.Mesh(kernelGeo, varietyMats.akbari.mat);
  kernelMesh.position.set(0, 0.0, 0.02);
  kernelMesh.castShadow = !isSoftwareGl;
  kernelMesh.receiveShadow = !isSoftwareGl;
  heroTilt.add(kernelMesh);

  const shellGeoRight = buildSolidShellValveGeometry(1, 64, 44);
  const shellGeoLeft = buildSolidShellValveGeometry(-1, 64, 44);

  const rightHinge = new THREE.Group();
  rightHinge.position.set(0, -0.54, -0.52);
  const shellRight = new THREE.Mesh(shellGeoRight, [shellOuterMat, shellInnerMat]);
  shellRight.position.set(0, 0.54, 0.52);
  shellRight.castShadow = !isSoftwareGl;
  shellRight.receiveShadow = !isSoftwareGl;
  rightHinge.add(shellRight);

  const leftHinge = new THREE.Group();
  leftHinge.position.set(0, -0.54, -0.52);
  const shellLeft = new THREE.Mesh(shellGeoLeft, [shellOuterMat, shellInnerMat]);
  shellLeft.position.set(0, 0.54, 0.52);
  shellLeft.castShadow = !isSoftwareGl;
  shellLeft.receiveShadow = !isSoftwareGl;
  leftHinge.add(shellLeft);

  const shellGroup = new THREE.Group();
  shellGroup.add(rightHinge, leftHinge);
  heroTilt.add(shellGroup);

  let currentVariety = 'akbari';
  const curKScale = new THREE.Vector3(...PISTACHIO_VARIETIES.akbari.kernelScale);
  const curSScale = new THREE.Vector3(...PISTACHIO_VARIETIES.akbari.shellScale);

  return {
    root,
    nutGroup,
    heroTilt,
    kernelMesh,
    shellRight,
    shellLeft,

    setVariety(key) {
      if (!varietyMats[key]) return;
      currentVariety = key;
      kernelMesh.material = varietyMats[key].mat;
    },

    /* stage in [0..1]:
       0.00 -> 0.12 : Authentically CLOSED calcified pistachio with crisp hairline seam
       0.12 -> 0.44 : Natural Iranian "خندان" smiling crack revealing emerald-plum kernel inside
       0.44 -> 0.72 : Clean 3D shell detachment — curved halves glide apart and tumble back
       0.66 -> 0.84 : Smooth opacity dissolve to 0% -> Act 3 showcases PURE PEELED KERNEL with zero ghosting! */
    update(dt, elapsed, stage) {
      const cfg = PISTACHIO_VARIETIES[currentVariety];

      curKScale.x = THREE.MathUtils.damp(curKScale.x, cfg.kernelScale[0], 5.5, dt);
      curKScale.y = THREE.MathUtils.damp(curKScale.y, cfg.kernelScale[1], 5.5, dt);
      curKScale.z = THREE.MathUtils.damp(curKScale.z, cfg.kernelScale[2], 5.5, dt);

      curSScale.x = THREE.MathUtils.damp(curSScale.x, cfg.shellScale[0], 5.5, dt);
      curSScale.y = THREE.MathUtils.damp(curSScale.y, cfg.shellScale[1], 5.5, dt);
      curSScale.z = THREE.MathUtils.damp(curSScale.z, cfg.shellScale[2], 5.5, dt);

      const crackT = smoothstep(0.06, 0.44, stage);       // Closed -> Smiling crack
      const releaseT = smoothstep(0.42, 0.76, stage);     // Shells unhinge & peel away cleanly
      const pureKernelT = smoothstep(0.66, 0.83, stage);  // Shells fully vanish BEFORE Act 3 lands!

      // Subtle micro-crack tension vibration right as shell starts splitting
      const tensionBand = Math.sin(clamp01((stage - 0.06) / 0.16) * Math.PI);
      const microShake = tensionBand * Math.sin(elapsed * 42.0) * 0.006;

      // Flush closed at stage = 0 (smileYaw = 0.005 rad!), opening naturally along dorsal hinge
      const smileYaw = 0.005 + crackT * 0.42 + releaseT * 0.34;
      const hingeSplay = crackT * 0.12 + releaseT * 0.28;
      const tumbleX = releaseT * 0.26;

      // Moderate horizontal drift so shells never crowd headline copy on the opposite side
      const driftX = 0.001 + crackT * 0.06 + releaseT * 0.96;
      const driftY = -0.54 - releaseT * 0.24;
      const driftZ = -0.52 - releaseT * 0.78;

      rightHinge.rotation.set(tumbleX, smileYaw, -hingeSplay + microShake);
      rightHinge.position.set(driftX, driftY, driftZ);

      leftHinge.rotation.set(-tumbleX * 0.7, -smileYaw, hingeSplay - microShake);
      leftHinge.position.set(-driftX, driftY + releaseT * 0.08, driftZ);

      // Opaque depth-sorted rendering while solid; transparent only during final smooth dissolve!
      const shellAlpha = 1.0 - pureKernelT;
      const needAlpha = shellAlpha < 0.995;
      if (shellOuterMat.transparent !== needAlpha) {
        shellOuterMat.transparent = needAlpha;
        shellOuterMat.depthWrite = !needAlpha;
        shellOuterMat.needsUpdate = true;
        shellInnerMat.transparent = needAlpha;
        shellInnerMat.depthWrite = !needAlpha;
        shellInnerMat.needsUpdate = true;
      }
      shellOuterMat.opacity = shellAlpha;
      shellInnerMat.opacity = shellAlpha;
      shellGroup.visible = shellAlpha > 0.01;
      shellGroup.scale.copy(curSScale);

      // Kernel glides gracefully forward and scales up subtly for macro pure-kernel showcase
      const kernelBoost = 1.0 + pureKernelT * 0.18;
      kernelMesh.scale.set(
        curKScale.x * kernelBoost,
        curKScale.y * kernelBoost,
        curKScale.z * kernelBoost
      );
      kernelMesh.position.set(
        0,
        0.0 + releaseT * 0.04,
        0.02 + crackT * 0.09 + releaseT * 0.16
      );
      heroTilt.rotation.z = lerp(-0.28, -0.14, pureKernelT);
    },

    dispose() {
      kernelGeo.dispose();
      shellGeoRight.dispose();
      shellGeoLeft.dispose();
      shellOuterMat.dispose();
      shellInnerMat.dispose();
      Object.values(varietyMats).forEach(v => {
        v.tex.map.dispose();
        v.tex.normalMap.dispose();
        v.tex.roughnessMap.dispose();
        v.mat.dispose();
      });
      shellTex.outerMap.dispose();
      shellTex.outerNormalMap.dispose();
      shellTex.outerRoughnessMap.dispose();
      shellTex.innerMap.dispose();
    },
  };
}
