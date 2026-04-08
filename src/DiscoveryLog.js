// DiscoveryLog.js — Sci-fi discovery tracking UI
// Pure DOM manipulation, no imports required.

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  anomaly:   '🔮',
  resource:  '💎',
  artifact:  '🏛️',
  lifeform:  '🐾',
  structure: '🏗️',
  signal:    '📡',
};

const PLANET_COLORS = [
  '#4A90D9', '#E8734A', '#2ECC71', '#3498DB', '#9B59B6', '#1ABC9C',
  '#FF6B9D', '#F59E0B', '#06B6D4', '#8B5CF6',
];

// ── Style injection ───────────────────────────────────────────────────────────

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* ── Discovery Log Panel ───────────────────────────────────────────────── */
    #discovery-log-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: 340px;
      height: 100vh;
      background: rgba(5, 10, 30, 0.92);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-left: 1px solid rgba(100, 150, 255, 0.2);
      z-index: 40;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
      font-family: 'Nunito', system-ui, sans-serif;
      overflow: hidden;
    }
    #discovery-log-panel.dl-open {
      transform: translateX(0);
    }

    /* Header */
    #dl-header {
      padding: 20px 20px 16px;
      border-bottom: 1px solid rgba(100, 150, 255, 0.15);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    #dl-title {
      font-size: 17px;
      font-weight: 800;
      color: #FFD700;
      letter-spacing: 0.04em;
      text-shadow: 0 0 12px rgba(255, 215, 0, 0.4);
    }
    #dl-count-badge {
      background: linear-gradient(135deg, #FFD700, #F59E0B);
      color: #1a1000;
      font-size: 12px;
      font-weight: 900;
      padding: 3px 10px;
      border-radius: 12px;
      min-width: 28px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(255, 215, 0, 0.35);
    }
    #dl-close-btn {
      background: none;
      border: 1px solid rgba(100, 150, 255, 0.25);
      color: #8899CC;
      font-size: 18px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, color 0.2s;
      line-height: 1;
      padding: 0;
    }
    #dl-close-btn:hover {
      background: rgba(100, 150, 255, 0.15);
      color: #C0D0FF;
    }

    /* Scrollable body */
    #dl-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 0;
      scrollbar-width: thin;
      scrollbar-color: rgba(100, 150, 255, 0.3) transparent;
    }
    #dl-body::-webkit-scrollbar { width: 4px; }
    #dl-body::-webkit-scrollbar-track { background: transparent; }
    #dl-body::-webkit-scrollbar-thumb { background: rgba(100, 150, 255, 0.3); border-radius: 2px; }

    /* Empty state */
    #dl-empty {
      padding: 48px 24px;
      text-align: center;
      color: rgba(100, 150, 255, 0.4);
      font-size: 14px;
      font-weight: 600;
    }
    #dl-empty-icon {
      font-size: 36px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    /* Planet group */
    .dl-planet-group {
      margin-bottom: 4px;
    }
    .dl-planet-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 20px 8px;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }
    .dl-planet-header:hover {
      background: rgba(100, 150, 255, 0.06);
    }
    .dl-planet-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dl-planet-name {
      font-size: 13px;
      font-weight: 800;
      color: #C0D0FF;
      letter-spacing: 0.03em;
      flex: 1;
      text-transform: uppercase;
    }
    .dl-planet-count {
      font-size: 11px;
      font-weight: 700;
      color: rgba(100, 150, 255, 0.5);
    }
    .dl-planet-arrow {
      font-size: 10px;
      color: rgba(100, 150, 255, 0.4);
      transition: transform 0.2s;
      flex-shrink: 0;
    }
    .dl-planet-group.dl-collapsed .dl-planet-arrow {
      transform: rotate(-90deg);
    }
    .dl-planet-entries {
      overflow: hidden;
      transition: max-height 0.3s ease;
      max-height: 2000px;
    }
    .dl-planet-group.dl-collapsed .dl-planet-entries {
      max-height: 0;
    }

    /* Discovery entry */
    .dl-entry {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 20px 10px 32px;
      border-left: 2px solid transparent;
      transition: background 0.15s, border-color 0.15s;
      animation: dl-slide-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    .dl-entry:hover {
      background: rgba(100, 150, 255, 0.07);
      border-left-color: rgba(100, 150, 255, 0.3);
    }
    @keyframes dl-slide-in {
      from { transform: translateX(40px); opacity: 0; }
      to   { transform: translateX(0);   opacity: 1; }
    }
    .dl-entry-icon {
      font-size: 20px;
      line-height: 1;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .dl-entry-body {
      flex: 1;
      min-width: 0;
    }
    .dl-entry-name {
      font-size: 14px;
      font-weight: 800;
      color: #E0E8FF;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dl-entry-desc {
      font-size: 12px;
      color: #8899CC;
      margin-top: 2px;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .dl-entry-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 6px;
      margin-top: 5px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    /* Locked / undiscovered entry */
    .dl-entry-locked .dl-entry-icon { filter: grayscale(1) opacity(0.4); }
    .dl-entry-locked .dl-entry-name {
      color: rgba(100, 150, 255, 0.35);
      font-style: italic;
    }
    .dl-entry-locked .dl-entry-desc { color: rgba(100, 150, 255, 0.25); }

    /* ── Discovery Toast ───────────────────────────────────────────────────── */
    #dl-toast-container {
      position: fixed;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      z-index: 200;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding-top: 0;
      pointer-events: none;
    }
    .dl-toast {
      background: rgba(5, 8, 28, 0.95);
      border: 1px solid rgba(255, 215, 0, 0.5);
      border-radius: 14px;
      padding: 14px 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow:
        0 4px 24px rgba(255, 215, 0, 0.2),
        0 0 0 1px rgba(255, 215, 0, 0.08),
        inset 0 1px 0 rgba(255, 215, 0, 0.12);
      transform: translateY(-120%);
      transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
      min-width: 280px;
      max-width: 400px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .dl-toast.dl-toast-visible {
      transform: translateY(24px);
    }
    .dl-toast-icon {
      font-size: 26px;
      flex-shrink: 0;
      filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.5));
    }
    .dl-toast-text {
      flex: 1;
    }
    .dl-toast-label {
      font-size: 10px;
      font-weight: 800;
      color: #FFD700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 2px;
      text-shadow: 0 0 8px rgba(255, 215, 0, 0.5);
    }
    .dl-toast-name {
      font-size: 15px;
      font-weight: 800;
      color: #E0E8FF;
    }
    .dl-toast-planet {
      font-size: 11px;
      color: #8899CC;
      margin-top: 1px;
      font-weight: 600;
    }
    .dl-toast-shimmer {
      position: absolute;
      inset: 0;
      border-radius: 14px;
      background: linear-gradient(
        105deg,
        transparent 40%,
        rgba(255, 215, 0, 0.06) 50%,
        transparent 60%
      );
      background-size: 200% 100%;
      animation: dl-shimmer 2s linear infinite;
      pointer-events: none;
    }
    @keyframes dl-shimmer {
      from { background-position: -200% 0; }
      to   { background-position: 200% 0; }
    }
  `;
  document.head.appendChild(style);
}

// ── Discovery Log factory ─────────────────────────────────────────────────────

export function createDiscoveryLog() {
  injectStyles();

  // ── State ──────────────────────────────────────────────────────────────────
  // discoveries[planetId] = { planetName, color, entries: [...] }
  const discoveries = {};
  let totalCount = 0;
  let colorIdx = 0;

  // ── Build panel DOM ────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'discovery-log-panel';

  const header = document.createElement('div');
  header.id = 'dl-header';

  const title = document.createElement('div');
  title.id = 'dl-title';
  title.textContent = '📡 Discovery Log';

  const rightGroup = document.createElement('div');
  rightGroup.style.cssText = 'display:flex;align-items:center;gap:8px;';

  const countBadge = document.createElement('div');
  countBadge.id = 'dl-count-badge';
  countBadge.textContent = '0';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'dl-close-btn';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', hide);

  rightGroup.appendChild(countBadge);
  rightGroup.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(rightGroup);

  const body = document.createElement('div');
  body.id = 'dl-body';

  const empty = document.createElement('div');
  empty.id = 'dl-empty';
  empty.innerHTML = '<div id="dl-empty-icon">🌌</div>Explore planets to log discoveries';
  body.appendChild(empty);

  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(panel);

  // ── Planet group builder ───────────────────────────────────────────────────
  function getOrCreatePlanetGroup(planetId, planetName) {
    if (discoveries[planetId]) return discoveries[planetId];

    const color = PLANET_COLORS[colorIdx % PLANET_COLORS.length];
    colorIdx++;

    // Build group DOM
    const group = document.createElement('div');
    group.className = 'dl-planet-group';
    group.dataset.planetId = planetId;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'dl-planet-header';

    const dot = document.createElement('div');
    dot.className = 'dl-planet-dot';
    dot.style.background = color;
    dot.style.boxShadow = `0 0 6px ${color}`;

    const nameEl = document.createElement('div');
    nameEl.className = 'dl-planet-name';
    nameEl.textContent = planetName;

    const countEl = document.createElement('div');
    countEl.className = 'dl-planet-count';
    countEl.textContent = '0';

    const arrow = document.createElement('div');
    arrow.className = 'dl-planet-arrow';
    arrow.textContent = '▾';

    groupHeader.appendChild(dot);
    groupHeader.appendChild(nameEl);
    groupHeader.appendChild(countEl);
    groupHeader.appendChild(arrow);

    // Toggle collapse on header click
    groupHeader.addEventListener('click', () => {
      group.classList.toggle('dl-collapsed');
    });

    const entriesEl = document.createElement('div');
    entriesEl.className = 'dl-planet-entries';

    group.appendChild(groupHeader);
    group.appendChild(entriesEl);

    // Remove empty state, add group
    empty.style.display = 'none';
    body.appendChild(group);

    discoveries[planetId] = {
      planetName,
      color,
      countEl,
      entriesEl,
      entries: [],
      entryCount: 0,
    };

    return discoveries[planetId];
  }

  // ── addDiscovery ───────────────────────────────────────────────────────────
  function addDiscovery(planetId, poi) {
    const planetName = poi.planetName || planetId;
    const group = getOrCreatePlanetGroup(planetId, planetName);

    group.entries.push(poi);
    group.entryCount++;
    totalCount++;

    // Update counters
    countBadge.textContent = totalCount;
    group.countEl.textContent = group.entryCount;

    // Build entry element
    const icon = TYPE_ICONS[poi.type] || '🔍';
    const entry = document.createElement('div');
    entry.className = 'dl-entry';
    // Stagger animation slightly per entry
    entry.style.animationDelay = `${group.entryCount * 0.05}s`;

    const iconEl = document.createElement('div');
    iconEl.className = 'dl-entry-icon';
    iconEl.textContent = icon;

    const entryBody = document.createElement('div');
    entryBody.className = 'dl-entry-body';

    const nameEl = document.createElement('div');
    nameEl.className = 'dl-entry-name';
    nameEl.textContent = poi.name || 'Unknown';

    const descEl = document.createElement('div');
    descEl.className = 'dl-entry-desc';
    descEl.textContent = poi.description || poi.desc || '';

    const tag = document.createElement('div');
    tag.className = 'dl-entry-tag';
    tag.textContent = planetName;
    tag.style.background = `${group.color}22`;
    tag.style.color = group.color;
    tag.style.border = `1px solid ${group.color}44`;

    entryBody.appendChild(nameEl);
    if (descEl.textContent) entryBody.appendChild(descEl);
    entryBody.appendChild(tag);

    entry.appendChild(iconEl);
    entry.appendChild(entryBody);

    group.entriesEl.appendChild(entry);

    // Scroll to new entry if panel is open
    if (panel.classList.contains('dl-open')) {
      requestAnimationFrame(() => {
        entry.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  // ── show / hide ────────────────────────────────────────────────────────────
  function show() {
    panel.classList.add('dl-open');
  }

  function hide() {
    panel.classList.remove('dl-open');
  }

  // ── getCount / getElement ──────────────────────────────────────────────────
  function getCount() {
    return totalCount;
  }

  function getElement() {
    return panel;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  return { addDiscovery, show, hide, getCount, getElement };
}

// ── Toast container (singleton) ───────────────────────────────────────────────

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    injectStyles();
    toastContainer = document.createElement('div');
    toastContainer.id = 'dl-toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

// ── showDiscoveryToast ────────────────────────────────────────────────────────

export function showDiscoveryToast(poi, planetName) {
  injectStyles();

  const icon = TYPE_ICONS[poi.type] || '🔍';
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = 'dl-toast';
  toast.style.position = 'relative';

  const shimmer = document.createElement('div');
  shimmer.className = 'dl-toast-shimmer';

  const iconEl = document.createElement('div');
  iconEl.className = 'dl-toast-icon';
  iconEl.textContent = icon;

  const textEl = document.createElement('div');
  textEl.className = 'dl-toast-text';

  const labelEl = document.createElement('div');
  labelEl.className = 'dl-toast-label';
  labelEl.textContent = '✦ New Discovery!';

  const nameEl = document.createElement('div');
  nameEl.className = 'dl-toast-name';
  nameEl.textContent = poi.name || 'Unknown';

  const planetEl = document.createElement('div');
  planetEl.className = 'dl-toast-planet';
  planetEl.textContent = planetName || '';

  textEl.appendChild(labelEl);
  textEl.appendChild(nameEl);
  if (planetName) textEl.appendChild(planetEl);

  toast.appendChild(shimmer);
  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  container.appendChild(toast);

  // Trigger sound hook if available
  if (typeof window.playDiscoverySound === 'function') {
    window.playDiscoverySound();
  }

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.add('dl-toast-visible');
    });
  });

  // Hold for 4 seconds then slide out and remove
  setTimeout(() => {
    toast.classList.remove('dl-toast-visible');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
  }, 4000);
}
