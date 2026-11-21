/* ============================================================
   مغزدانه — motion.js
   لایه موشن الهام‌گرفته از برندگان Awwwards:
   - reveal on scroll (stagger)
   - parallax soft
   - magnetic buttons + custom cursor
   - marquee
   - counter animation
   - tilt cards سه‌بعدی
   ============================================================ */

(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none)').matches;

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function scanReveals(root = document) {
    root.querySelectorAll('[data-reveal]:not(.in)').forEach(el => io.observe(el));
    // stagger فرزندان
    root.querySelectorAll('[data-reveal-stagger]').forEach(wrap => {
      [...wrap.children].forEach((c, i) => {
        c.setAttribute('data-reveal', '');
        c.style.transitionDelay = (i * 90) + 'ms';
        io.observe(c);
      });
    });
  }

  /* ---------- parallax ---------- */
  const pll = [];
  function scanParallax(root = document) {
    root.querySelectorAll('[data-plx]').forEach(el => {
      const amt = parseFloat(el.dataset.plx) || 0.15;
      pll.push({ el, amt });
    });
  }
  function parallaxTick() {
    if (reduceMotion) return;
    const vh = innerHeight;
    for (const p of pll) {
      const r = p.el.getBoundingClientRect();
      if (r.bottom < -80 || r.top > vh + 80) continue;
      const mid = (r.top + r.height / 2 - vh / 2) / vh; // -0.5..0.5
      p.el.style.transform = `translateY(${(-mid * p.amt * 100).toFixed(2)}px)`;
    }
  }

  /* ---------- custom cursor (desktop فقط) ---------- */
  let cursorEl = null, cursorDot = null;
  if (!isTouch && !reduceMotion) {
    cursorEl = document.createElement('div');
    cursorEl.className = 'mgz-cursor';
    cursorDot = document.createElement('div');
    cursorDot.className = 'mgz-cursor-dot';
    document.body.append(cursorEl, cursorDot);
    let cx = -100, cy = -100, tx = -100, ty = -100;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function cur() {
      cx += (tx - cx) * 0.16; cy += (ty - cy) * 0.16;
      cursorEl.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
      cursorDot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%,-50%)`;
      requestAnimationFrame(cur);
    })();
    // بزرگ‌شدن روی عناصر تعاملی
    document.addEventListener('pointerover', e => {
      const t = e.target.closest('a, button, [data-tilt], input, select, textarea, summary');
      document.body.classList.toggle('cursor-hot', !!t);
    });
  }

  /* ---------- magnetic buttons ---------- */
  function scanMagnetic(root = document) {
    if (isTouch || reduceMotion) return;
    root.querySelectorAll('.btn, .cart-btn').forEach(b => {
      if (b._magnet) return;
      b._magnet = true;
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - r.left - r.width / 2) * 0.18;
        const dy = (e.clientY - r.top - r.height / 2) * 0.28;
        b.style.transform = `translate(${dx}px, ${dy}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }

  /* ---------- tilt cards ---------- */
  function scanTilt(root = document) {
    if (isTouch || reduceMotion) return;
    root.querySelectorAll('.card, .tier-card').forEach(c => {
      if (c._tilt) return;
      c._tilt = true;
      c.addEventListener('pointermove', e => {
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = `perspective(900px) rotateX(${-py * 6}deg) rotateY(${px * 7}deg) translateY(-4px)`;
      });
      c.addEventListener('pointerleave', () => { c.style.transform = ''; });
    });
  }

  /* ---------- marquee ---------- */
  function scanMarquee() {
    document.querySelectorAll('[data-marquee]').forEach(m => {
      const inner = m.querySelector('.marquee-track') || m;
      // محتوا دوبار تکرار می‌شود تا حلقه بی‌درز باشد
      if (inner.children.length && !inner.dataset.cloned) {
        inner.innerHTML += inner.innerHTML;
        inner.dataset.cloned = '1';
      }
    });
  }

  /* ---------- counters ---------- */
  function animCount(el) {
    const to = parseFloat(el.dataset.count.replace(/,/g, ''));
    const dur = 1400;
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * e).toLocaleString('fa-IR');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }
  const ioCount = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { animCount(en.target); ioCount.unobserve(en.target); }
  }), { threshold: 0.6 });

  /* ---------- scroll progress (نوار HUD) ---------- */
  function ensureProgress() {
    let bar = document.querySelector('.scroll-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'scroll-progress';
      document.body.appendChild(bar);
    }
    return bar;
  }

  /* ---------- init ---------- */
  function init(root = document) {
    scanReveals(root);
    scanParallax(root);
    scanMagnetic(root);
    scanTilt(root);
    scanMarquee();
    document.querySelectorAll('[data-count]').forEach(c => ioCount.observe(c));
    const bar = ensureProgress();
    addEventListener('scroll', () => {
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
      bar.style.transform = `scaleX(${p})`;
      parallaxTick();
    }, { passive: true });
    parallaxTick();
  }

  window.MGZ = { init, scanReveals, scanTilt, parallaxTick };
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', () => init())
    : init();
})();
