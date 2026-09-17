/**
 * 3aks.me — Main Client Script
 * Powered by Anime.js & motion.dev
 * Author: Arjun Sharma (3aks)
 */

document.addEventListener('DOMContentLoaded', () => {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  setupHeader();
  setupFilterTabs(prefersReduced);
  setupTerminal(prefersReduced);
  setupRepoSync(prefersReduced);
  setupFooterYear();

  initStartupAnimation(prefersReduced);

  if (!prefersReduced) {
    initCardTilt();
  }
});

/* ==========================================================================
   Anime.js: Startup Sequence (Black Screen -> Colour Logo -> Nav Bar -> Lines -> Text & Buttons)
   ========================================================================== */
function initStartupAnimation(prefersReduced) {
  const overlay = document.getElementById('startupOverlay');
  const scrambleWrap = document.getElementById('startupScrambleWrap');
  const scrambleBrand = document.getElementById('scrambleBrand');
  const targetLogo = document.getElementById('siteLogo') || document.querySelector('.brand-logo');

  if (!overlay || !scrambleWrap || !scrambleBrand) {
    return;
  }

  // If reduced motion is requested or anime.js is unavailable, immediately reveal
  if (prefersReduced || !window.anime) {
    document.body.classList.remove('intro-running');
    overlay.style.display = 'none';
    scrambleWrap.remove();
    if (targetLogo) {
      targetLogo.style.opacity = '1';
      targetLogo.style.visibility = 'visible';
    }
    const lines = document.querySelectorAll('.header-line, .hero-line, .section-line');
    lines.forEach(l => l.style.transform = 'scaleX(1)');
    setupScrollReveals(true);
    return;
  }

  let isDismissed = false;
  let scrambleTimer = null;

  // Measure initial natural bounds
  const wrapRect = scrambleWrap.getBoundingClientRect();
  const startX = (window.innerWidth - wrapRect.width) / 2;
  const startY = (window.innerHeight - wrapRect.height) / 2;

  // Center the scramble wrap in the viewport using Anime.js
  anime.set(scrambleWrap, {
    translateX: startX,
    translateY: startY,
    scale: 1,
    transformOrigin: '0% 0%'
  });

  const TARGET_TEXT = '<3aks.me/>';
  const CHAR_POOL = '0123456789ABCDEF!<>-_\\/[]{}—=+*^?#';

  function buildScrambleHtml(lockedCount) {
    let html = '';
    for (let i = 0; i < TARGET_TEXT.length; i++) {
      const isLocked = i < lockedCount;
      const char = isLocked ? TARGET_TEXT[i] : CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)];
      const escaped = char === '<' ? '&lt;' : char === '>' ? '&gt;' : char;

      let cls = 'scramble-text';
      if (i === 0 || i >= 8) {
        cls = 'scramble-bracket';
      } else if (i >= 5 && i <= 7) {
        cls = 'scramble-accent';
      }

      html += `<span class="${cls}">${escaped}</span>`;
    }
    return html;
  }

  function dismissImmediately() {
    if (isDismissed) return;
    isDismissed = true;
    if (scrambleTimer) clearInterval(scrambleTimer);
    window.removeEventListener('click', onUserInteraction);
    window.removeEventListener('keydown', onUserInteraction);

    anime.remove([overlay, scrambleWrap, '.header-line', '#heroLine', '.section-line', '.desktop-nav .nav-link', '#navGithubLink', '#mobileMenuBtn', '.hero-status', '.hero-heading', '.hero-lead', '.hero-actions .btn', '.quick-facts .fact', '.code-card']);

    overlay.style.display = 'none';
    scrambleWrap.remove();
    document.body.classList.remove('intro-running');

    if (targetLogo) {
      targetLogo.style.opacity = '1';
      targetLogo.style.visibility = 'visible';
    }

    const lines = document.querySelectorAll('.header-line, .hero-line, .section-line');
    lines.forEach(l => l.style.transform = 'scaleX(1)');

    const heroEls = document.querySelectorAll('.desktop-nav .nav-link, #navGithubLink, #mobileMenuBtn, .hero-status, .hero-heading, .hero-lead, .hero-actions .btn, .quick-facts .fact, .code-card');
    heroEls.forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });

    setupScrollReveals(true);
  }

  const onUserInteraction = (e) => {
    if (e.key === 'Escape' || e.type === 'click') {
      dismissImmediately();
    }
  };

  overlay.addEventListener('click', onUserInteraction);
  window.addEventListener('keydown', onUserInteraction);

  // Step 1: Black screen to colour logo scramble
  const totalFrames = 19;
  const frameInterval = 28; // ~530ms total
  let currentFrame = 0;

  scrambleTimer = setInterval(() => {
    if (isDismissed) {
      clearInterval(scrambleTimer);
      return;
    }

    currentFrame++;
    const progress = currentFrame / totalFrames;
    const lockedCount = Math.floor(progress * (TARGET_TEXT.length + 1));
    scrambleBrand.innerHTML = buildScrambleHtml(lockedCount);

    if (currentFrame >= totalFrames) {
      clearInterval(scrambleTimer);
      scrambleBrand.innerHTML = buildScrambleHtml(TARGET_TEXT.length);

      // Step 2: Brief pause (120ms), then glide colour logo to nav bar
      setTimeout(() => {
        if (isDismissed) return;
        flyToHeader();
      }, 120);
    }
  }, frameInterval);

  // Step 3: Glide colour logo into nav bar
  function flyToHeader() {
    if (!targetLogo) {
      dismissImmediately();
      return;
    }

    const targetRect = targetLogo.getBoundingClientRect();
    const targetScale = targetRect.height / wrapRect.height;
    const deltaW = targetRect.width - (wrapRect.width * targetScale);
    const deltaH = targetRect.height - (wrapRect.height * targetScale);
    const endX = targetRect.left + (deltaW / 2);
    const endY = targetRect.top + (deltaH / 2);

    // Concurrently: 1) Glide scramble wrap to navbar logo, 2) Fade black overlay
    anime({
      targets: scrambleWrap,
      translateX: [startX, endX],
      translateY: [startY, endY],
      scale: [1, targetScale],
      duration: 520,
      easing: 'cubicBezier(0.16, 1, 0.3, 1)',
      complete: () => {
        if (!isDismissed) {
          // Hand off seamlessly to navbar logo — no black blink
          targetLogo.style.opacity = '1';
          targetLogo.style.visibility = 'visible';
          document.body.classList.remove('intro-running');
          scrambleWrap.remove();

          // Step 4: Load horizontal lines, THEN all text and buttons
          animateLinesAndContent();
        }
      }
    });

    anime({
      targets: overlay,
      opacity: [1, 0],
      duration: 400,
      delay: 40,
      easing: 'easeInOutQuad',
      complete: () => {
        overlay.style.display = 'none';
      }
    });
  }

  // Step 4: Load horizontal lines, THEN all the text and buttons (Anime.js)
  function animateLinesAndContent() {
    const masterTimeline = anime.timeline({
      easing: 'easeOutQuart'
    });

    // 1. Horizontal lines draw across
    masterTimeline.add({
      targets: ['.header-line', '#heroLine'],
      scaleX: [0, 1],
      duration: 480,
      delay: anime.stagger(90),
      easing: 'easeOutQuart'
    })
    // 2. Header nav links & GitHub button
    .add({
      targets: ['.desktop-nav .nav-link', '#navGithubLink', '#mobileMenuBtn'],
      opacity: [0, 1],
      translateY: [-6, 0],
      delay: anime.stagger(35),
      duration: 320,
      easing: 'easeOutCubic'
    }, '-=240')
    // 3. Hero status badge
    .add({
      targets: '.hero-status',
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 280,
      easing: 'easeOutCubic'
    }, '-=240')
    // 4. Hero heading
    .add({
      targets: '.hero-heading',
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 340,
      easing: 'easeOutCubic'
    }, '-=220')
    // 5. Hero lead text
    .add({
      targets: '.hero-lead',
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 300,
      easing: 'easeOutCubic'
    }, '-=200')
    // 6. Hero action buttons
    .add({
      targets: '.hero-actions .btn',
      opacity: [0, 1],
      translateY: [8, 0],
      delay: anime.stagger(50),
      duration: 280,
      easing: 'easeOutCubic'
    }, '-=180')
    // 7. Quick facts
    .add({
      targets: '.quick-facts .fact',
      opacity: [0, 1],
      translateY: [8, 0],
      delay: anime.stagger(40),
      duration: 260,
      easing: 'easeOutCubic'
    }, '-=160')
    // 8. Profile code card
    .add({
      targets: '.code-card',
      opacity: [0, 1],
      scale: [0.97, 1],
      translateY: [12, 0],
      duration: 400,
      easing: 'easeOutQuad',
      complete: () => {
        // Initialize scroll observer for sections below
        setupScrollReveals(false);
      }
    }, '-=260');
  }
}

