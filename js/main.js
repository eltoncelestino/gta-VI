(() => {
  const CFG = window.GTA_CONFIG || {};
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let lang = 'pt';
  let uiSfxEnabled = Boolean(CFG.features?.uiSound);
  let activeChar = 0;
  let lbIndex = 0;
  let lbLastFocus = null;
  let modalLastFocus = null;

  const vibrate = (ms = 12) => {
    if (CFG.features?.haptics && navigator.vibrate && !reduceMotion) {
      navigator.vibrate(ms);
    }
  };

  // =========================================================================
  // 1. CONFIGURAÇÃO DE LINKS E SELO PÓS-LANÇAMENTO
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

  // =========================================================================
  // 2. BLUR-UP PLACEHOLDERS (BASE64)
  // =========================================================================
  fetch('assets/placeholders.json')
    .then(r => (r.ok ? r.json() : {}))
    .then(map => {
      $$('img[data-placeholder]').forEach(img => {
        const b64 = map[img.dataset.placeholder];
        if (b64 && !img.complete) {
          img.style.backgroundImage = `url("${b64}")`;
        }
      });
    })
    .catch(() => {});

  // =========================================================================
  // 3. SPLIT TITLE LETTERS & STORY WORDS
  // =========================================================================
  $$('#title span').forEach(span => {
    span.innerHTML = [...span.textContent]
      .map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`)
      .join('');
  });

  function splitWords() {
    const p = $('#words');
    if (!p) return;
    p.innerHTML = p.textContent
      .trim()
      .split(/\s+/)
      .map(w => `<span>${w}</span> `)
      .join('');
    if (reduceMotion || !window.gsap) {
      $$('span', p).forEach(s => { s.style.opacity = '1'; });
    }
  }

  // =========================================================================
  // 4. I18N (PT / EN)
  // =========================================================================
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
    const langBtn = $('#lang');
    if (langBtn) langBtn.textContent = lang === 'pt' ? 'EN' : 'PT';
    const sfxBtn = $('#sfx-toggle');
    if (sfxBtn) sfxBtn.textContent = uiSfxEnabled ? dict.ui_sfx_on : dict.ui_sfx_off;
    updateDaysSinceLaunch();
    splitWords();
    renderChar(activeChar, false);
    updateRadioTexts();
  }

  $('#lang')?.addEventListener('click', () => {
    vibrate(10);
    playUiClick();
    setLang(lang === 'pt' ? 'en' : 'pt');
  });

  // =========================================================================
  // 5. PERSONAGENS (TILT 3D + VIEW TRANSITIONS + MASK WIPE)
  // =========================================================================
  const CHARS = [
    {
      name: 'Lucia',
      monogram: 'L',
      quoteKey: 'c_l_q',
      img: 'assets/char-lucia.webp',
      srcset: 'assets/char-lucia-480.webp 480w, assets/char-lucia-960.webp 960w, assets/char-lucia-1200.webp 1200w',
      altKey: 'alt_lucia',
      stats: [
        ['stat_cunning', 92],
        ['stat_focus', 84],
        ['stat_street', 88]
      ]
    },
    {
      name: 'Jason',
      monogram: 'J',
      quoteKey: 'c_j_q',
      img: 'assets/char-jason.webp',
      srcset: 'assets/char-jason-480.webp 480w, assets/char-jason-960.webp 960w, assets/char-jason-1200.webp 1200w',
      altKey: 'alt_jason',
      stats: [
        ['stat_cunning', 80],
        ['stat_focus', 90],
        ['stat_street', 86]
      ]
    }
  ];

  function renderChar(idx, animate = true) {
    activeChar = idx;
    const c = CHARS[idx];
    const dict = window.I18N[lang];
    const card = $('#card');
    const applyUpdate = () => {
      $('#cname').textContent = c.name;
      $('#cquote').textContent = dict[c.quoteKey];
      $('#portrait-monogram').textContent = c.monogram;
      const img = $('#char-img');
      img.src = c.img;
      img.srcset = c.srcset;
      img.alt = dict[c.altKey];
      $('#bars').innerHTML = c.stats
        .map(([key, val]) => `<li><span>${dict[key]} — ${val}%</span><i><u style="width:${animate && !reduceMotion ? 0 : val}%" data-w="${val}"></u></i></li>`)
        .join('');
      $$('.tabs button').forEach((b, j) => b.setAttribute('aria-selected', String(j === idx)));
      card.setAttribute('aria-labelledby', `tab-char-${idx}`);
      if (animate && !reduceMotion) {
        card.classList.remove('mask-wipe');
        void card.offsetWidth;
        card.classList.add('mask-wipe');
        requestAnimationFrame(() => {
          $$('#bars u').forEach(u => { u.style.width = `${u.dataset.w}%`; });
        });
      }
    };

    if (animate && !reduceMotion && document.startViewTransition) {
      document.startViewTransition(applyUpdate);
    } else {
      applyUpdate();
    }
  }

  $$('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = Number(btn.dataset.c);
      if (next === activeChar) return;
      vibrate(12);
      playUiClick();
      renderChar(next, true);
    });
  });

  const charCard = $('#card');
  if (charCard && hasFinePointer && !reduceMotion) {
    charCard.addEventListener('pointermove', e => {
      const r = charCard.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      charCard.style.transform = `perspective(1000px) rotateY(${x * 9}deg) rotateX(${-y * 9}deg)`;
    });
    charCard.addEventListener('pointerleave', () => {
      charCard.style.transform = '';
    });
  }

  // =========================================================================
  // 6. MODO FOTO DA COMUNIDADE (FILTROS + LIGHTBOX + ZOOM + SWIPE + FOCUS TRAP)
  // =========================================================================
  const galleryGrid = $('#gallery-grid');
  const galleryBtns = $$('.g-btn');
  const lightbox = $('#lightbox');
  const lbImg = $('#lb-img');
  const lbCap = $('#lb-cap');
  const lbCounter = $('#lb-counter');
  const lbZoomBtn = $('#lb-zoom');

  $$('.filter-bar .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      vibrate(10);
      playUiClick();
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

  function showLightboxSlide(idx) {
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
    lbLastFocus = trigger || document.activeElement;
    showLightboxSlide(idx);
    lightbox.hidden = false;
    $('#lb-close').focus();
  }

  function closeLightbox() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lbImg.classList.remove('zoomed');
    if (lbLastFocus && typeof lbLastFocus.focus === 'function') lbLastFocus.focus();
  }

  galleryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      vibrate(10);
      playUiClick();
      openLightbox(Number(btn.dataset.index), btn);
    });
  });

  $('#lb-prev')?.addEventListener('click', () => { vibrate(8); showLightboxSlide(lbIndex - 1); });
  $('#lb-next')?.addEventListener('click', () => { vibrate(8); showLightboxSlide(lbIndex + 1); });
  $('#lb-close')?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

  const toggleZoom = () => {
    const z = lbImg.classList.toggle('zoomed');
    lbZoomBtn.setAttribute('aria-pressed', String(z));
  };
  lbZoomBtn?.addEventListener('click', toggleZoom);
  lbImg?.addEventListener('click', toggleZoom);

  // Touch swipe in Lightbox
  let touchStartX = 0;
  $('#lb-stage')?.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });
  $('#lb-stage')?.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 45) {
      showLightboxSlide(dx > 0 ? lbIndex - 1 : lbIndex + 1);
    }
  }, { passive: true });

  // =========================================================================
  // 7. MODAIS & FOCUS TRAP + ESC
  // =========================================================================
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

  const trailerModal = $('#trailer-modal');
  const trailerIframe = $('#trailer-iframe');
  $$('[data-open]').forEach(btn => {
    btn.addEventListener('click', () => {
      vibrate(12);
      playUiClick();
      modalLastFocus = document.activeElement;
      const target = $('#' + btn.dataset.open);
      if (target) {
        if (target === trailerModal && trailerIframe && trailerIframe.dataset.src) {
          trailerIframe.src = trailerIframe.dataset.src;
        }
        target.hidden = false;
        $('[data-close]', target)?.focus();
      }
    });
  });

  function closeModals() {
    if (!trailerModal.hidden) {
      trailerModal.hidden = true;
      if (trailerIframe) trailerIframe.src = '';
      if (modalLastFocus && typeof modalLastFocus.focus === 'function') modalLastFocus.focus();
    }
    closeLightbox();
  }

  $$('[data-close]').forEach(btn => btn.addEventListener('click', closeModals));
  trailerModal?.addEventListener('click', e => { if (e.target === trailerModal) closeModals(); });

  addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModals();
    if (!lightbox.hidden) {
      if (e.key === 'ArrowLeft') showLightboxSlide(lbIndex - 1);
      if (e.key === 'ArrowRight') showLightboxSlide(lbIndex + 1);
      trapFocus(lightbox, e);
    } else if (!trailerModal.hidden) {
      trapFocus(trailerModal, e);
    }
  });

  // =========================================================================
  // 8. WEB AUDIO API: RÁDIO CC0 PROCEDURAL + EQUALIZADOR + SFX OPCIONAL
  // =========================================================================
  let audioCtx = null;
  let masterGain = null;
  let analyser = null;
  let radioPlaying = false;
  let stationIdx = 0;
  let seqTimer = null;
  let eqRaf = null;
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

  function playUiClick() {
    if (!uiSfxEnabled || reduceMotion) return;
    try {
      ensureAudio();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, audioCtx.currentTime + 0.055);
      g.gain.setValueAtTime(0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.06);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.065);
    } catch {}
  }

  $('#sfx-toggle')?.addEventListener('click', e => {
    uiSfxEnabled = !uiSfxEnabled;
    e.currentTarget.setAttribute('aria-pressed', String(uiSfxEnabled));
    const dict = window.I18N[lang];
    e.currentTarget.textContent = uiSfxEnabled ? dict.ui_sfx_on : dict.ui_sfx_off;
    vibrate(10);
    if (uiSfxEnabled) playUiClick();
  });

  function playSynthStep(step) {
    if (!radioPlaying || !audioCtx) return;
    const st = stations[stationIdx];
    const now = audioCtx.currentTime;
    const freq = st.chord[step % st.chord.length];

    // Warm synth pad/arp
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const g = audioCtx.createGain();
    osc.type = stationIdx === 1 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq * (step % 8 === 0 ? 0.5 : 1), now);
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

  function startRadioLoop() {
    clearInterval(seqTimer);
    let step = 0;
    const intervalMs = Math.round(60000 / (stations[stationIdx].bpm * 2));
    playSynthStep(step++);
    seqTimer = setInterval(() => playSynthStep(step++), intervalMs);
    drawEqualizer();
  }

  function stopRadioLoop() {
    clearInterval(seqTimer);
    cancelAnimationFrame(eqRaf);
    const canvas = $('#eq-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawEqualizer() {
    const canvas = $('#eq-canvas');
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    const data = new Uint8Array(analyser.frequencyBinCount);
    const render = () => {
      if (!radioPlaying) return;
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 24;
      const bw = canvas.width / bars;
      for (let i = 0; i < bars; i++) {
        const val = (data[i] || 18) / 255;
        const bh = Math.max(8, val * canvas.height * 0.9);
        ctx.fillStyle = i % 2 === 0 ? '#14E0D0' : '#FF2E88';
        ctx.fillRect(i * bw + 3, canvas.height - bh, bw - 6, bh);
      }
      eqRaf = requestAnimationFrame(render);
    };
    render();
  }

  function updateRadioTexts() {
    const st = stations[stationIdx];
    const dict = window.I18N[lang];
    $('#station-name').textContent = st.name;
    $('#station-genre').textContent = st.genre;
    const toggleBtn = $('#radio-toggle');
    const badge = $('#on-air-badge');
    const statusText = $('#radio-status-text');
    if (toggleBtn) {
      toggleBtn.textContent = radioPlaying ? dict.r_mute : dict.r_play;
      toggleBtn.setAttribute('aria-pressed', String(radioPlaying));
    }
    if (badge) {
      badge.textContent = radioPlaying ? 'ON AIR' : 'MUTED';
      badge.classList.toggle('live', radioPlaying);
    }
    if (statusText) {
      statusText.textContent = radioPlaying ? dict.r_status_playing : dict.r_status_muted;
    }
  }

  $('#radio-toggle')?.addEventListener('click', () => {
    vibrate(14);
    ensureAudio();
    radioPlaying = !radioPlaying;
    if (radioPlaying) startRadioLoop();
    else stopRadioLoop();
    updateRadioTexts();
  });

  $('#station-next')?.addEventListener('click', () => {
    vibrate(10);
    playUiClick();
    stationIdx = (stationIdx + 1) % stations.length;
    updateRadioTexts();
    if (radioPlaying) startRadioLoop();
  });

  // =========================================================================
  // 9. FORMULÁRIO DE NEWSLETTER (VALIDAÇÃO NATIVA + LGPD)
  // =========================================================================
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

  // =========================================================================
  // 10. HERO PARALLAX (MOUSE + GIROSCÓPIO MOBILE) & CURSOR NEON
  // =========================================================================
  if (!reduceMotion && hasFinePointer) {
    const cur = $('.cursor');
    const trail = $('.cursor-trail');
    let mx = innerWidth / 2;
    let my = innerHeight / 2;
    let tx = mx;
    let ty = my;

    addEventListener('pointermove', e => {
      mx = e.clientX;
      my = e.clientY;
      cur.style.opacity = '1';
      trail.style.opacity = '1';
      cur.style.left = `${mx}px`;
      cur.style.top = `${my}px`;

      const target = e.target;
      const clickable = target && target.closest('a, button, summary, input, label');
      cur.classList.toggle('is-hover', Boolean(clickable));

      // Parallax do Hero pelo mouse
      const nx = (mx / innerWidth - 0.5) * 2;
      const ny = (my / innerHeight - 0.5) * 2;
      $$('#hero .layer').forEach(l => {
        const d = Number(l.dataset.depth || 0.03);
        l.style.transform = `translate3d(${nx * d * -60}px, ${ny * d * -35}px, 0)`;
      });
    }, { passive: true });

    const loopTrail = () => {
      tx += (mx - tx) * 0.16;
      ty += (my - ty) * 0.16;
      trail.style.left = `${tx}px`;
      trail.style.top = `${ty}px`;
      requestAnimationFrame(loopTrail);
    };
    requestAnimationFrame(loopTrail);
  }

  if (!reduceMotion && CFG.features?.gyroParallax && window.DeviceOrientationEvent) {
    addEventListener('deviceorientation', e => {
      if (e.gamma === null || e.beta === null) return;
      const gx = Math.max(-20, Math.min(20, e.gamma)) / 20;
      const gy = Math.max(-20, Math.min(20, e.beta - 45)) / 20;
      $$('#hero .layer').forEach(l => {
        const d = Number(l.dataset.depth || 0.03);
        l.style.transform = `translate3d(${gx * d * 45}px, ${gy * d * 28}px, 0)`;
      });
    }, { passive: true });
  }

  // =========================================================================
  // 11. FUNDO WEBGL LEVE (GRADIENTE PÔR DO SOL + ONDAS DE CALOR + VAGA-LUMES)
  // =========================================================================
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
        // Firefly glow particles
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

    let running = true;
    document.addEventListener('visibilitychange', () => { running = !document.hidden; });

    const start = performance.now();
    const frame = now => {
      if (running) {
        gl.uniform1f(uTime, (now - start) * 0.001);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // =========================================================================
  // 12. CARREGAMENTO SOB DEMANDA DE GSAP + SCROLLTRIGGER + LENIS
  // =========================================================================
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function initMotionStack() {
    if (reduceMotion) return;
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js');

      const { gsap, ScrollTrigger, Lenis } = window;
      gsap.registerPlugin(ScrollTrigger);

      const lenis = new Lenis();
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(t => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);

      // Revelação letra a letra do título
      gsap.from('.ch', { yPercent: 115, stagger: 0.035, duration: 0.9, ease: 'power4.out' });
      gsap.from('.hero-in > :not(#title)', { opacity: 0, y: 22, stagger: 0.1, delay: 0.35 });

      // Parallax pelo scroll no Hero
      $$('#hero .layer').forEach(l => {
        gsap.to(l, {
          y: () => Number(l.dataset.speed || 0) * 320,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
        });
      });

      // Palavras da história
      const words = $$('#words span');
      if (words.length) {
        gsap.to(words, {
          opacity: 1,
          stagger: 0.08,
          scrollTrigger: { trigger: '#words', start: 'top 82%', end: 'bottom 42%', scrub: true }
        });
      }

      // Vice City Imersiva (pinned + ciclo dia/noite)
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
              if (cityBar) cityBar.style.width = `${Math.max(8, Math.round(p * 100))}%`;
              const phase = Math.min(3, Math.floor(p * 4));
              citySec.dataset.tod = String(phase);
              if (cityTime) cityTime.textContent = window.I18N[lang][timeKeys[phase]];
            }
          }
        });
      }

      // Botões magnéticos
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
      // Fallback gracioso caso CDN esteja indisponível
      $$('#words span').forEach(s => { s.style.opacity = '1'; });
    }
  }

  // =========================================================================
  // 13. BOOT & LOADER NEON INTRO
  // =========================================================================
  applyConfigLinks();
  setLang('pt');

  const loaderBar = $('#loader u');
  if (loaderBar) {
    requestAnimationFrame(() => { loaderBar.style.width = '100%'; });
  }
  setTimeout(() => {
    const loader = $('#loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 500);
    }
    if (!reduceMotion) $('#hero')?.classList.add('camera-intro');
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => { initWebGL(); initMotionStack(); }, { timeout: 1200 });
    } else {
      setTimeout(() => { initWebGL(); initMotionStack(); }, 100);
    }
  }, reduceMotion ? 100 : 750);
})();
