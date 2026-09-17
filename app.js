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
    initInViewReveals();
    initCardTilt();
  }
});

/* ==========================================================================
   Anime.js: Startup Sequence (Circuit / Telemetry Animation)
   ========================================================================== */
function initStartupAnimation(prefersReduced) {
  const loader = document.getElementById('startupLoader');
  if (!loader) {
    if (!prefersReduced) initHeroTimeline();
    return;
  }

  // If user prefers reduced motion or anime.js isn't available, skip immediately
  if (prefersReduced || !window.anime) {
    loader.style.display = 'none';
    return;
  }

  const fill = document.getElementById('startupProgressFill');
  const counter = document.getElementById('startupCounter');
  const status = document.getElementById('startupStatus');
  const skipBtn = document.getElementById('startupSkipBtn');

  let isDismissed = false;

  function dismissLoader() {
    if (isDismissed) return;
    isDismissed = true;

    anime({
      targets: loader,
      opacity: [1, 0],
      scale: [1, 1.04],
      duration: 380,
      easing: 'easeInOutQuad',
      complete: () => {
        loader.style.display = 'none';
        initHeroTimeline();
      }
    });
  }

  // Allow skip via button, click anywhere on loader, or ESC key
  if (skipBtn) skipBtn.addEventListener('click', dismissLoader);
  loader.addEventListener('click', (e) => {
    if (e.target !== skipBtn) dismissLoader();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismissLoader();
  });

  // Prepare initial SVG stroke dashoffset
  const hexAccent = loader.querySelector('.hex-accent');
  if (hexAccent && anime.setDashoffset) {
    hexAccent.style.strokeDashoffset = anime.setDashoffset(hexAccent);
  }

  const diamondInner = loader.querySelector('.diamond-inner');
  if (diamondInner && anime.setDashoffset) {
    diamondInner.style.strokeDashoffset = anime.setDashoffset(diamondInner);
  }

  // Anime.js Timeline: Sequential Path Drawing & Micro-interactions
  const tl = anime.timeline({
    easing: 'easeOutExpo',
    complete: () => {
      setTimeout(dismissLoader, 160);
    }
  });

  // 1. Draw outer SVG circuit hexagon
  tl.add({
    targets: '.hex-accent',
    strokeDashoffset: [anime.setDashoffset, 0],
    duration: 650,
    easing: 'easeInOutQuart'
  })
  // 2. Light up the 6 circuit nodes with a stagger
  .add({
    targets: '.svg-node',
    scale: [0, 1],
    opacity: [0, 1],
    delay: anime.stagger(45),
    duration: 320,
    easing: 'easeOutBack'
  }, '-=380')
  // 3. Center diamond draw and rotate
  .add({
    targets: '.diamond-inner',
    strokeDashoffset: [anime.setDashoffset, 0],
    scale: [0.75, 1],
    rotate: [45, 0],
    duration: 450,
    easing: 'easeOutCubic'
  }, '-=280')
  // 4. Reveal brackets with smooth outward slide
  .add({
    targets: '.startup-bracket-l',
    translateX: [-18, 0],
    opacity: [0, 1],
    duration: 340,
    easing: 'easeOutExpo'
  }, '-=320')
  .add({
    targets: '.startup-bracket-r',
    translateX: [18, 0],
    opacity: [0, 1],
    duration: 340,
    easing: 'easeOutExpo'
  }, '-=340')
  // 5. Reveal brand text
  .add({
    targets: '.startup-core-text',
    opacity: [0, 1],
    scale: [0.85, 1],
    letterSpacing: ['0.08em', '-0.02em'],
    duration: 340,
    easing: 'easeOutQuad'
  }, '-=300');

  // Concurrently animate progress bar and counter from 0 to 100
  const counterObj = { val: 0 };
  anime({
    targets: counterObj,
    val: 100,
    round: 1,
    duration: 1050,
    easing: 'easeInOutCubic',
    update: () => {
      if (counter) counter.textContent = `${counterObj.val}%`;
      if (fill) fill.style.width = `${counterObj.val}%`;
      if (status) {
        if (counterObj.val < 32) {
          status.textContent = 'INITIALIZING CORE...';
        } else if (counterObj.val < 72) {
          status.textContent = 'CHECKING MCU BUSES...';
        } else if (counterObj.val < 100) {
          status.textContent = 'HARDWARE SYSTEM READY';
        } else {
          status.textContent = 'WELCOME // 3AKS.ME';
        }
      }
    }
  });
}

/* ==========================================================================
   Motion.dev: In-View Reveals
   ========================================================================== */

function initInViewReveals() {
  if (!window.Motion || !Motion.inView || !Motion.animate) return;

  try {
    const targets = document.querySelectorAll('.project-item');
    targets.forEach(el => {
      Motion.inView(el, ({ target }) => {
        Motion.animate(target, { y: [10, 0] }, { duration: 0.35, easing: [0.16, 1, 0.3, 1] });
      }, { amount: 0.1 });
    });
  } catch (err) {
    console.debug('InView skipped:', err);
  }
}

/* ==========================================================================
   Anime.js: Hero Entrance & Micro-interactions
   ========================================================================== */
function initHeroTimeline() {
  if (!window.anime) return;

  try {
    const tl = anime.timeline({
      easing: 'easeOutCubic'
    });

    tl.add({
      targets: '.site-header',
      opacity: [0, 1],
      translateY: [-16, 0],
      duration: 320
    })
    .add({
      targets: '.hero-status',
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 300
    }, '-=180')
    .add({
      targets: '.hero-heading',
      opacity: [0, 1],
      translateY: [12, 0],
      duration: 350
    }, '-=180')
    .add({
      targets: '.hero-lead',
      opacity: [0, 1],
      translateY: [10, 0],
      duration: 300
    }, '-=200')
    .add({
      targets: '.hero-actions .btn',
      opacity: [0, 1],
      translateY: [8, 0],
      delay: anime.stagger(50),
      duration: 260
    }, '-=180')
    .add({
      targets: '.quick-facts .fact',
      opacity: [0, 1],
      translateY: [8, 0],
      delay: anime.stagger(40),
      duration: 260
    }, '-=160')
    .add({
      targets: '.code-card',
      opacity: [0, 1],
      scale: [0.97, 1],
      duration: 400,
      easing: 'easeOutQuad'
    }, '-=260');
  } catch (err) {
    console.debug('Hero timeline skipped:', err);
  }
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
