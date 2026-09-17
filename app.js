/**
 * 3aks.me — Main Client Script
 * Author: Arjun Sharma (3aks)
 */

document.addEventListener('DOMContentLoaded', () => {
  setupHeader();
  setupFilterTabs();
  setupTerminal();
  setupCopyEmail();
  setupRepoSync();
  setupFooterYear();
});

/* Header & Mobile Drawer */
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

/* Category Filter Tabs */
function setupFilterTabs() {
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

      items.forEach(item => {
        const cat = item.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          item.style.display = 'block';
        } else {
          item.style.display = 'none';
        }
      });
    });
  });
}

/* Terminal CLI */
function setupTerminal() {
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
  contact   - Email and GitHub links
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
    contact: () => `Email : arjunsharma290808@gmail.com
GitHub: https://github.com/3aks
Site  : https://3aks.me`
  };

  function runCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    history.push(trimmed);
    historyIdx = history.length;

    // Echo input
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

/* Copy Email */
function setupCopyEmail() {
  const email = 'arjunsharma290808@gmail.com';
  const heroBtn = document.getElementById('copyEmailHeroBtn');
  const contactBtn = document.getElementById('copyEmailContactBtn');

  const copy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(email)
        .then(() => toast(`Copied ${email} to clipboard`))
        .catch(() => fallback(email));
    } else {
      fallback(email);
    }
  };

  if (heroBtn) heroBtn.addEventListener('click', copy);
  if (contactBtn) contactBtn.addEventListener('click', copy);
}

function fallback(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  try {
    document.execCommand('copy');
    toast(`Copied ${text}`);
  } catch {
    toast(`Email: ${text}`);
  }
  document.body.removeChild(el);
}

function toast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  container.appendChild(t);

  setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 200);
  }, 2500);
}

/* GitHub Live Stats */
async function setupRepoSync() {
  try {
    const res = await fetch('https://api.github.com/users/3aks/repos?sort=updated');
    if (!res.ok) return;
    const repos = await res.json();
    if (!Array.isArray(repos)) return;

    const countEl = document.getElementById('repoCountStat');
    if (countEl) countEl.textContent = repos.length;
  } catch {
    // Keep cached count in markup
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