/* ==========================================================================
   Anime.js: Scroll-Triggered Appearing Animations (Lines -> Text & Cards)
   ========================================================================== */
function setupScrollReveals(immediate) {
  document.body.classList.add('js-ready');
  const sections = document.querySelectorAll('main section.section');

  if (immediate || !window.IntersectionObserver) {
    document.querySelectorAll('.section-line').forEach(l => l.style.transform = 'scaleX(1)');
    document.querySelectorAll('.scroll-item').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const section = entry.target;
        obs.unobserve(section);

        const line = section.querySelector('.section-line');
        const items = section.querySelectorAll('.scroll-item');

        const secTl = anime.timeline({ easing: 'easeOutQuart' });
        if (line) {
          secTl.add({
            targets: line,
            scaleX: [0, 1],
            duration: 480,
            easing: 'easeOutQuart'
          });
        }

        if (items.length > 0) {
          secTl.add({
            targets: items,
            opacity: [0, 1],
            translateY: [18, 0],
            delay: anime.stagger(50),
            duration: 380,
            easing: 'easeOutCubic'
          }, line ? '-=240' : 0);
        }
      }
    });
  }, {
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1
  });

  sections.forEach(s => observer.observe(s));
}

/* Anime.js: Subtle 3D Card Hover */
function initCardTilt() {
  const card = document.querySelector('.code-card');
  if (!card || !window.anime) return;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    const rotX = -(y / (rect.height / 2)) * 3;
    const rotY = (x / (rect.width / 2)) * 3;

    anime({
      targets: card,
      rotateX: rotX,
      rotateY: rotY,
      duration: 120,
      easing: 'easeOutQuad'
    });
  });

  card.addEventListener('mouseleave', () => {
    anime({
      targets: card,
      rotateX: 0,
      rotateY: 0,
      duration: 350,
      easing: 'easeOutCubic'
    });
  });
}

