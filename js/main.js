(() => {
  const CFG = window.GTA_CONFIG || {};
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const pointerQuery = matchMedia('(hover: hover) and (pointer: fine)');
  let reduceMotion = reduceQuery.matches;
  const hasFinePointer = pointerQuery.matches;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let lang = 'pt';
  let uiSfxEnabled = Boolean(CFG.features?.uiSound);
  let activeChar = 0;
  let lenisInstance = null;

  const vibrate = (ms = 12) => {
    if (CFG.features?.haptics && navigator.vibrate && !reduceMotion) {
      navigator.vibrate(ms);
    }
  };

  function setPageInert(active) {
    ['#main', '#site-header', '#site-footer'].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      el.inert = active;
      if (active) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
  }

  function trapFocus(container, e) {
    if (e.key !== 'Tab') return;
    const focusables = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', container)
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // =========================================================================
  // CONFIG, PLACEHOLDERS & I18N
  // =========================================================================
  function applyConfigLinks() {
    const psUrl = CFG.stores?.ps5 || '#platforms';
    const xbUrl = CFG.stores?.xbox || '#platforms';
    ['#cta-ps5', '#plat-ps5'].forEach(id => { const el = $(id); if (el) el.href = psUrl; });
    ['#cta-xbox', '#plat-xbox'].forEach(id => { const el = $(id); if (el) el.href = xbUrl; });
    if (CFG.trailer?.youtubeUrl) {
      ['#yt-direct-link', '#trailer-yt-ext'].forEach(id => { const el = $(id); if (el) el.href = CFG.trailer.youtubeUrl; });
    }
    const iframe = $('#trailer-iframe');
    if (iframe && CFG.trailer?.youtubeId) {
      iframe.dataset.src = `https://www.youtube-nocookie.com/embed/${CFG.trailer.youtubeId}?autoplay=1&rel=0`;
    }
  }

  function updateDaysSinceLaunch() {
    const el = $('#days-since');
    if (!el) return;
    if (!CFG.showDaysSinceLaunch || !CFG.releaseDate) {
      el.hidden = true;
      return;
    }
    const rel = new Date(CFG.releaseDate);
    const diffDays = Math.max(0, Math.floor((Date.now() - rel.getTime()) / 86400000));
    const dict = window.I18N[lang];
    el.textContent = diffDays === 0 ? dict.days_today : `${diffDays} ${dict.days_label}`;
  }

  fetch('assets/placeholders.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(map => {
      $$('img[data-placeholder]').forEach(img => {
        const b64 = map[img.dataset.placeholder];
        if (b64 && !img.complete) img.style.backgroundImage = `url("${b64}")`;
      });
    })
    .catch(() => {});

  $$('#title span').forEach(span => {
    span.innerHTML = [...span.textContent]
      .map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`)
      .join('');
  });

  function splitWords() {
    const p = $('#words');
    if (!p) return;
    p.innerHTML = p.textContent.trim().split(/\s+/).map(w => `<span>${w}</span> `).join('');
    if (reduceMotion || !window.gsap) {
      $$('span', p).forEach(s => { s.style.opacity = '1'; });
    }
  }

  function setLang(nextLang) {
    lang = nextLang;
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    const dict = window.I18N[lang];
    $$('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });
    $$('[data-i18n-alt]').forEach(el => {
      const key = el.dataset.i18nAlt;
      if (dict[key]) el.alt = dict[key];
    });
    $$('[data-i18n-aria]').forEach(el => {
      const key = el.dataset.i18nAria;
      if (dict[key]) el.setAttribute('aria-label', dict[key]);
    });
    const langBtn = $('#lang');
    if (langBtn) langBtn.textContent = lang === 'pt' ? 'EN' : 'PT';
    const sfxBtn = $('#sfx-toggle');
    if (sfxBtn) sfxBtn.textContent = uiSfxEnabled ? dict.ui_sfx_on : dict.ui_sfx_off;
    updateDaysSinceLaunch();
    splitWords();
    cardsModule.renderChar(activeChar, false);
    radioModule.updateTexts();
  }

  // =========================================================================
  // MÓDULO: NAV (Progresso de leitura, nav ativo, tema cromático, drawer mobile)
  // =========================================================================
  const navModule = (() => {
    let secObs = null;
    let drawerLastFocus = null;
    const toggleBtn = $('#nav-toggle');
    const drawer = $('#mobile-drawer');
    const closeBtn = $('#drawer-close');
    const navLinks = $$('#main-nav a, .drawer-nav a');
    const sections = $$('main section[id]');

    function openDrawer() {
      if (!drawer) return;
      drawerLastFocus = document.activeElement;
      drawer.hidden = false;
      requestAnimationFrame(() => drawer.classList.add('is-open'));
      toggleBtn?.setAttribute('aria-expanded', 'true');
      setPageInert(true);
      if (lenisInstance) lenisInstance.stop();
      closeBtn?.focus();
    }

    function closeDrawer() {
      if (!drawer || drawer.hidden) return;
      drawer.classList.remove('is-open');
      setTimeout(() => { drawer.hidden = true; }, reduceMotion ? 0 : 280);
      toggleBtn?.setAttribute('aria-expanded', 'false');
      setPageInert(false);
      if (lenisInstance) lenisInstance.start();
      if (drawerLastFocus && typeof drawerLastFocus.focus === 'function') drawerLastFocus.focus();
    }

    function onKey(e) {
      if (drawer && !drawer.hidden) {
        if (e.key === 'Escape') closeDrawer();
        else trapFocus(drawer, e);
      }
    }

    function onOutsideClick(e) {
      if (drawer && !drawer.hidden && !drawer.contains(e.target) && !toggleBtn?.contains(e.target)) {
        closeDrawer();
      }
    }

    return {
      init() {
        toggleBtn?.addEventListener('click', openDrawer);
        closeBtn?.addEventListener('click', closeDrawer);
        $$('.drawer-nav a').forEach(a => a.addEventListener('click', closeDrawer));
        addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onOutsideClick);

        secObs = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const id = entry.target.id;
            const theme = entry.target.dataset.theme;
            if (theme) document.body.dataset.theme = theme;
            navLinks.forEach(link => {
              if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'true');
              else link.removeAttribute('aria-current');
            });
          });
        }, { rootMargin: '-35% 0px -50% 0px', threshold: 0 });

        sections.forEach(s => secObs.observe(s));
      },
      destroy() {
        toggleBtn?.removeEventListener('click', openDrawer);
        closeBtn?.removeEventListener('click', closeDrawer);
        removeEventListener('keydown', onKey);
        document.removeEventListener('pointerdown', onOutsideClick);
        secObs?.disconnect();
      }
    };
  })();

  // =========================================================================
  // MÓDULO: HERO (Carrossel com pausa fora da viewport e aba oculta)
  // =========================================================================
  const heroModule = (() => {
    const heroEl = $('#hero');
    const slides = $$('#hero-slides .hero-slide');
    const dotsWrap = $('#hero-dots');
    let idx = 0;
    let timer = null;
    let inView = true;
    let obs = null;

    function show(next) {
      if (!slides.length) return;
      idx = (next + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
      if (dotsWrap) {
        $$('button', dotsWrap).forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
      }
    }

    function start() {
      clearInterval(timer);
      if (!reduceMotion && slides.length > 1 && inView && !document.hidden) {
        timer = setInterval(() => show(idx + 1), 5500);
      }
    }

    function stop() {
      clearInterval(timer);
    }

    function onVis() {
      if (document.hidden) stop();
      else start();
    }

    return {
      init() {
        if (slides.length > 1 && dotsWrap) {
          dotsWrap.innerHTML = slides
            .map((_, i) => `<button type="button" role="tab" aria-selected="${i === 0}" aria-label="Imagem ${i + 1}"></button>`)
            .join('');
          $$('button', dotsWrap).forEach((btn, i) => {
            btn.addEventListener('click', () => { vibrate(8); show(i); start(); });
          });
        }
        obs = new IntersectionObserver(entries => {
          inView = entries[0]?.isIntersecting ?? true;
          if (inView) start();
          else stop();
        }, { threshold: 0.1 });
        if (heroEl) obs.observe(heroEl);
        document.addEventListener('visibilitychange', onVis);
        start();
      },
      destroy() {
        stop();
        obs?.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  })();

  // =========================================================================
  // MÓDULO: CARDS (Personagens + Reflexo especular rAF --mx/--my + Tilt 3D)
  // =========================================================================
  const CHARS = [
    {
      name: 'Lucia', monogram: 'L', quoteKey: 'c_l_q',
      img: 'assets/char-lucia.webp',
      srcset: 'assets/char-lucia-480.webp 480w, assets/char-lucia-960.webp 960w, assets/char-lucia-1200.webp 1200w',
      altKey: 'alt_lucia',
      stats: [['stat_cunning', 92], ['stat_focus', 84], ['stat_street', 88]]
    },
    {
      name: 'Jason', monogram: 'J', quoteKey: 'c_j_q',
      img: 'assets/char-jason.webp',
      srcset: 'assets/char-jason-480.webp 480w, assets/char-jason-960.webp 960w, assets/char-jason-1200.webp 1200w',
      altKey: 'alt_jason',
      stats: [['stat_cunning', 80], ['stat_focus', 90], ['stat_street', 86]]
    }
  ];

  const cardsModule = (() => {
    const cleanups = [];

    function renderChar(idx, animate = true) {
      activeChar = idx;
      const c = CHARS[idx];
      const dict = window.I18N[lang];
      const card = $('#card');
      if (!card) return;
      const applyUpdate = () => {
        $('#cname').textContent = c.name;
        $('#cquote').textContent = dict[c.quoteKey];
        $('#portrait-monogram').textContent = c.monogram;
        const img = $('#char-img');
        img.src = c.img;
        img.srcset = c.srcset;
        img.alt = dict[c.altKey];
        $('#bars').innerHTML = c.stats
          .map(([key, val]) => `<li><span>${dict[key]} — ${val}%</span><i><u style="transform:scaleX(${animate && !reduceMotion ? 0 : val / 100})" data-w="${val / 100}"></u></i></li>`)
          .join('');
        $$('.tabs button').forEach((b, j) => b.setAttribute('aria-selected', String(j === idx)));
        card.setAttribute('aria-labelledby', `tab-char-${idx}`);
        if (animate && !reduceMotion) {
          card.classList.remove('mask-wipe');
          void card.offsetWidth;
          card.classList.add('mask-wipe');
          requestAnimationFrame(() => {
            $$('#bars u').forEach(u => { u.style.transform = `scaleX(${u.dataset.w})`; });
          });
        }
      };
      if (animate && !reduceMotion && document.startViewTransition) {
        document.startViewTransition(applyUpdate);
      } else {
        applyUpdate();
      }
    }

    return {
      renderChar,
      init() {
        $$('.tabs button').forEach(btn => {
          const onClick = () => {
            const next = Number(btn.dataset.c);
            if (next === activeChar) return;
            vibrate(12);
            fxModule.playUiClick();
            renderChar(next, true);
          };
          btn.addEventListener('click', onClick);
          cleanups.push(() => btn.removeEventListener('click', onClick));
        });

        if (hasFinePointer && !reduceMotion) {
          $$('.guide-card, .radio-card, #card').forEach(el => {
            let rafId = 0;
            const onMove = e => {
              if (rafId) return;
              const cx = e.clientX;
              const cy = e.clientY;
              rafId = requestAnimationFrame(() => {
                rafId = 0;
                const r = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${((cx - r.left) / r.width * 100).toFixed(1)}%`);
                el.style.setProperty('--my', `${((cy - r.top) / r.height * 100).toFixed(1)}%`);
                if (el.id === 'card') {
                  const x = (cx - r.left) / r.width - 0.5;
                  const y = (cy - r.top) / r.height - 0.5;
                  el.style.transform = `perspective(1000px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
                }
              });
            };
            const onLeave = () => { if (el.id === 'card') el.style.transform = ''; };
            el.addEventListener('pointermove', onMove, { passive: true });
            el.addEventListener('pointerleave', onLeave);
            cleanups.push(() => {
              el.removeEventListener('pointermove', onMove);
              el.removeEventListener('pointerleave', onLeave);
            });
          });
        }
      },
      destroy() {
        cleanups.splice(0).forEach(fn => fn());
      }
    };
  })();

  // =========================================================================
  // MÓDULO: PHOTOMODE (Filtros + Lightbox com inert, foco preso, zoom, swipe)
  // =========================================================================
  const photomodeModule = (() => {
    const galleryGrid = $('#gallery-grid');
    const galleryBtns = $$('.g-btn');
    const lightbox = $('#lightbox');
    const lbImg = $('#lb-img');
    const lbCap = $('#lb-cap');
    const lbCounter = $('#lb-counter');
    const lbZoomBtn = $('#lb-zoom');
    const trailerModal = $('#trailer-modal');
    const trailerIframe = $('#trailer-iframe');
    let lbIndex = 0;
    let lastFocus = null;
    let touchStartX = 0;

    function showSlide(idx) {
      lbIndex = (idx + galleryBtns.length) % galleryBtns.length;
      const itemBtn = galleryBtns[lbIndex];
      const img = $('img', itemBtn);
      const figCap = $('figcaption', itemBtn.closest('.g-item'));
      lbImg.src = img.currentSrc || img.src;
      lbImg.alt = img.alt;
      lbImg.classList.remove('zoomed');
      lbZoomBtn.setAttribute('aria-pressed', 'false');
      lbCap.textContent = figCap ? figCap.textContent : '';
      lbCounter.textContent = `${lbIndex + 1} / ${galleryBtns.length}`;
    }

    function openLightbox(idx, trigger) {
      lastFocus = trigger || document.activeElement;
      showSlide(idx);
      lightbox.hidden = false;
      setPageInert(true);
      if (lenisInstance) lenisInstance.stop();
      $('#lb-close')?.focus();
    }

    function closeAllModals() {
      let closed = false;
      if (lightbox && !lightbox.hidden) {
        lightbox.hidden = true;
        lbImg.classList.remove('zoomed');
        closed = true;
      }
      if (trailerModal && !trailerModal.hidden) {
        trailerModal.hidden = true;
        if (trailerIframe) trailerIframe.src = '';
        closed = true;
      }
      if (closed) {
        setPageInert(false);
        if (lenisInstance) lenisInstance.start();
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') closeAllModals();
      if (lightbox && !lightbox.hidden) {
        if (e.key === 'ArrowLeft') showSlide(lbIndex - 1);
        if (e.key === 'ArrowRight') showSlide(lbIndex + 1);
        trapFocus(lightbox, e);
      } else if (trailerModal && !trailerModal.hidden) {
        trapFocus(trailerModal, e);
      }
    }

    return {
      init() {
        $$('.filter-bar .chip').forEach(btn => {
          btn.addEventListener('click', () => {
            vibrate(10);
            fxModule.playUiClick();
            const filter = btn.dataset.filter;
            galleryGrid.dataset.activeFilter = filter;
            lightbox.dataset.activeFilter = filter;
            $$('.filter-bar .chip').forEach(b => {
              const active = b === btn;
              b.classList.toggle('active', active);
              b.setAttribute('aria-pressed', String(active));
            });
          });
        });

        galleryBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            vibrate(10);
            fxModule.playUiClick();
            openLightbox(Number(btn.dataset.index), btn);
          });
        });

        $('#lb-prev')?.addEventListener('click', () => { vibrate(8); showSlide(lbIndex - 1); });
        $('#lb-next')?.addEventListener('click', () => { vibrate(8); showSlide(lbIndex + 1); });
        $('#lb-close')?.addEventListener('click', closeAllModals);
        lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeAllModals(); });

        const toggleZoom = () => {
          const z = lbImg.classList.toggle('zoomed');
          lbZoomBtn.setAttribute('aria-pressed', String(z));
        };
        lbZoomBtn?.addEventListener('click', toggleZoom);
        lbImg?.addEventListener('click', toggleZoom);

        $('#lb-stage')?.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
        $('#lb-stage')?.addEventListener('touchend', e => {
          const dx = e.changedTouches[0].clientX - touchStartX;
          if (Math.abs(dx) > 45) showSlide(dx > 0 ? lbIndex - 1 : lbIndex + 1);
        }, { passive: true });

        $$('[data-open]').forEach(btn => {
          btn.addEventListener('click', () => {
            vibrate(12);
            fxModule.playUiClick();
            lastFocus = document.activeElement;
            const target = $('#' + btn.dataset.open);
            if (target) {
              if (target === trailerModal && trailerIframe?.dataset.src) {
                trailerIframe.src = trailerIframe.dataset.src;
              }
              target.hidden = false;
              setPageInert(true);
              if (lenisInstance) lenisInstance.stop();
              $('[data-close]', target)?.focus();
            }
          });
        });

        $$('[data-close]').forEach(btn => btn.addEventListener('click', closeAllModals));
        trailerModal?.addEventListener('click', e => { if (e.target === trailerModal) closeAllModals(); });
        addEventListener('keydown', onKey);
      },
      destroy() {
        removeEventListener('keydown', onKey);
      }
    };
  })();

  // =========================================================================
  // MÓDULO: RADIO (Web Audio API CC0 + Equalizador pausado quando oculto)
  // =========================================================================
  const radioModule = (() => {
    let audioCtx = null;
    let masterGain = null;
    let analyser = null;
    let playing = false;
    let stationIdx = 0;
    let seqTimer = null;
    let eqRaf = null;
    let inView = true;
    let obs = null;
    const stations = CFG.radioStations || [
      { name: 'Wave 104.9 FM', genre: 'Synthwave & Sunset Drive', bpm: 108, chord: [110, 130.81, 164.81, 196] }
    ];

    function ensureAudio() {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.16;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playStep(step) {
      if (!playing || !audioCtx) return;
      const st = stations[stationIdx];
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const filter = audioCtx.createBiquadFilter();
      const g = audioCtx.createGain();
      osc.type = stationIdx === 1 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(st.chord[step % st.chord.length] * (step % 8 === 0 ? 0.5 : 1), now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900 + (step % 4) * 320, now);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.45);
    }

    function drawEq() {
      const canvas = $('#eq-canvas');
      if (!canvas || !analyser) return;
      const ctx = canvas.getContext('2d');
      const data = new Uint8Array(analyser.frequencyBinCount);
      const render = () => {
        if (!playing || document.hidden || !inView) return;
        analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const bars = 24;
        const bw = canvas.width / bars;
        for (let i = 0; i < bars; i++) {
          const bh = Math.max(8, ((data[i] || 18) / 255) * canvas.height * 0.9);
          ctx.fillStyle = i % 2 === 0 ? '#14E0D0' : '#FF2E88';
          ctx.fillRect(i * bw + 3, canvas.height - bh, bw - 6, bh);
        }
        eqRaf = requestAnimationFrame(render);
      };
      render();
    }

    function startLoop() {
      clearInterval(seqTimer);
      let step = 0;
      const intervalMs = Math.round(60000 / (stations[stationIdx].bpm * 2));
      playStep(step++);
      seqTimer = setInterval(() => playStep(step++), intervalMs);
      drawEq();
    }

    function stopLoop() {
      clearInterval(seqTimer);
      cancelAnimationFrame(eqRaf);
      const canvas = $('#eq-canvas');
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }

    function updateTexts() {
      const st = stations[stationIdx];
      const dict = window.I18N[lang];
      $('#station-name').textContent = st.name;
      $('#station-genre').textContent = st.genre;
      const toggleBtn = $('#radio-toggle');
      const badge = $('#on-air-badge');
      const statusText = $('#radio-status-text');
      if (toggleBtn) {
        toggleBtn.textContent = playing ? dict.r_mute : dict.r_play;
        toggleBtn.setAttribute('aria-pressed', String(playing));
      }
      if (badge) {
        badge.textContent = playing ? 'ON AIR' : 'MUTED';
        badge.classList.toggle('live', playing);
      }
      if (statusText) statusText.textContent = playing ? dict.r_status_playing : dict.r_status_muted;
    }

    function onVis() {
      if (document.hidden && playing) {
        audioCtx?.suspend();
        cancelAnimationFrame(eqRaf);
      } else if (!document.hidden && playing) {
        audioCtx?.resume();
        drawEq();
      }
    }

    return {
      updateTexts,
      ensureAudio,
      init() {
        $('#radio-toggle')?.addEventListener('click', () => {
          vibrate(14);
          ensureAudio();
          playing = !playing;
          if (playing) startLoop();
          else stopLoop();
          updateTexts();
        });
        $('#station-next')?.addEventListener('click', () => {
          vibrate(10);
          fxModule.playUiClick();
          stationIdx = (stationIdx + 1) % stations.length;
          updateTexts();
          if (playing) startLoop();
        });
        obs = new IntersectionObserver(entries => {
          inView = entries[0]?.isIntersecting ?? true;
          if (inView && playing) drawEq();
          else cancelAnimationFrame(eqRaf);
        }, { threshold: 0.1 });
        const sec = $('#radio');
        if (sec) obs.observe(sec);
        document.addEventListener('visibilitychange', onVis);
      },
      destroy() {
        stopLoop();
        obs?.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  })();

  // =========================================================================
  // MÓDULO: FX (Cursor translate3d, WebGL shader, UI SFX)
  // =========================================================================
  const fxModule = (() => {
    let glRaf = 0;
    let trailRaf = 0;
    let sfxCtx = null;

    function playUiClick() {
      if (!uiSfxEnabled || reduceMotion) return;
      try {
        if (!sfxCtx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          sfxCtx = new AC();
        }
        if (sfxCtx.state === 'suspended') sfxCtx.resume();
        const osc = sfxCtx.createOscillator();
        const g = sfxCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(640, sfxCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, sfxCtx.currentTime + 0.055);
        g.gain.setValueAtTime(0.06, sfxCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, sfxCtx.currentTime + 0.06);
        osc.connect(g);
        g.connect(sfxCtx.destination);
        osc.start();
        osc.stop(sfxCtx.currentTime + 0.065);
      } catch {}
    }

    function initCursor() {
      if (reduceMotion || !hasFinePointer) return;
      const cur = $('.cursor');
      const trail = $('.cursor-trail');
      if (!cur || !trail) return;
      let mx = innerWidth / 2, my = innerHeight / 2, tx = mx, ty = my;

      const onMove = e => {
        mx = e.clientX;
        my = e.clientY;
        cur.style.opacity = '1';
        trail.style.opacity = '1';
        cur.style.setProperty('--cx', `${mx}px`);
        cur.style.setProperty('--cy', `${my}px`);
        cur.classList.toggle('is-hover', Boolean(e.target?.closest('a, button, summary, input, label')));
      };
      addEventListener('pointermove', onMove, { passive: true });

      const loop = () => {
        if (reduceMotion) return;
        tx += (mx - tx) * 0.16;
        ty += (my - ty) * 0.16;
        trail.style.setProperty('--cx', `${tx}px`);
        trail.style.setProperty('--cy', `${ty}px`);
        trailRaf = requestAnimationFrame(loop);
      };
      trailRaf = requestAnimationFrame(loop);
    }

    function initWebGL() {
      const canvas = $('#bg-webgl');
      if (!canvas || reduceMotion || !CFG.features?.webgl) return;
      const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
      if (!gl) return;

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.floor(innerWidth * dpr * 0.5);
        canvas.height = Math.floor(innerHeight * dpr * 0.5);
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      resize();
      addEventListener('resize', resize, { passive: true });

      const vs = `attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}`;
      const fs = `
        precision mediump float;
        uniform float t;
        uniform vec2 r;
        void main(){
          vec2 uv = gl_FragCoord.xy / r;
          float wave = sin(uv.y * 12.0 + t * 0.9) * 0.025 + cos(uv.x * 8.0 - t * 0.6) * 0.02;
          vec3 col1 = vec3(0.04, 0.02, 0.08);
          vec3 col2 = vec3(0.28, 0.04, 0.25);
          vec3 col3 = vec3(0.95, 0.20, 0.48);
          vec3 c = mix(col1, col2, smoothstep(0.0, 0.65, uv.y + wave));
          c = mix(c, col3, smoothstep(0.65, 1.0, uv.y + wave) * 0.45);
          float glow = 0.0;
          for(int i=0;i<6;i++){
            float fi = float(i);
            vec2 pos = vec2(fract(sin(fi*12.98)*43.2 + t*0.03*(fi+1.0)*0.25), fract(cos(fi*7.13)*19.7 + sin(t*0.4+fi)*0.08));
            float d = length((uv - pos) * vec2(r.x/r.y, 1.0));
            glow += 0.0022 / (d * d + 0.0025);
          }
          c += vec3(0.08, 0.88, 0.82) * glow * 0.22;
          gl_FragColor = vec4(c, 0.72);
        }
      `;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return s;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const uTime = gl.getUniformLocation(prog, 't');
      const uRes = gl.getUniformLocation(prog, 'r');
      const start = performance.now();

      const frame = now => {
        if (reduceMotion) return;
        if (!document.hidden) {
          gl.uniform1f(uTime, (now - start) * 0.001);
          gl.uniform2f(uRes, canvas.width, canvas.height);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        glRaf = requestAnimationFrame(frame);
      };
      glRaf = requestAnimationFrame(frame);
    }

    return {
      playUiClick,
      init() {
        initCursor();
        initWebGL();
      },
      destroy() {
        cancelAnimationFrame(glRaf);
        cancelAnimationFrame(trailRaf);
      }
    };
  })();

  // =========================================================================
  // MÓDULO: SCROLL + CITY (Lenis único dono do scroll + ScrollTrigger)
  // =========================================================================
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const scrollModule = (() => {
    let tickerFn = null;
    const progressEl = $('#scroll-progress');

    return {
      async init() {
        if (reduceMotion) {
          $$('#words span').forEach(s => { s.style.opacity = '1'; });
          return;
        }
        try {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js');
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js');
          await loadScript('https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js');

          const { gsap, ScrollTrigger, Lenis } = window;
          gsap.registerPlugin(ScrollTrigger);

          lenisInstance = new Lenis();
          lenisInstance.on('scroll', ({ progress }) => {
            ScrollTrigger.update();
            if (progressEl) progressEl.style.transform = `scaleX(${progress || 0})`;
          });
          tickerFn = t => lenisInstance?.raf(t * 1000);
          gsap.ticker.add(tickerFn);
          gsap.ticker.lagSmoothing(0);

          gsap.from('.ch', { yPercent: 115, stagger: 0.035, duration: 0.9, ease: 'power4.out' });
          gsap.from('.hero-in > :not(#title)', { opacity: 0, y: 22, stagger: 0.1, delay: 0.35 });

          const words = $$('#words span');
          if (words.length) {
            gsap.to(words, {
              opacity: 1,
              stagger: 0.08,
              scrollTrigger: { trigger: '#words', start: 'top 82%', end: 'bottom 42%', scrub: true }
            });
          }

          const track = $('.track');
          const citySec = $('#city');
          const cityBar = $('#city-bar');
          const cityTime = $('#city-time');
          const timeKeys = ['v_time_0', 'v_time_1', 'v_time_2', 'v_time_3'];
          if (track && citySec) {
            gsap.to(track, {
              x: () => -(track.scrollWidth - innerWidth),
              ease: 'none',
              scrollTrigger: {
                trigger: citySec,
                pin: true,
                scrub: 1,
                end: () => '+=' + track.scrollWidth,
                invalidateOnRefresh: true,
                onUpdate: self => {
                  const p = self.progress;
                  if (cityBar) cityBar.style.transform = `scaleX(${Math.max(0.08, p)})`;
                  const phase = Math.min(3, Math.floor(p * 4));
                  citySec.dataset.tod = String(phase);
                  if (cityTime) cityTime.textContent = window.I18N[lang][timeKeys[phase]];
                }
              }
            });
          }

          if (hasFinePointer) {
            $$('.mag').forEach(btn => {
              btn.addEventListener('pointermove', e => {
                const r = btn.getBoundingClientRect();
                gsap.to(btn, {
                  x: (e.clientX - r.left - r.width / 2) * 0.22,
                  y: (e.clientY - r.top - r.height / 2) * 0.22,
                  duration: 0.28
                });
              });
              btn.addEventListener('pointerleave', () => {
                gsap.to(btn, { x: 0, y: 0, duration: 0.45 });
              });
            });
          }
        } catch {
          $$('#words span').forEach(s => { s.style.opacity = '1'; });
        }
      },
      destroy() {
        if (window.ScrollTrigger) window.ScrollTrigger.getAll().forEach(t => t.kill());
        if (window.gsap && tickerFn) window.gsap.ticker.remove(tickerFn);
        lenisInstance?.destroy();
        lenisInstance = null;
      }
    };
  })();

  // =========================================================================
  // EVENTOS GLOBAIS & BOOT
  // =========================================================================
  $('#lang')?.addEventListener('click', () => {
    vibrate(10);
    fxModule.playUiClick();
    setLang(lang === 'pt' ? 'en' : 'pt');
  });

  $('#sfx-toggle')?.addEventListener('click', e => {
    uiSfxEnabled = !uiSfxEnabled;
    e.currentTarget.setAttribute('aria-pressed', String(uiSfxEnabled));
    const dict = window.I18N[lang];
    e.currentTarget.textContent = uiSfxEnabled ? dict.ui_sfx_on : dict.ui_sfx_off;
    vibrate(10);
    if (uiSfxEnabled) fxModule.playUiClick();
  });

  $('#form')?.addEventListener('submit', e => {
    e.preventDefault();
    const dict = window.I18N[lang];
    const em = $('#email').value.trim();
    const errEl = $('#err');
    if (!/^\S+@\S+\.\S+$/.test(em)) {
      errEl.textContent = dict.err_email;
      $('#email').focus();
      return;
    }
    if (!$('#lgpd').checked) {
      errEl.textContent = dict.err_lgpd;
      $('#lgpd').focus();
      return;
    }
    errEl.textContent = '';
    vibrate([15, 30, 15]);
    $('#form').hidden = true;
    $('#ok').hidden = false;
  });

  reduceQuery.addEventListener('change', e => {
    reduceMotion = e.matches;
    if (reduceMotion) {
      scrollModule.destroy();
      heroModule.destroy();
      fxModule.destroy();
      $$('#words span').forEach(s => { s.style.opacity = '1'; });
    } else {
      heroModule.init();
      fxModule.init();
      scrollModule.init();
    }
  });

  applyConfigLinks();
  setLang('pt');
  navModule.init();
  cardsModule.init();
  photomodeModule.init();
  radioModule.init();

  const loaderBar = $('#loader u');
  if (loaderBar) requestAnimationFrame(() => { loaderBar.style.width = '100%'; });
  setTimeout(() => {
    const loader = $('#loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
    if (!reduceMotion) $('#hero')?.classList.add('camera-intro');
    heroModule.init();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { fxModule.init(); scrollModule.init(); }, { timeout: 1200 });
    } else {
      setTimeout(() => { fxModule.init(); scrollModule.init(); }, 100);
    }
  }, reduceMotion ? 100 : 750);
})();
