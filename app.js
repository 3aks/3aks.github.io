/**
 * 3aks.me — Main Client Script
 * Motion is CSS transitions; this file only toggles classes.
 * Author: Arjun Sharma (3aks)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupReveals();
  setupHeader();
  setupFilterTabs();
  setupTerminal();
  setupRepoSync();
  setupFooterYear();
});

/* ==========================================================================
   Reveal on enter — hero plays on load, sections play once when scrolled to
   ========================================================================== */
function setupReveals() {
  const items = document.querySelectorAll('.reveal');

  const show = (el) => {
    el.classList.add('in');
    // Drop the blur filter once settled so text stays crisp and cheap to scroll
    el.addEventListener('transitionend', () => el.classList.add('settled'), { once: true });
  };

  if (!('IntersectionObserver' in window)) {
    items.forEach(show);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        show(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  // Wait a frame so the hidden state paints before the hero animates in
  requestAnimationFrame(() => items.forEach((el) => observer.observe(el)));
}

/* ==========================================================================
   Header & Mobile Navigation
   ========================================================================== */
function setupHeader() {
  const header = document.getElementById('header');
  const toggle = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileNav');
  if (!header) return;

  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toggle && drawer) {
    const setOpen = (open) => {
      drawer.classList.toggle('open', open);
      header.classList.toggle('menu-open', open);
      toggle.classList.toggle('active', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };

    toggle.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
    drawer.querySelectorAll('a').forEach((l) => l.addEventListener('click', () => setOpen(false)));
    document.addEventListener('click', (e) => {
      if (drawer.classList.contains('open') && !header.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    // Close if the viewport grows past the mobile breakpoint
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => e.matches && setOpen(false));
  }

  // Active section highlight, shown by a glass lens that slides between links
  const nav = document.querySelector('.desktop-nav');
  const navLinks = nav ? [...nav.querySelectorAll('.nav-link')] : [];
  const sections = document.querySelectorAll('main section[id]');
  const lens = document.createElement('span');
  lens.className = 'nav-lens';
  lens.setAttribute('aria-hidden', 'true');
  nav?.prepend(lens);

  let moveTimer;
  const moveLens = (link) => {
    navLinks.forEach((l) => l.classList.toggle('lensed', l === link));
    if (!link) { lens.classList.remove('on'); return; }
    const wasOn = lens.classList.contains('on');
    lens.style.setProperty('--lens-x', `${link.offsetLeft}px`);
    lens.style.setProperty('--lens-w', `${link.offsetWidth}px`);
    if (!wasOn) {
      // Appear in place (scale up) rather than sliding in from the left edge
      lens.style.transition = 'none';
      lens.getBoundingClientRect();
      lens.style.transition = '';
    }
    lens.classList.add('on');
    if (wasOn) {
      lens.classList.add('moving');
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => lens.classList.remove('moving'), 180);
    }
  };
  const activeLink = () => navLinks.find((l) => l.classList.contains('active'));

  navLinks.forEach((link) => link.addEventListener('pointerenter', () => moveLens(link)));
  nav?.addEventListener('pointerleave', () => moveLens(activeLink()));
  window.addEventListener('resize', () => moveLens(activeLink()));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${id}`));
      if (!nav.matches(':hover')) moveLens(activeLink());
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => observer.observe(s));
  // Above the first section nothing is active: let the lens fade out
  window.addEventListener('scroll', () => {
    if (window.scrollY < 80 && !nav?.matches(':hover')) {
      navLinks.forEach((l) => l.classList.remove('active'));
      moveLens(null);
    }
  }, { passive: true });
}

/* ==========================================================================
   Project filter — segmented control with a sliding indicator
   ========================================================================== */
function setupFilterTabs() {
  const group = document.getElementById('filterTabs');
  if (!group) return;
  const tabs = group.querySelectorAll('.filter-tab');
  const indicator = group.querySelector('.filter-indicator');
  const items = document.querySelectorAll('.project-item');

  const moveIndicator = (tab) => {
    if (!indicator) return;
    indicator.style.width = `${tab.offsetWidth}px`;
    indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
  };

  const active = () => group.querySelector('.filter-tab.active');

  // Place without animating on first paint and on resize
  const placeInstantly = () => {
    if (!indicator) return;
    indicator.style.transition = 'none';
    moveIndicator(active());
    indicator.offsetWidth; // flush so the next change animates
    indicator.style.transition = '';
  };
  placeInstantly();
  window.addEventListener('resize', placeInstantly);
  document.fonts?.ready.then(placeInstantly);

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      tabs.forEach((t) => {
        const on = t === tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      moveIndicator(tab);

      items.forEach((item) => {
        const show = filter === 'all' || item.dataset.category === filter;
        item.hidden = !show;
        // Featured card only spans two columns in the full list
        item.classList.toggle('is-featured', show && filter === 'all' && item === items[0]);
      });
    });
  });
}

/* ==========================================================================
   Terminal CLI
   ========================================================================== */
function setupTerminal() {
  const form = document.getElementById('terminalForm');
  const input = document.getElementById('terminalInput');
  const body = document.getElementById('terminalBody');
  const clearBtn = document.getElementById('clearTerminalBtn');
  const quickPills = document.querySelectorAll('.term-pill');

  if (!form || !input || !body) return;

  const history = [];
  let historyIndex = -1;

  function formatErrorBox(code, status, desc, hint, type = 'notfound') {
    const badgeClass = `b-${code}`;
    return `
<div class="term-error-box ${type}">
  <div class="term-error-header">
    <span class="term-badge ${badgeClass}">HTTP ${code}</span>
    <span class="term-cmd">${escapeHtml(status)}</span>
  </div>
  <div class="term-error-desc">${desc}</div>
  <div class="term-error-hint">&gt; Hint: ${hint}</div>
</div>`;
  }

  const commands = {
    help: () => `
<span class="term-highlight">Available Commands:</span>
  <span class="term-cmd">whoami</span>       - Brief intro and identity
  <span class="term-cmd">projects</span>     - List key hardware & software builds
  <span class="term-cmd">skills</span>       - View engineering & microcontroller toolkit
  <span class="term-cmd">hardware</span>     - Specific details on embedded hardware builds
  <span class="term-cmd">contact</span>      - Show contact channels & links
  <span class="term-cmd">github</span>       - Open Arjun's GitHub profile
  <span class="term-cmd">linkedin</span>     - Open Arjun's LinkedIn profile
  <span class="term-cmd">housing</span>      - Open the Cardiff student housing finder
  <span class="term-cmd">error [code]</span> - Custom error inspector (e.g. error 401, error 404)
  <span class="term-cmd">clear</span>        - Wipe terminal screen
  <span class="term-cmd">echo [text]</span>   - Print text back
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
  4. <span class="term-cmd">Media-Keys-Fixer</span> (AutoHotkey) - Windows background utility for Spotify
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
  GitHub : <a href="https://github.com/3aks" target="_blank" rel="noopener noreferrer" class="term-highlight" style="text-decoration:underline;">https://github.com/3aks</a>
  LinkedIn: <a href="https://www.linkedin.com/in/1aks" target="_blank" rel="noopener noreferrer" class="term-highlight" style="text-decoration:underline;">https://www.linkedin.com/in/1aks</a>
  Website: <a href="https://3aks.me" class="term-highlight" style="text-decoration:underline;">https://3aks.me</a>
  Status : Available for embedded systems collaborations & open-source projects.
    `,
    github: () => {
      window.open('https://github.com/3aks', '_blank', 'noopener');
      return `Opening <span class="term-highlight">https://github.com/3aks</span> in a new tab...`;
    },
    housing: () => {
      setTimeout(() => { location.href = '/housing/'; }, 400);
      return `Opening the <span class="term-highlight">Cardiff housing finder</span>...`;
    },
    linkedin: () => {
      window.open('https://www.linkedin.com/in/1aks', '_blank', 'noopener');
      return `Opening <span class="term-highlight">https://www.linkedin.com/in/1aks</span> in a new tab...`;
    },
    error: (arg) => {
      const code = (arg || '').trim();
      if (code === '401') {
        return formatErrorBox('401', 'Unauthorized Access', 'Access token or cryptographic signature missing. GUEST_SESSION is restricted from accessing privileged hardware debug registers.', "Type <span class='term-highlight'>'whoami'</span> to inspect rights or explore projects with <span class='term-highlight'>'projects'</span>.", 'auth');
      } else if (code === '403') {
        return formatErrorBox('403', 'Forbidden Endpoint', 'Execution policy violation. Even with authentication, writing to firmware partition /dev/mcu0 is forbidden.', "Elevated permissions cannot be granted remotely.", 'forbidden');
      } else if (code === '404') {
        return formatErrorBox('404', 'Resource Not Found', 'The requested route, file, or memory map was not found on 3aks.me.', "Try <span class='term-highlight'>'projects'</span> or <span class='term-highlight'>'skills'</span> to explore available topics.", 'notfound');
      } else if (code === '500') {
        return formatErrorBox('500', 'Internal Server Fault', 'Watchdog timer overflow: ESP32 I2S DMA buffer underflow. Hardware exception triggered.', "Diagnostic crash dump logged to memory register 0x3FF00000.", 'server');
      }
      return `
<span class="term-highlight">Custom Error Diagnostics:</span>
  Usage: <span class="term-cmd">error &lt;code&gt;</span>
  Available codes:
    &bull; <span class="term-orange">error 401</span> - HTTP 401 Unauthorized Access
    &bull; <span class="term-error">error 403</span> - HTTP 403 Forbidden Endpoint
    &bull; <span class="term-highlight">error 404</span> - HTTP 404 Route Not Found
    &bull; <span class="term-warning">error 500</span> - HTTP 500 Internal Fault
        `;
    },
    '401': () => commands.error('401'),
    '403': () => commands.error('403'),
    '404': () => commands.error('404'),
    '500': () => commands.error('500'),
    sudo: () => commands.error('401'),
    admin: () => commands.error('403'),
    login: () => commands.error('401'),
    auth: () => commands.error('401'),
    token: () => commands.error('401'),
    root: () => commands.error('403'),
    chmod: () => commands.error('403'),
    rm: () => commands.error('403'),
    crash: () => commands.error('500'),
    panic: () => commands.error('500')
  };

  // Typed commands appear instantly: a shell you use repeatedly shouldn't animate
  function executeCommand(rawInput) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    history.push(trimmed);
    historyIndex = history.length;

    const cmdLine = document.createElement('div');
    cmdLine.className = 'terminal-line';
    cmdLine.innerHTML = `<span class="prompt-user">visitor</span><span class="prompt-at">@</span><span class="prompt-host">3aks.me</span>:<span class="prompt-path">~</span>$&nbsp;<span class="term-cmd">${escapeHtml(trimmed)}</span>`;
    body.appendChild(cmdLine);

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
    } else if (Object.hasOwn(commands, cmd)) {
      outputLine.innerHTML = commands[cmd](args);
    } else {
      outputLine.innerHTML = formatErrorBox('404', `Command Not Found: '${cmd}'`, `The command '${escapeHtml(cmd)}' is not recognized by the 3aks.me shell.`, "Type <span class='term-highlight'>'help'</span> for command list, or try <span class='term-highlight'>'error 401'</span>.", 'notfound');
    }

    body.appendChild(outputLine);
    body.scrollTop = body.scrollHeight;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    executeCommand(input.value);
    input.value = '';
  });

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

  quickPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const cmd = pill.dataset.cmd;
      if (cmd) executeCommand(cmd);
    });
  });

  if (clearBtn) clearBtn.addEventListener('click', () => { body.innerHTML = ''; });
}

/* ==========================================================================
   GitHub live repo count
   ========================================================================== */
async function setupRepoSync() {
  const countEl = document.getElementById('repoCountStat');
  if (!countEl) return;
  try {
    const res = await fetch('https://api.github.com/users/3aks');
    if (!res.ok) return;
    const user = await res.json();
    if (typeof user.public_repos === 'number') countEl.textContent = user.public_repos;
  } catch {
    // Fallback number stays in place
  }
}

/* Footer Year */
function setupFooterYear() {
  const yr = document.getElementById('currentYear');
  if (yr) yr.textContent = new Date().getFullYear();
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, (t) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[t] || t));
}
