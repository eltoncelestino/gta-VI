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

  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
    }
  };

  const vibrate = (ms = 10) => {
    if (CFG.features?.haptics && navigator.vibrate && !reduceMotion) navigator.vibrate(ms);
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
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
    if (!CFG.showDaysSinceLaunch || !CFG.releaseDate) { el.hidden = true; return; }
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
    span.innerHTML = [...span.textContent].map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  });

  function splitWords() {
    const p = $('#words');
    if (!p) return;
    p.innerHTML = p.textContent.trim().split(/\s+/).map(w => `<span>${w}</span> `).join('');
    if (reduceMotion || !window.gsap) $$('span', p).forEach(s => { s.style.opacity = '1'; });
  }

  function setLang(nextLang) {
    lang = nextLang;
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    const dict = window.I18N[lang];
    $$('[data-i18n]').forEach(el => { if (dict[el.dataset.i18n]) el.textContent = dict[el.dataset.i18n]; });
    $$('[data-i18n-alt]').forEach(el => { if (dict[el.dataset.i18nAlt]) el.alt = dict[el.dataset.i18nAlt]; });
    $$('[data-i18n-aria]').forEach(el => { if (dict[el.dataset.i18nAria]) el.setAttribute('aria-label', dict[el.dataset.i18nAria]); });
    const langBtn = $('#lang');
    if (langBtn) langBtn.textContent = lang === 'pt' ? 'EN' : 'PT';
    const sfxBtn = $('#sfx-toggle');
    if (sfxBtn) sfxBtn.textContent = uiSfxEnabled ? dict.ui_sfx_on : dict.ui_sfx_off;
    updateDaysSinceLaunch();
    splitWords();
    cardsModule.renderChar(activeChar, false);
    radioModule.updateTexts();
    heroModule.updatePauseLabel();
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
      lenisInstance?.stop();
      closeBtn?.focus();
    }

    function closeDrawer() {
      if (!drawer || drawer.hidden) return;
      drawer.classList.remove('is-open');
      setTimeout(() => { drawer.hidden = true; }, reduceMotion ? 0 : 280);
      toggleBtn?.setAttribute('aria-expanded', 'false');
      setPageInert(false);
      lenisInstance?.start();
      if (drawerLastFocus && typeof drawerLastFocus.focus === 'function') drawerLastFocus.focus();
    }

    function onKey(e) {
      if (drawer && !drawer.hidden) {
        if (e.key === 'Escape') closeDrawer();
        else trapFocus(drawer, e);
      }
    }

    function onOutsideClick(e) {
      if (drawer && !drawer.hidden && !drawer.contains(e.target) && !toggleBtn?.contains(e.target)) closeDrawer();
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
            if (entry.target.dataset.theme) document.body.dataset.theme = entry.target.dataset.theme;
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
  // MÓDULO: HERO (Carrossel WCAG 2.2.2 com pausa, progresso, teclado e aria-live)
  // =========================================================================
  const heroModule = (() => {
    const heroEl = $('#hero');
    const slides = $$('#hero-slides .hero-slide');
    const dotsWrap = $('#hero-dots');
    const pauseBtn = $('#hero-pause');
    const prevBtn = $('#hero-prev');
    const nextBtn = $('#hero-next');
    const liveEl = $('#hero-live');
    let idx = 0;
    let timer = null;
    let userPaused = false;
    let hoverPaused = false;
    let inView = true;
    let obs = null;

    function updatePauseLabel() {
      if (!pauseBtn) return;
      const dict = window.I18N[lang];
      const isPaused = userPaused || reduceMotion;
      pauseBtn.textContent = isPaused ? dict.hero_play : dict.hero_pause;
      pauseBtn.setAttribute('aria-pressed', String(isPaused));
      heroEl?.classList.toggle('is-paused', isPaused || hoverPaused);
    }

    function show(next, announce = false) {
      if (!slides.length) return;
      idx = (next + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
      if (dotsWrap) {
        $$('button', dotsWrap).forEach((b, i) => b.setAttribute('aria-selected', String(i === idx)));
      }
      if (announce && liveEl) liveEl.textContent = `${idx + 1} / ${slides.length}`;
    }

    function syncTimer() {
      clearInterval(timer);
      const shouldRun = !reduceMotion && !userPaused && !hoverPaused && inView && !document.hidden && slides.length > 1;
      heroEl?.classList.toggle('is-paused', !shouldRun);
      if (shouldRun) {
        timer = setInterval(() => show(idx + 1, false), 5500);
      }
    }

    function onVis() { syncTimer(); }

    return {
      updatePauseLabel,
      init() {
        const positions = CFG.heroSlidesPosition || [];
        slides.forEach((s, i) => {
          s.style.objectPosition = positions[i] || 'center 20%';
        });

        if (slides.length > 1 && dotsWrap) {
          dotsWrap.innerHTML = slides
            .map((_, i) => `<button type="button" role="tab" aria-selected="${i === 0}" aria-label="Slide ${i + 1}"><i></i></button>`)
            .join('');
          $$('button', dotsWrap).forEach((btn, i) => {
            btn.addEventListener('click', () => { vibrate(8); show(i, true); syncTimer(); });
          });
        }

        prevBtn?.addEventListener('click', () => { vibrate(8); show(idx - 1, true); syncTimer(); });
        nextBtn?.addEventListener('click', () => { vibrate(8); show(idx + 1, true); syncTimer(); });
        pauseBtn?.addEventListener('click', () => {
          vibrate(10);
          userPaused = !userPaused;
          updatePauseLabel();
          if (liveEl) liveEl.textContent = userPaused ? window.I18N[lang].hero_status_paused : window.I18N[lang].hero_status_playing;
          syncTimer();
        });

        heroEl?.addEventListener('mouseenter', () => { hoverPaused = true; syncTimer(); });
        heroEl?.addEventListener('mouseleave', () => { hoverPaused = false; syncTimer(); });
        heroEl?.addEventListener('focusin', () => { hoverPaused = true; syncTimer(); });
        heroEl?.addEventListener('focusout', () => { hoverPaused = false; syncTimer(); });
        heroEl?.addEventListener('touchstart', () => { hoverPaused = true; syncTimer(); }, { passive: true });

        obs = new IntersectionObserver(entries => {
          inView = entries[0]?.isIntersecting ?? true;
          syncTimer();
        }, { threshold: 0.1 });
        if (heroEl) obs.observe(heroEl);
        document.addEventListener('visibilitychange', onVis);
        updatePauseLabel();
        syncTimer();
      },
      destroy() {
        clearInterval(timer);
        obs?.disconnect();
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  })();

  // =========================================================================
  // MÓDULO: CITY (Mapa interativo + Atmosfera Canvas por região)
  // =========================================================================
  const cityModule = (() => {
    let rafId = 0;
    let inView = false;
    let obs = null;
    const citySec = $('#city');
    const canvas = $('#city-atmosphere');
    const pins = $$('.map-pin');
    let currentPhase = 0;
    let particles = [];

    function setPhase(phase) {
      currentPhase = phase;
      if (citySec) citySec.dataset.tod = String(phase);
      pins.forEach(p => {
        if (Number(p.dataset.panel) === phase + 1) p.setAttribute('aria-current', 'step');
        else p.removeAttribute('aria-current');
      });
    }

    function initParticles() {
      const count = innerWidth < 768 ? 55 : 140;
      particles = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0015,
        vy: (Math.random() - 0.5) * 0.001,
        r: Math.random() * 2.2 + 0.8
      }));
    }

    function drawAtmosphere() {
      if (!canvas || reduceMotion || !inView || document.hidden) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        canvas.width = canvas.clientWidth || 800;
        canvas.height = canvas.clientHeight || 500;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const colors = ['rgba(255,46,136,0.38)', 'rgba(20,224,208,0.32)', 'rgba(255,122,26,0.38)', 'rgba(255,244,230,0.35)'];
      ctx.fillStyle = colors[currentPhase] || colors[0];
      for (const p of particles) {
        p.x = (p.x + p.vx + (currentPhase === 3 ? 0.002 : 0) + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, p.r * (currentPhase === 1 ? 2.2 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
      rafId = requestAnimationFrame(drawAtmosphere);
    }

    function onVis() {
      if (document.hidden) cancelAnimationFrame(rafId);
      else if (inView && !reduceMotion) drawAtmosphere();
    }

    return {
      setPhase,
      init() {
        initParticles();
        pins.forEach(pin => {
          pin.addEventListener('click', () => {
            vibrate(10);
            const panelIdx = Number(pin.dataset.panel);
            const panels = $$('#city .panel');
            if (reduceMotion) {
              panels[panelIdx]?.scrollIntoView({ behavior: 'auto' });
              return;
            }
            const cityTop = citySec ? citySec.offsetTop : 0;
            const track = $('.track');
            const totalW = track ? track.scrollWidth : innerWidth * 5;
            const targetY = cityTop + (panelIdx / (panels.length - 1)) * totalW;
            if (lenisInstance) lenisInstance.scrollTo(targetY, { duration: 1.1 });
            else window.scrollTo({ top: targetY, behavior: 'smooth' });
          });
        });

        obs = new IntersectionObserver(entries => {
          inView = entries[0]?.isIntersecting ?? false;
          if (inView && !reduceMotion) drawAtmosphere();
          else cancelAnimationFrame(rafId);
        }, { threshold: 0.05 });
        if (citySec) obs.observe(citySec);
        document.addEventListener('visibilitychange', onVis);
      },
      destroy() {
        cancelAnimationFrame(rafId);
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
      if (animate && !reduceMotion && document.startViewTransition) document.startViewTransition(applyUpdate);
      else applyUpdate();
    }

    return {
      renderChar,
      init() {
        $$('.tabs button').forEach(btn => {
          const onClick = () => {
            const next = Number(btn.dataset.c);
            if (next === activeChar) return;
            vibrate(10);
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
              const cx = e.clientX, cy = e.clientY;
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
      destroy() { cleanups.splice(0).forEach(fn => fn()); }
    };
  })();

  // =========================================================================
  // MÓDULO: PHOTOMODE (Filtros, Curtidas locais, Lightbox + Antes/Depois)
  // =========================================================================
  const photomodeModule = (() => {
    const galleryGrid = $('#gallery-grid');
    const galleryBtns = $$('.g-btn');
    const lightbox = $('#lightbox');
    const lbImg = $('#lb-img');
    const lbOrig = $('#lb-img-orig');
    const lbWrap = $('#lb-compare-wrap');
    const lbCompare = $('#lb-compare');
    const lbHoldOrig = $('#lb-hold-orig');
    const lbCap = $('#lb-cap');
    const lbCounter = $('#lb-counter');
    const lbZoomBtn = $('#lb-zoom');
    const trailerModal = $('#trailer-modal');
    const trailerIframe = $('#trailer-iframe');
    let lbIndex = 0;
    let lastFocus = null;
    let touchStartX = 0;
    let savedCompare = 100;
    const likes = store.get('gta6_likes', {});

    function syncLikesUI() {
      $$('.like-btn').forEach(btn => {
        const id = btn.dataset.like;
        const active = Boolean(likes[id]);
        btn.setAttribute('aria-pressed', String(active));
        const cnt = $('.like-count', btn);
        if (cnt) cnt.textContent = active ? '1' : '0';
      });
    }

    function showSlide(idx) {
      lbIndex = (idx + galleryBtns.length) % galleryBtns.length;
      const itemBtn = galleryBtns[lbIndex];
      const img = $('img', itemBtn);
      const figCap = $('.g-cap > span', itemBtn.closest('.g-item'));
      const src = img.currentSrc || img.src;
      lbImg.src = src;
      lbImg.alt = img.alt;
      if (lbOrig) { lbOrig.src = src; lbOrig.alt = img.alt; }
      lbImg.classList.remove('zoomed');
      lbOrig?.classList.remove('zoomed');
      lbZoomBtn.setAttribute('aria-pressed', 'false');
      lbCap.textContent = figCap ? figCap.textContent : '';
      lbCounter.textContent = `${lbIndex + 1} / ${galleryBtns.length}`;
    }

    function openLightbox(idx, trigger) {
      lastFocus = trigger || document.activeElement;
      showSlide(idx);
      lightbox.hidden = false;
      setPageInert(true);
      lenisInstance?.stop();
      $('#lb-close')?.focus();
    }

    function closeAllModals() {
      let closed = false;
      if (lightbox && !lightbox.hidden) {
        lightbox.hidden = true;
        lbImg.classList.remove('zoomed');
        lbOrig?.classList.remove('zoomed');
        closed = true;
      }
      if (trailerModal && !trailerModal.hidden) {
        trailerModal.hidden = true;
        if (trailerIframe) trailerIframe.src = '';
        closed = true;
      }
      if (closed) {
        setPageInert(false);
        lenisInstance?.start();
        if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') closeAllModals();
      if (lightbox && !lightbox.hidden) {
        if (e.target !== lbCompare) {
          if (e.key === 'ArrowLeft') showSlide(lbIndex - 1);
          if (e.key === 'ArrowRight') showSlide(lbIndex + 1);
        }
        trapFocus(lightbox, e);
      } else if (trailerModal && !trailerModal.hidden) {
        trapFocus(trailerModal, e);
      }
    }

    return {
      init() {
        syncLikesUI();
        $$('.like-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            vibrate(10);
            fxModule.playUiClick();
            const id = btn.dataset.like;
            likes[id] = !likes[id];
            store.set('gta6_likes', likes);
            syncLikesUI();
          });
        });

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

        lbCompare?.addEventListener('input', () => {
          savedCompare = Number(lbCompare.value);
          lbWrap?.style.setProperty('--compare', `${savedCompare}%`);
        });

        const holdStart = () => {
          lbHoldOrig?.setAttribute('aria-pressed', 'true');
          lbWrap?.style.setProperty('--compare', '0%');
        };
        const holdEnd = () => {
          lbHoldOrig?.setAttribute('aria-pressed', 'false');
          lbWrap?.style.setProperty('--compare', `${savedCompare}%`);
        };
        lbHoldOrig?.addEventListener('pointerdown', holdStart);
        lbHoldOrig?.addEventListener('pointerup', holdEnd);
        lbHoldOrig?.addEventListener('pointerleave', holdEnd);
        lbHoldOrig?.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); holdStart(); } });
        lbHoldOrig?.addEventListener('keyup', e => { if (e.code === 'Space') holdEnd(); });

        $('#lb-prev')?.addEventListener('click', () => { vibrate(8); showSlide(lbIndex - 1); });
        $('#lb-next')?.addEventListener('click', () => { vibrate(8); showSlide(lbIndex + 1); });
        $('#lb-close')?.addEventListener('click', closeAllModals);
        lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeAllModals(); });

        const toggleZoom = () => {
          const z = lbImg.classList.toggle('zoomed');
          lbOrig?.classList.toggle('zoomed', z);
          lbZoomBtn.setAttribute('aria-pressed', String(z));
        };
        lbZoomBtn?.addEventListener('click', toggleZoom);
        lbWrap?.addEventListener('dblclick', toggleZoom);

        $('#lb-stage')?.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
        $('#lb-stage')?.addEventListener('touchend', e => {
          const dx = e.changedTouches[0].clientX - touchStartX;
          if (Math.abs(dx) > 45 && e.target !== lbCompare) showSlide(dx > 0 ? lbIndex - 1 : lbIndex + 1);
        }, { passive: true });

        $$('[data-open]').forEach(btn => {
          btn.addEventListener('click', () => {
            vibrate(10);
            fxModule.playUiClick();
            lastFocus = document.activeElement;
            const target = $('#' + btn.dataset.open);
            if (target) {
              if (target === trailerModal && trailerIframe?.dataset.src) trailerIframe.src = trailerIframe.dataset.src;
              target.hidden = false;
              setPageInert(true);
              lenisInstance?.stop();
              $('[data-close]', target)?.focus();
            }
          });
        });

        $$('[data-close]').forEach(btn => btn.addEventListener('click', closeAllModals));
        trailerModal?.addEventListener('click', e => { if (e.target === trailerModal) closeAllModals(); });
        addEventListener('keydown', onKey);
      },
      destroy() { removeEventListener('keydown', onKey); }
    };
  })();

  // =========================================================================
  // MÓDULO: RADIO (Vinil girando, Volume range, Espectro barras duplas + picos)
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
    let vol = store.get('gta6_radio_vol', 65);
    const peaks = new Array(20).fill(0);
    const stations = CFG.radioStations || [
      { name: 'Wave 104.9 FM', genre: 'Synthwave & Sunset Drive', bpm: 108, chord: [110, 130.81, 164.81, 196] }
    ];

    function ensureAudio() {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = (vol / 100) * 0.24;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        masterGain.connect(analyser);
        analyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      return true;
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
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      const render = () => {
        if (!playing || document.hidden || !inView) return;
        if (analyser && data) analyser.getByteFrequencyData(data);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const bars = 20;
        const bw = canvas.width / bars;
        const mid = canvas.height / 2;
        for (let i = 0; i < bars; i++) {
          const val = data ? (data[i] || 16) / 255 : (0.25 + 0.55 * Math.abs(Math.sin(performance.now() * 0.004 + i)));
          const bh = Math.max(4, val * (mid - 6));
          peaks[i] = Math.max(bh, peaks[i] * 0.94);
          ctx.fillStyle = i % 2 === 0 ? '#14E0D0' : '#FF2E88';
          ctx.fillRect(i * bw + 3, mid - bh, bw - 6, bh * 2);
          ctx.fillStyle = '#FFF4E6';
          ctx.fillRect(i * bw + 3, mid - peaks[i] - 2, bw - 6, 2);
          ctx.fillRect(i * bw + 3, mid + peaks[i], bw - 6, 2);
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
      const vinyl = $('#radio-vinyl');
      if (toggleBtn) {
        toggleBtn.textContent = playing ? dict.r_mute : dict.r_play;
        toggleBtn.setAttribute('aria-pressed', String(playing));
      }
      if (badge) {
        badge.textContent = playing ? 'ON AIR' : 'MUTED';
        badge.classList.toggle('live', playing);
      }
      if (vinyl) vinyl.classList.toggle('is-playing', playing && !reduceMotion);
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
      init() {
        const volInput = $('#radio-volume');
        const volVal = $('#radio-vol-val');
        if (volInput) {
          volInput.value = String(vol);
          volInput.setAttribute('aria-valuetext', `${vol}%`);
          if (volVal) volVal.textContent = `${vol}%`;
          volInput.addEventListener('input', () => {
            vol = Number(volInput.value);
            volInput.setAttribute('aria-valuetext', `${vol}%`);
            if (volVal) volVal.textContent = `${vol}%`;
            store.set('gta6_radio_vol', vol);
            if (masterGain && audioCtx) masterGain.gain.setTargetAtTime((vol / 100) * 0.24, audioCtx.currentTime, 0.02);
          });
        }

        $('#radio-toggle')?.addEventListener('click', () => {
          vibrate(12);
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
  // MÓDULO: FX (Ripple neon, Cursor translate3d, WebGL shader, UI SFX)
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
          if (!AC) return;
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

    function initRipples() {
      $$('.btn').forEach(btn => {
        btn.addEventListener('pointerdown', e => {
          if (reduceMotion) return;
          const r = btn.getBoundingClientRect();
          const sz = Math.max(r.width, r.height);
          const sp = document.createElement('span');
          sp.className = 'ripple';
          sp.style.width = sp.style.height = `${sz}px`;
          sp.style.left = `${e.clientX - r.left - sz / 2}px`;
          sp.style.top = `${e.clientY - r.top - sz / 2}px`;
          btn.appendChild(sp);
          sp.addEventListener('animationend', () => sp.remove(), { once: true });
        }, { passive: true });
      });
    }

    function initCursor() {
      if (reduceMotion || !hasFinePointer) return;
      const cur = $('.cursor');
      const trail = $('.cursor-trail');
      if (!cur || !trail) return;
      let mx = innerWidth / 2, my = innerHeight / 2, tx = mx, ty = my;

      addEventListener('pointermove', e => {
        mx = e.clientX;
        my = e.clientY;
        cur.style.opacity = '1';
        trail.style.opacity = '1';
        cur.style.setProperty('--cx', `${mx}px`);
        cur.style.setProperty('--cy', `${my}px`);
        cur.classList.toggle('is-hover', Boolean(e.target?.closest('a, button, summary, input, label')));
      }, { passive: true });

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
      const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
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
        initRipples();
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
  // MÓDULO: SCROLL (Lenis único dono, ScrollTrigger.batch, Parallax e Magnet ≤ 8px)
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

          // Entradas escalonadas com ScrollTrigger.batch (once: true)
          ScrollTrigger.batch('.guide-card, .g-item, .tl-item', {
            once: true,
            start: 'top 88%',
            onEnter: batch => gsap.from(batch, { y: 28, opacity: 0, duration: 0.55, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity' })
          });

          const track = $('.track');
          const citySec = $('#city');
          const cityBar = $('#city-bar');
          const cityTime = $('#city-time');
          const timeKeys = ['v_time_0', 'v_time_1', 'v_time_2', 'v_time_3'];
          if (track && citySec) {
            const hTween = gsap.to(track, {
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
                  cityModule.setPhase(phase);
                  if (cityTime) cityTime.textContent = window.I18N[lang][timeKeys[phase]];
                }
              }
            });

            // Parallax interno nos painéis horizontais
            $$('#city .panel-bg').forEach(bg => {
              gsap.to(bg, {
                xPercent: -10,
                ease: 'none',
                scrollTrigger: { trigger: bg.closest('.panel'), containerAnimation: hTween, start: 'left right', end: 'right left', scrub: true }
              });
            });
          }

          // Magnet refinado com limite de deslocamento <= 8px
          if (hasFinePointer) {
            const clamp8 = v => Math.max(-8, Math.min(8, v));
            $$('.mag').forEach(btn => {
              btn.addEventListener('pointermove', e => {
                const r = btn.getBoundingClientRect();
                gsap.to(btn, {
                  x: clamp8((e.clientX - r.left - r.width / 2) * 0.16),
                  y: clamp8((e.clientY - r.top - r.height / 2) * 0.16),
                  duration: 0.25,
                  ease: 'power2.out'
                });
              });
              btn.addEventListener('pointerleave', () => {
                gsap.to(btn, { x: 0, y: 0, duration: 0.45, ease: 'elastic.out(1, 0.5)' });
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
    if (!/^\S+@\S+\.\S+$/.test(em)) { errEl.textContent = dict.err_email; $('#email').focus(); return; }
    if (!$('#lgpd').checked) { errEl.textContent = dict.err_lgpd; $('#lgpd').focus(); return; }
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
      cityModule.destroy();
      fxModule.destroy();
      radioModule.updateTexts();
      $$('#words span').forEach(s => { s.style.opacity = '1'; });
    } else {
      heroModule.init();
      cityModule.init();
      fxModule.init();
      scrollModule.init();
      radioModule.updateTexts();
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
    cityModule.init();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { fxModule.init(); scrollModule.init(); }, { timeout: 1200 });
    } else {
      setTimeout(() => { fxModule.init(); scrollModule.init(); }, 100);
    }
  }, reduceMotion ? 100 : 750);
})();
