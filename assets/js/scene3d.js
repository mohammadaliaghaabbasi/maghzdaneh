/* ============================================================
   مغزدانه — scene3d.js
   صحنه سه‌بعدی هیرو: مغز پسته رویه‌ای + شیدر دانه‌دار + ذرات
   سبک: Lusion/Codrops — WebGL تمام‌صفحه، تیره، سینمایی
   ============================================================ */

import * as THREE from './three.module.js';

export function createHeroScene(canvas, opts = {}) {
  const isMobile = matchMedia('(max-width: 820px)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.75 : 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* ---------------- palette ---------------- */
  const C = {
    bg: new THREE.Color('#0d1a12'),
    green: new THREE.Color('#4fae6f'),
    greenDeep: new THREE.Color('#1f5c39'),
    gold: new THREE.Color('#d4a017'),
    cream: new THREE.Color('#f2ead4'),
  };

  /* ---------------- lights ---------------- */
  scene.add(new THREE.AmbientLight(0x2a4a36, 1.1));
  const key = new THREE.DirectionalLight(0xfff2cf, 2.2);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fae6f, 1.6);
  rim.position.set(-6, -2, -4);
  scene.add(rim);
  const fill = new THREE.PointLight(0xd4a017, 1.2, 30);
  fill.position.set(0, -4, 4);
  scene.add(fill);

  /* ============================================================
     مغز پسته رویه‌ای: دو نیمه بیضوی با شیار
     ============================================================ */
  const kernelGroup = new THREE.Group();
  scene.add(kernelGroup);

  function makeKernelHalf(side) {
    // پروفایل دانه پسته با LatheGeometry: تیز در بالا و پایین، گرد در وسط
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      // شکل بادامی: sin برای قوس + توان برای نوک‌های تیز
      const r = Math.sin(Math.PI * t) ** 0.72 * 0.95;
      pts.push(new THREE.Vector2(Math.max(r, 0.001), (t - 0.5) * 2.5));
    }
    const geo = new THREE.LatheGeometry(pts, 48);
    // فشرده‌سازی محور x تا شکل بیضوی پسته شود
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, pos.getX(i) * 0.78);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: C.green,
      roughness: 0.52,
      metalness: 0.08,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // دو نیمه با شیار وسط
    mesh.rotation.z = side * 0.14;
    mesh.position.x = side * 0.16;
    return mesh;
  }
  const halfA = makeKernelHalf(1);
  const halfB = makeKernelHalf(-1);
  kernelGroup.add(halfA, halfB);

  // شیار مرکزی تیره (خط پوسته داخلی)
  const seamGeo = new THREE.TorusGeometry(0.62, 0.055, 12, 64, Math.PI * 1.9);
  const seam = new THREE.Mesh(seamGeo, new THREE.MeshStandardMaterial({
    color: C.greenDeep, roughness: 0.9
  }));
  seam.scale.set(1.25, 1.35, 0.55);
  kernelGroup.add(seam);

  kernelGroup.rotation.set(0.28, -0.5, 0.12);
  kernelGroup.scale.setScalar(isMobile ? 0.82 : 1);

  /* ============================================================
     پوسته پسته (نیم‌پوسته باز) پشت مغز
     ============================================================ */
  const shellPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = Math.sin(Math.PI * t) ** 0.8 * 1.15;
    shellPts.push(new THREE.Vector2(Math.max(r, 0.001), (t - 0.5) * 2.9));
  }
  const shellGeo = new THREE.LatheGeometry(shellPts, 40, 0, Math.PI);
  const shellPos = shellGeo.attributes.position;
  for (let i = 0; i < shellPos.count; i++) shellPos.setX(i, shellPos.getX(i) * 1.05);
  shellGeo.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c8a86b'), roughness: 0.85, side: THREE.DoubleSide,
  }));
  shell.position.set(0.1, 0, -1.6);
  shell.rotation.set(0.1, 0.7, -0.25);
  shell.scale.setScalar(1.18);
  scene.add(shell);

  /* ============================================================
     ذرات: گرد و غبار طلایی + دانه‌های سبز شناور
     ============================================================ */
  function makeParticles(count, color, size, spread, speed) {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * spread[0];
      arr[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
      arr[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      color, size, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
      sizeAttenuation: true,
    });
    const p = new THREE.Points(g, m);
    p.userData.speed = speed;
    return p;
  }
  const dust = makeParticles(isMobile ? 90 : 220, C.gold, 0.05, [16, 10, 8], 0.12);
  const greens = makeParticles(isMobile ? 50 : 130, C.green, 0.07, [18, 12, 10], 0.2);
  scene.add(dust, greens);

  /* ============================================================
     حلقه‌های مداری (HUD حس استودیویی)
     ============================================================ */
  const rings = new THREE.Group();
  [2.4, 3.1].forEach((r, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.012, 8, 128),
      new THREE.MeshBasicMaterial({ color: i ? C.gold : C.green, transparent: true, opacity: 0.28 })
    );
    ring.rotation.x = Math.PI / 2.15 + i * 0.14;
    ring.rotation.y = i * 0.5;
    rings.add(ring);
  });
  scene.add(rings);

  /* ============================================================
     پس‌زمینه: صفحه شیدر دانه‌دار (grain نویز متحرک)
     ============================================================ */
  const grainUniforms = {
    uTime: { value: 0 },
    uColorA: { value: new THREE.Color('#0a140d') },
    uColorB: { value: new THREE.Color('#17301f') },
  };
  const grain = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: grainUniforms,
      depthWrite: false, depthTest: false,
      vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                     mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
        }
        void main(){
          vec2 uv = gl_FragCoord.xy / 100.0;
          float n = noise(uv * 3.0 + uTime * 0.06) * 0.6 + noise(uv * 9.0 - uTime * 0.1) * 0.4;
          vec3 col = mix(uColorA, uColorB, smoothstep(0.25, 0.85, n));
          // وینیت
          vec2 c = gl_FragCoord.xy / vec2(${Math.round(canvas.clientWidth)}.0, ${Math.round(canvas.clientHeight)}.0) - 0.5;
          col *= 1.0 - dot(c, c) * 0.9;
          // گرین
          col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.045;
          gl_FragColor = vec4(col, 1.0);
        }`
    })
  );
  grain.renderOrder = -1;
  scene.add(grain);

  /* ============================================================
     تعامل: موس = چرخش ملایم / اسکرول = روایت
     ============================================================ */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // اسکرول: 0 (بالای صفحه) تا 1 (پایان هیرو)
  let scrollT = 0;
  function readScroll() {
    const r = canvas.parentElement.getBoundingClientRect();
    scrollT = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
  }
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();

  /* ---------------- کروک‌های روایت اسکرول ---------------- */
  const story = {
    onScroll: null, // (t)=>void
  };

  /* ---------------- render loop ---------------- */
  const clock = new THREE.Clock();
  let raf = 0;
  let running = true;

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta ? 0.016 : 0.016, 0.05);

    grainUniforms.uTime.value = t;

    // موس نرم
    mouse.x += (mouse.tx - mouse.x) * 0.045;
    mouse.y += (mouse.ty - mouse.y) * 0.045;

    // چرخش مغز: آرام + واکنش به موس + اسکرول
    kernelGroup.rotation.y = -0.5 + t * (reduceMotion ? 0.02 : 0.16) + mouse.x * 0.35 + scrollT * Math.PI * 1.5;
    kernelGroup.rotation.x = 0.28 + mouse.y * 0.22 + Math.sin(t * 0.4) * 0.05;
    // باز و بسته شدن نیمه‌ها با اسکرول
    const open = 0.14 + scrollT * 0.5;
    halfA.rotation.z = open;
    halfB.rotation.z = -open;
    halfA.position.x = 0.16 + scrollT * 0.9;
    halfB.position.x = -0.16 - scrollT * 0.9;

    kernelGroup.position.y = Math.sin(t * 0.6) * 0.14 - scrollT * 0.8;
    shell.rotation.y = 0.7 + t * 0.05;
    shell.position.y = Math.sin(t * 0.5 + 1) * 0.1;

    // ذرات
    [dust, greens].forEach((p, i) => {
      p.rotation.y = t * p.userData.speed * (i ? 1 : -1);
      p.position.y = Math.sin(t * 0.25 + i * 2) * 0.5;
    });

    // حلقه‌ها
    rings.rotation.z = t * 0.06;
    rings.rotation.y = mouse.x * 0.1;
    rings.position.y = -scrollT * 1.2;

    // دوربین: dolly ملایم با اسکرول
    camera.position.z = 9 - scrollT * 1.6 + mouse.x * 0.3;
    camera.position.y = -mouse.y * 0.4;
    camera.lookAt(0, -scrollT * 0.5, 0);

    if (story.onScroll) story.onScroll(scrollT);

    renderer.render(scene, camera);
  }

  /* ---------------- resize ---------------- */
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  /* ---------------- visibility ---------------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
    else if (!running) { running = true; clock.getDelta(); tick(); }
  });

  tick();

  return {
    story,
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      renderer.dispose();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  };
}
