/* ==========================================================================
   مغزدانه — motion.js (Phase 4)
   لایه موشن منضبط و بدون نشت حافظه:
   - reveal on scroll با تضمین صفر عنصر مخفی (برای محتوای داینامیک)
   - افکت نورپردازی لمسی-ماوسی Spotlight روی کارت‌ها (Godly / Aceternity)
   - marquee بی‌درز با کلون خودکار
   - شمارنده اعداد فارسی با easing نرم
   - نوار پیشرفت اسکرول (scroll-progress)
   - احترام کامل به prefers-reduced-motion
   ========================================================================== */

(() => {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scrollWired = false;
  let spotlightWired = false;
  let progressBar = null;

  /* ---------- Reveal on Scroll (Idempotent & Safe) ---------- */
  const io = new IntersectionObserver(
    entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.04, rootMargin: '0px 0px 40px 0px' }
  );

  function scanReveals(root = document) {
    root.querySelectorAll('[data-reveal-stagger]').forEach(wrap => {
      [...wrap.children].forEach((child, i) => {
        if (!child.hasAttribute('data-reveal')) {
          child.setAttribute('data-reveal', '');
        }
        if (!child.classList.contains('in')) {
          child.style.transitionDelay = Math.min(i * 65, 360) + 'ms';
        }
      });
    });

    root.querySelectorAll('[data-reveal]:not(.in)').forEach(el => {
      if (reduceMotion) {
        el.classList.add('in');
        return;
      }
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight + 60) {
        el.classList.add('in');
      } else {
        io.observe(el);
      }
    });
  }

  /* ---------- Mouse-Tracking Radial Spotlight (Event Delegation, Zero Leak) ---------- */
  function wireSpotlightOnce() {
    if (spotlightWired || reduceMotion) return;
    spotlightWired = true;
    document.addEventListener(
      'pointermove',
      e => {
        const card = e.target && e.target.closest ? e.target.closest('.card, .cat-tile, .chain-node, .tier-card') : null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', e.clientX - r.left + 'px');
        card.style.setProperty('--my', e.clientY - r.top + 'px');
      },
      { passive: true }
    );
  }

  /* ---------- Seamless Marquee ---------- */
  function scanMarquee(root = document) {
    root.querySelectorAll('[data-marquee], .marquee').forEach(m => {
      const track = m.querySelector('.marquee-track');
      if (track && track.children.length && !track.dataset.cloned) {
        track.innerHTML += track.innerHTML;
        track.dataset.cloned = '1';
      }
    });
  }

  /* ---------- Tabular Persian Counters ---------- */
  function animCount(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const raw = (el.dataset.count || '0').replace(/,/g, '');
    const to = parseFloat(raw);
    if (isNaN(to)) return;
    if (reduceMotion) {
      el.textContent = Math.round(to).toLocaleString('fa-IR');
      return;
    }
    const dur = 1100;
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * eased).toLocaleString('fa-IR');
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  const ioCount = new IntersectionObserver(
    entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          animCount(en.target);
          ioCount.unobserve(en.target);
        }
      });
    },
    { threshold: 0.25 }
  );

  function scanCounters(root = document) {
    root.querySelectorAll('[data-count]:not([data-counted])').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) animCount(el);
      else ioCount.observe(el);
    });
  }

  /* ---------- Scroll Progress Bar (Wired Once!) ---------- */
  function wireScrollOnce() {
    if (scrollWired) return;
    scrollWired = true;
    progressBar = document.querySelector('.scroll-progress');
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'scroll-progress';
      document.body.appendChild(progressBar);
    }
    const update = () => {
      const h = document.documentElement;
      const denom = Math.max(1, h.scrollHeight - h.clientHeight);
      const p = Math.min(1, Math.max(0, h.scrollTop / denom));
      progressBar.style.transform = `scaleX(${p})`;
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---------- Init ---------- */
  function init(root = document) {
    scanReveals(root);
    scanMarquee(root);
    scanCounters(root);
    wireScrollOnce();
    wireSpotlightOnce();
  }

  window.MGZ = { init, scanReveals, scanMarquee, scanCounters };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
