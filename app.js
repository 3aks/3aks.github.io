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

  if (!prefersReduced) {
    initMotionScroll();
    initHeroTimeline();
    initInViewReveals();
    initCardTilt();
  }
});

/* ==========================================================================
   Motion.dev: Scroll Progress & In-View Reveals
   ========================================================================== */
function initMotionScroll() {
  const bar = document.getElementById('scrollProgressBar');
  if (!bar || !window.Motion || !Motion.scroll || !Motion.animate) return;

  Motion.scroll(
    Motion.animate(bar, { scaleX: [0, 1] }, { ease: 'linear' })
  );
}

function initInViewReveals() {
  if (!window.Motion || !Motion.inView || !Motion.animate) return;

  // Reveal sections cleanly as they enter the viewport
  const targets = document.querySelectorAll('.section-title, .about-content p, .skill-col, .contact-box');
  targets.forEach(el => {
    // Initial hidden state for inView
    el.style.opacity = '0';
    el.style.transform = 'translateY(14px)';

    Motion.inView(el, ({ target }) => {
      Motion.animate(
        target,
        { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0px)'] },
        { duration: 0.45, easing: [0.16, 1, 0.3, 1] }
      );
    }, { amount: 0.2 });
  });
}

/* ==========================================================================
   Anime.js: Hero Entrance & Micro-interactions
   ========================================================================== */
function initHeroTimeline() {
  if (!window.anime) return;

  const tl = anime.timeline({
    easing: 'easeOutCubic'
  });

  tl.add({
    targets: '.hero-status',
    opacity: [0, 1],
    translateY: [10, 0],
    duration: 350
  })
  .add({
    targets: '.hero-heading',
    opacity: [0, 1],
    translateY: [16, 0],
    duration: 450
  }, '-=150')
  .add({
    targets: '.hero-lead',
    opacity: [0, 1],
    translateY: [12, 0],
    duration: 400
  }, '-=200')
  .add({
    targets: '.hero-actions .btn',
    opacity: [0, 1],
    translateY: [10, 0],
    delay: anime.stagger(70),
    duration: 350
  }, '-=200')
  .add({
    targets: '.quick-facts .fact',
    opacity: [0, 1],
    translateY: [10, 0],
    delay: anime.stagger(60),
    duration: 350
  }, '-=150')
  .add({
    targets: '.code-card',
    opacity: [0, 1],
    scale: [0.97, 1],
    translateY: [14, 0],
    duration: 500,
    easing: 'easeOutQuad'
  }, '-=300');
}

/* Anime.js: Subtle 3D Card Hover */
function initCardTilt() {
  const card = document.querySelector('.code-card');
  if (!card || !window.anime) return;

  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    const rotX = -(y / (rect.height / 2)) * 3.5;
    const rotY = (x / (rect.width / 2)) * 3.5;

    anime({
      targets: card,
      rotateX: rotX,
      rotateY: rotY,
      duration: 150,
      easing: 'easeOutQuad'
    });
  });

  card.addEventListener('mouseleave', () => {
    anime({
      targets: card,
      rotateX: 0,
      rotateY: 0,
      duration: 400,
      easing: 'easeOutCubic'
    });
  });
}

/* ==========================================================================
   Header & Navigation
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
  }

  // Active section spy
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
          item.style.display = 'block';
          visibleItems.push(item);
        } else {
          item.style.display = 'none';
        }
      });

      if (!prefersReduced && window.anime && visibleItems.length > 0) {
        anime({
          targets: visibleItems,
          opacity: [0, 1],
          translateY: [10, 0],
          delay: anime.stagger(40),
          duration: 280,
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
  const output = document.getElementById('terminalBody');
  const clearBtn = document.getElementById('clearTerminalBtn');
  const shortcuts = document.querySelectorAll('.quick-cmd');

  if (!form || !input || !output) return;

  const history = [];
  let historyIdx = -1;

  const cmds = {
    help: () => `
Available commands:
  whoami    - About Arjun
  projects  - List active hardware and software projects
  hardware  - Hardware builds & microcontrollers
  contact   - GitHub profile and links
  clear     - Clear screen
    `,
    whoami: () => `Arjun Sharma (@3aks)
Hardware builder and programmer based at 3aks.me.
Focus: ESP32 microcontrollers, automotive bus bridges, circuit prototyping, and C/Python.`,
    projects: () => `Projects:
  1. BMW-Dual-MCU-Bluetooth-Audio-Bridge (C) - Dual-MCU audio bridge for BMW stereos
  2. Camera-Switching-Macropad (Python) - Hack Club macropad for video switching
  3. Custom-Mixer-ESP32 (C/Python) - Audio mixer on ESP32
  4. VoltaMetric (Hardware) - Connected multimeter prototype
  5. Media-Keys-Fixer (AutoHotkey) - Windows background key interceptor for Spotify`,
    hardware: () => `Hardware Details:
  - Microcontrollers: ESP32, STM32, Atmel AVR
  - Buses: UART, I2C, SPI, CAN bus
  - Lab Bench: Soldering, logic analyzer, multimeter`,
    contact: () => `GitHub: https://github.com/3aks
Site  : https://3aks.me`
  };

  function runCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    history.push(trimmed);
    historyIdx = history.length;

    // Command echo row
    const row = document.createElement('div');
    row.className = 'term-row';
    row.innerHTML = `<span class="term-prompt-label">3aks.me:$</span> <span>${escapeHtml(trimmed)}</span>`;
    output.appendChild(row);

    const cmd = trimmed.toLowerCase();
    const resultRow = document.createElement('div');
    resultRow.className = 'term-row';

    if (cmd === 'clear') {
      output.innerHTML = '';
      return;
    } else if (cmds[cmd]) {
      resultRow.innerHTML = `<pre style="font-family:inherit;margin:0;white-space:pre-wrap;">${escapeHtml(cmds[cmd]())}</pre>`;
    } else {
      resultRow.className = 'term-row error';
      resultRow.textContent = `command not found: ${trimmed}. Type 'help' for commands.`;
    }

    output.appendChild(resultRow);
    output.scrollTop = output.scrollHeight;

    // Anime.js entrance for new terminal line
    if (!prefersReduced && window.anime) {
      anime({
        targets: [row, resultRow],
        opacity: [0, 1],
        translateY: [4, 0],
        duration: 150,
        easing: 'easeOutQuad'
      });
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runCommand(input.value);
    input.value = '';
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
      if (historyIdx > 0) {
        historyIdx--;
        input.value = history[historyIdx];
      }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (historyIdx < history.length - 1) {
        historyIdx++;
        input.value = history[historyIdx];
      } else {
        historyIdx = history.length;
        input.value = '';
      }
      e.preventDefault();
    }
  });

  shortcuts.forEach(sc => {
    sc.addEventListener('click', () => {
      const c = sc.getAttribute('data-cmd');
      if (c) runCommand(c);
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      output.innerHTML = '';
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
          duration: 1100,
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
    // Graceful fallback to static number in HTML
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