/* ==========================================================================
   Header & Mobile Navigation
   ========================================================================== */
function setupHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileNav');
  const links = document.querySelectorAll('.mobile-nav-link');

  const onScroll = () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const isOpen = drawer.classList.toggle('open');
      toggle.classList.toggle('active', isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    links.forEach(l => {
      l.addEventListener('click', () => {
        drawer.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      if (drawer.classList.contains('open') && !header.contains(e.target)) {
        drawer.classList.remove('open');
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Active section observer
  const navLinks = document.querySelectorAll('.desktop-nav .nav-link');
  const sections = document.querySelectorAll('main section[id]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          if (link.getAttribute('href') === `#${id}`) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        });
      }
    });
  }, { threshold: 0.35 });

  sections.forEach(s => observer.observe(s));
}

/* ==========================================================================
   Category Filter Tabs (Staggered with Anime.js)
   ========================================================================== */
function setupFilterTabs(prefersReduced) {
  const tabs = document.querySelectorAll('.filter-tab');
  const items = document.querySelectorAll('.project-item');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.getAttribute('data-filter');

      tabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const visibleItems = [];

      items.forEach(item => {
        const cat = item.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          item.style.display = 'flex';
          visibleItems.push(item);
        } else {
          item.style.display = 'none';
        }
      });

      if (!prefersReduced && window.anime && visibleItems.length > 0) {
        anime({
          targets: visibleItems,
          opacity: [0, 1],
          translateY: [6, 0],
          delay: anime.stagger(30),
          duration: 220,
          easing: 'easeOutQuad'
        });
      }
    });
  });
}

/* ==========================================================================
   Terminal CLI
   ========================================================================== */
function setupTerminal(prefersReduced) {
  const form = document.getElementById('terminalForm');
  const input = document.getElementById('terminalInput');
  const body = document.getElementById('terminalBody');
  const clearBtn = document.getElementById('clearTerminalBtn');
  const quickPills = document.querySelectorAll('.term-pill');

  if (!form || !input || !body) return;

  const history = [];
  let historyIndex = -1;

  const commands = {
    help: () => `
<span class="term-highlight">Available Commands:</span>
  <span class="term-cmd">whoami</span>    - Brief intro and identity
  <span class="term-cmd">projects</span>  - List key hardware & software builds
  <span class="term-cmd">skills</span>    - View engineering & microcontroller toolkit
  <span class="term-cmd">hardware</span>  - Specific details on embedded hardware builds
  <span class="term-cmd">contact</span>   - Show contact channels & links
  <span class="term-cmd">github</span>    - Open Arjun's GitHub profile
  <span class="term-cmd">clear</span>     - Wipe terminal screen
  <span class="term-cmd">echo [text]</span>- Print text back
    `,
    whoami: () => `
<span class="term-success">Arjun Sharma (@3aks)</span>
Embedded Systems Developer &amp; Hardware Builder
Focus: ESP32 microcontrollers, custom audio hardware, dual-MCU automotive bridges, and systems software.
Domain: <span class="term-highlight">https://3aks.me</span>
    `,
    projects: () => `
<span class="term-highlight">Recent Projects:</span>
  1. <span class="term-cmd">BMW-Dual-MCU-Bluetooth-Audio-Bridge</span> (C) - Embedded audio interface for BMW headunits
  2. <span class="term-cmd">Camera-Switching-Macropad</span> (Python) - Custom Hack Club physical macropad
  3. <span class="term-cmd">Custom-Mixer-ESP32</span> (Python/C) - Multi-channel audio mixer
  4. <span class="term-cmd">VoltaMetric</span> (Hardware) - Connected smart multimeter prototype
  5. <span class="term-cmd">Media-Keys-Fixer</span> (AutoHotkey) - Windows background utility for Spotify
    `,
    skills: () => `
<span class="term-highlight">Technical Toolkit:</span>
  [Hardware] : ESP32, STM32, C/Embedded C, Circuit Design, I2C, SPI, UART, CAN Bus
  [Software] : Python, AutoHotkey, Modern JavaScript, HTML/CSS, Git, Linux
  [Lab Tools]: Logic Analyzers, Multimeters, PlatformIO, VS Code, Hack Club Blueprint
    `,
    hardware: () => `
<span class="term-highlight">Embedded &amp; Hardware Highlights:</span>
  &bull; <span class="term-cmd">BMW Bridge:</span> Built dual-microcontroller bus translator for factory automotive audio.
  &bull; <span class="term-cmd">Hack Club Macropad:</span> Designed hardware layout and programmed custom video switcher.
  &bull; <span class="term-cmd">ESP32 Mixer:</span> Multi-potentiometer DAC/ADC audio mixing board.
    `,
    contact: () => `
<span class="term-highlight">Get in Touch:</span>
  GitHub : <a href="https://github.com/3aks" target="_blank" class="term-highlight" style="text-decoration:underline;">https://github.com/3aks</a>
  Website: <a href="https://3aks.me" class="term-highlight" style="text-decoration:underline;">https://3aks.me</a>
  Status : Available for embedded systems collaborations & open-source projects.
    `,
    github: () => {
      window.open('https://github.com/3aks', '_blank');
      return `Opening <span class="term-highlight">https://github.com/3aks</span> in a new tab...`;
    }
  };

  function executeCommand(rawInput) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    // Add to history
    history.push(trimmed);
    historyIndex = history.length;

    // Print command line
    const cmdLine = document.createElement('div');
    cmdLine.className = 'terminal-line';
    cmdLine.innerHTML = `<span class="prompt-user">visitor</span><span class="prompt-at">@</span><span class="prompt-host">3aks.me</span>:<span class="prompt-path">~</span>$&nbsp;<span class="term-cmd">${escapeHtml(trimmed)}</span>`;
    body.appendChild(cmdLine);

    // Process command
    const parts = trimmed.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    const outputLine = document.createElement('div');
    outputLine.className = 'terminal-line';

    if (cmd === 'clear') {
      body.innerHTML = '';
      return;
    } else if (cmd === 'echo') {
      outputLine.innerHTML = `<span>${escapeHtml(args)}</span>`;
    } else if (commands[cmd]) {
      outputLine.innerHTML = commands[cmd]();
    } else {
      outputLine.innerHTML = `<span class="term-error">command not found: '${escapeHtml(cmd)}'. Type <span class="term-highlight">'help'</span> for list of commands.</span>`;
    }

    body.appendChild(outputLine);
    body.scrollTop = body.scrollHeight;

    if (!prefersReduced && window.anime) {
      anime({
        targets: [cmdLine, outputLine],
        opacity: [0, 1],
        translateY: [4, 0],
        duration: 140,
        easing: 'easeOutQuad'
      });
    }
  }

  // Handle Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executeCommand(input.value);
    input.value = '';
  });

  // Handle Up/Down Arrow History
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (historyIndex > 0) {
        historyIndex--;
        input.value = history[historyIndex];
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (historyIndex < history.length - 1) {
        historyIndex++;
        input.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        input.value = '';
      }
      e.preventDefault();
    }
  });

  // Quick pills click
  quickPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const cmd = pill.getAttribute('data-cmd');
      if (cmd) {
        executeCommand(cmd);
      }
    });
  });

  // Clear button click
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      body.innerHTML = '';
    });
  }
}

/* ==========================================================================
   GitHub Live Stats & Counter Animation (Anime.js)
   ========================================================================== */
async function setupRepoSync(prefersReduced) {
  try {
    const res = await fetch('https://api.github.com/users/3aks/repos?sort=updated');
    if (!res.ok) return;
    const repos = await res.json();
    if (!Array.isArray(repos)) return;

    const countEl = document.getElementById('repoCountStat');
    if (countEl) {
      const count = repos.length;
      if (!prefersReduced && window.anime) {
        const counter = { val: 0 };
        anime({
          targets: counter,
          val: count,
          round: 1,
          duration: 900,
          easing: 'easeOutExpo',
          update: () => {
            countEl.textContent = counter.val;
          }
        });
      } else {
        countEl.textContent = count;
      }
    }
  } catch {
    // Fallback stays in place
  }
}

/* Footer Year */
function setupFooterYear() {
  const yr = document.getElementById('currentYear');
  if (yr) yr.textContent = new Date().getFullYear();
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, t => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[t] || t));
}
