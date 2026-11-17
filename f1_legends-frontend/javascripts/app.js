/* ==========================================================================
   F1 LEGENDS — PIT WALL & COCKPIT CONTROLLER
   Synchronisé avec le backend Express/Mongoose (port 3000)
   ========================================================================== */

// Détection automatique : en local utilise http://localhost:3000, en production sur Vercel utilise des requêtes relatives ""
const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "";

let currentScreen = "overview";
let dashboardCache = null;

let driversState = {
  page: 1,
  limit: 15,
  search: "",
  status: "",
  sort: "wins_desc",
  total: 0,
  totalPages: 1,
  data: [],
};

let constructorsCache = [];
let constructorsFiltered = [];
let constructorsPage = 1;
const CTORS_PER_PAGE = 14;

let racesState = { season: 2026, data: [] };
let rpmInterval = null;
let rpmRunning = true;

/* ==========================================================================
   INITIALISATION
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
  animateRPM();
  checkBackendStatus();
  applyTeamTheme("default");
  setTimeout(() => {
    cockpitNav("overview");
  }, 1400);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      resetFocus();
      closeDriverModal();
    }
  });
});

/* ==========================================================================
   NAVIGATION & FOCUS ÉCRANS
   ========================================================================== */

const TEAM_THEMES = {
  default: {
    code: "F1",
    label: "F1 OFFICIAL",
    color: "#e10600",
    glow: "rgba(225, 6, 0, 0.45)",
    soft: "rgba(225, 6, 0, 0.16)",
    logo: "./images/logos/f1.png",
  },
  ferrari: {
    code: "FER",
    label: "SCUDERIA FERRARI",
    color: "#ff2800",
    glow: "rgba(255, 40, 0, 0.55)",
    soft: "rgba(255, 40, 0, 0.22)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(255, 40, 0, 0.48) 0%, rgba(255, 255, 255, 0.22) 55%, rgba(220, 20, 0, 0.45) 100%)",
    ambientGradient:
      "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(255, 40, 0, 0.24) 0%, transparent 72%)",
    logo: "./images/logos/ferrari.png",
  },
  mclaren: {
    code: "MCL",
    label: "MCLAREN PAPAYA",
    color: "#ff8000",
    glow: "rgba(255, 128, 0, 0.55)",
    soft: "rgba(255, 128, 0, 0.22)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(255, 128, 0, 0.48) 0%, rgba(12, 13, 18, 0.92) 65%, rgba(255, 128, 0, 0.35) 100%)",
    ambientGradient:
      "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(255, 128, 0, 0.25) 0%, transparent 72%)",
    logo: "./images/logos/mclaren.png",
  },
  mercedes: {
    code: "MER",
    label: "MERCEDES-AMG",
    color: "#00d2be",
    glow: "rgba(0, 210, 190, 0.52)",
    soft: "rgba(0, 210, 190, 0.20)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(203, 213, 225, 0.26) 0%, rgba(0, 210, 190, 0.42) 48%, rgba(10, 12, 18, 0.94) 100%)",
    ambientGradient:
      "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(0, 210, 190, 0.24) 0%, transparent 72%)",
    logo: "./images/logos/mercedes.png",
  },
  red_bull: {
    code: "RBR",
    label: "RED BULL RACING",
    color: "#1e3a8a",
    glow: "rgba(30, 58, 138, 0.60)",
    soft: "rgba(30, 58, 138, 0.24)",
    logo: "./images/logos/red_bull.png",
  },
  rb: {
    code: "RB",
    label: "RACING BULLS",
    color: "#3b82f6",
    glow: "rgba(59, 130, 246, 0.55)",
    soft: "rgba(59, 130, 246, 0.20)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(255, 255, 255, 0.32) 0%, rgba(37, 99, 235, 0.46) 55%, rgba(15, 23, 42, 0.94) 100%)",
    ambientGradient:
      "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(59, 130, 246, 0.25) 0%, transparent 72%)",
    logo: "./images/logos/rb.png",
  },
  aston_martin: {
    code: "AMR",
    label: "ASTON MARTIN",
    color: "#009b77",
    glow: "rgba(0, 155, 119, 0.48)",
    soft: "rgba(0, 155, 119, 0.17)",
    logo: "./images/logos/aston_martin.png",
  },
  williams: {
    code: "WIL",
    label: "WILLIAMS RACING",
    color: "#0066ff",
    glow: "rgba(0, 102, 255, 0.50)",
    soft: "rgba(0, 102, 255, 0.18)",
    logo: "./images/logos/williams.png",
  },
  alpine: {
    code: "ALP",
    label: "ALPINE F1 TEAM",
    color: "#0090ff",
    glow: "rgba(255, 105, 180, 0.52)",
    soft: "rgba(0, 144, 255, 0.18)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(0, 144, 255, 0.36) 15%, rgba(255, 105, 180, 0.40) 85%)",
    ambientGradient:
      "linear-gradient(135deg, rgba(0, 144, 255, 0.22) 20%, rgba(255, 105, 180, 0.24) 80%)",
    logo: "./images/logos/alpine.png",
  },
  haas: {
    code: "HAA",
    label: "HAAS F1 TEAM",
    color: "#e60012",
    glow: "rgba(255, 255, 255, 0.38)",
    soft: "rgba(230, 0, 18, 0.20)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(255, 255, 255, 0.34) 0%, rgba(230, 0, 18, 0.44) 50%, rgba(10, 11, 16, 0.95) 100%)",
    ambientGradient:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.20) 0%, rgba(230, 0, 18, 0.26) 50%, rgba(5, 6, 10, 0.80) 100%)",
    logo: "./images/logos/haas.png",
  },
  audi: {
    code: "AUD",
    label: "AUDI F1 TEAM",
    color: "#9ca3af",
    glow: "rgba(245, 5, 55, 0.48)",
    soft: "rgba(156, 163, 175, 0.20)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(245, 5, 55, 0.42) 0%, rgba(12, 13, 18, 0.92) 50%, rgba(142, 146, 153, 0.38) 100%)",
    ambientGradient:
      "linear-gradient(135deg, rgba(245, 5, 55, 0.24) 0%, rgba(8, 9, 13, 0.72) 50%, rgba(142, 146, 153, 0.22) 100%)",
    logo: "./images/logos/audi.png",
  },
  cadillac: {
    code: "CAD",
    label: "CADILLAC F1 TEAM",
    color: "#ffffff",
    glow: "rgba(255, 255, 255, 0.50)",
    soft: "rgba(255, 255, 255, 0.18)",
    // bgGradient:
    //   "linear-gradient(135deg, rgba(255, 255, 255, 0.38) 15%, rgba(10, 11, 16, 0.95) 85%)",
    ambientGradient:
      "linear-gradient(135deg, rgba(255, 255, 255, 0.24) 15%, rgba(5, 6, 10, 0.80) 85%)",
    logo: "./images/logos/cadillac.png",
  },
};

const TEAM_ALIASES = {
  sauber: "audi",
  kick_sauber: "audi",
  racing_bulls: "rb",
  alphatauri: "rb",
  toro_rosso: "rb",
};

function applyTeamTheme(constructorId, customLabel = null) {
  const normalizedId = TEAM_ALIASES[constructorId] || constructorId;
  const key = TEAM_THEMES[normalizedId] ? normalizedId : "default";
  const theme = TEAM_THEMES[key];
  currentLiveryIdx = LIVERY_KEYS.indexOf(key);

  const root = document.documentElement.style;
  root.setProperty("--accent", theme.color);
  root.setProperty("--accent-glow", theme.glow);
  root.setProperty("--accent-soft", theme.soft);
  root.setProperty("--accent-bg", theme.bgGradient || theme.soft);
  root.setProperty(
    "--ambient-bg",
    theme.ambientGradient ||
      `radial-gradient(ellipse 70% 55% at 50% 55%, ${theme.soft} 0%, transparent 72%)`,
  );

  const displayName = customLabel ? customLabel.toUpperCase() : theme.label;
  const logoContainer = document.getElementById("hud-livery-logo");
  if (logoContainer) {
    logoContainer.innerHTML = `<img src="${theme.logo}" alt="${displayName}" onerror="this.outerHTML='<span class=\\'hud-livery-code\\'>${theme.code}</span>'" />`;
  }
  setText("hud-livery-name", displayName);

  flashWheelStatus(displayName);
}

const LIVERY_KEYS = Object.keys(TEAM_THEMES);
let currentLiveryIdx = 0;
let wheelStatusOverride = null;
let wheelStatusTimer = null;

function flashWheelStatus(text, duration = 2200) {
  wheelStatusOverride = text;
  setText("sw-speed", text);
  clearTimeout(wheelStatusTimer);
  wheelStatusTimer = setTimeout(() => {
    wheelStatusOverride = null;
  }, duration);
}

function cycleTeamLivery() {
  currentLiveryIdx = (currentLiveryIdx + 1) % LIVERY_KEYS.length;
  const nextKey = LIVERY_KEYS[currentLiveryIdx];
  applyTeamTheme(nextKey);
}

function resetCockpit() {
  resetFocus();
  closeDriverModal();
  driversState.search = "";
  driversState.status = "";
  driversState.page = 1;
  constructorsFiltered = constructorsCache;
  constructorsPage = 1;
  applyTeamTheme("default", "SYS RESET");
  checkBackendStatus();
  if (currentScreen === "drivers") renderDriversScreen();
  else if (currentScreen === "constructors") renderConstructorsScreen();
}

function cockpitNav(screen) {
  currentScreen = screen;

  document.querySelectorAll(".hud-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.screen === screen);
  });

  flashScreen("screen-left");
  flashScreen("screen-right");

  setTimeout(() => {
    switch (screen) {
      case "overview":
        renderOverview();
        break;
      case "drivers":
        renderDriversScreen();
        break;
      case "constructors":
        renderConstructorsScreen();
        break;
      case "races":
        renderRacesScreen();
        break;
      case "nosql":
        renderNoSQLScreen();
        break;
    }
  }, 120);
}

function flashScreen(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const overlay = document.createElement("div");
  overlay.className = "screen-flash-overlay";
  el.appendChild(overlay);
  setTimeout(() => overlay.remove(), 350);
}

function toggleFocus(monitorId) {
  const el = document.getElementById(monitorId);
  const backdrop = document.getElementById("focus-backdrop");
  if (!el) return;

  const isAlreadyFocused = el.classList.contains("focused");
  resetFocus();

  if (!isAlreadyFocused) {
    el.classList.add("focused");
    backdrop?.classList.remove("hidden");
  }
}

function resetFocus() {
  document
    .querySelectorAll(".monitor.focused")
    .forEach((m) => m.classList.remove("focused"));
  document.getElementById("focus-backdrop")?.classList.add("hidden");
}

/* ==========================================================================
   PAGINATION VIA PAGAIES DU VOLANT
   ========================================================================== */
function prevPage() {
  if (currentScreen === "drivers" && driversState.page > 1) {
    driversState.page--;
    fetchDrivers();
  } else if (currentScreen === "constructors" && constructorsPage > 1) {
    constructorsPage--;
    renderConstructorsCards();
  }
}

function nextPage() {
  if (
    currentScreen === "drivers" &&
    driversState.page < driversState.totalPages
  ) {
    driversState.page++;
    fetchDrivers();
  } else if (currentScreen === "constructors") {
    const maxPage = Math.ceil(constructorsFiltered.length / CTORS_PER_PAGE);
    if (constructorsPage < maxPage) {
      constructorsPage++;
      renderConstructorsCards();
    }
  }
}

/* ==========================================================================
   01. VUE D'ENSEMBLE (TÉLÉMÉTRIE & KPIS)
   ========================================================================== */
async function renderOverview() {
  setScreenLeft(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">KPIs GLOBAUX &amp; TOP PILOTES</span>
        <span class="sc-badge">1950 → 2026</span>
      </div>
      <div class="sc-body">
        <div class="kpi-row">
          <div class="kpi-cell">
            <span class="kpi-label">PILOTES</span>
            <span class="kpi-val red" id="kpi-drivers">—</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-label">ÉCURIES</span>
            <span class="kpi-val cyan" id="kpi-ctors">—</span>
          </div>
          <div class="kpi-cell">
            <span class="kpi-label">GRANDS PRIX</span>
            <span class="kpi-val yellow" id="kpi-races">—</span>
          </div>
        </div>
        <div class="sc-list" id="overview-top-drivers">
          <div class="sc-list-item"><span class="item-meta">Chargement du classement historique...</span></div>
        </div>
      </div>
    </div>
  `);

  setScreenRight(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">PALMARÈS CONSTRUCTEURS (TOP 10)</span>
        <span class="sc-badge">VICTOIRES GP</span>
      </div>
      <div class="sc-body">
        <div style="flex:1;position:relative;min-height:0;">
          <canvas id="chart-right-overview"></canvas>
        </div>
      </div>
    </div>
  `);

  try {
    const res = await fetch(`${API_BASE}/races/dashboard-stats`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    dashboardCache = data;

    const kpis = data.kpis || {};
    setText("kpi-drivers", kpis.totalDrivers?.toLocaleString("fr-FR") || "881");
    setText(
      "kpi-ctors",
      kpis.totalConstructors?.toLocaleString("fr-FR") || "214",
    );
    setText("kpi-races", kpis.totalRaces?.toLocaleString("fr-FR") || "1 172");

    setText("tab-count-drivers", kpis.totalDrivers || "881");
    setText("tab-count-ctors", kpis.totalConstructors || "214");
    setText("tab-count-races", kpis.totalRaces || "1172");

    const topDriversList = document.getElementById("overview-top-drivers");
    if (topDriversList && data.topDrivers) {
      topDriversList.innerHTML = data.topDrivers
        .map(
          (d, idx) => `
          <div class="sc-list-item" onclick="openDriverModal('${d._id}')">
            <div>
              <span class="item-name">#${idx + 1} ${getFlagEmoji(d.nationality)} ${d.name}</span>
              <span class="item-meta" style="display:block;">driver_id: ${d._id}</span>
            </div>
            <span class="item-stat">${d.wins} VICTOIRES</span>
          </div>
        `,
        )
        .join("");
    }

    if (data.topConstructors) {
      buildConstrChart("chart-right-overview", data.topConstructors);
    }
  } catch {
    setText("kpi-drivers", "881");
    setText("kpi-ctors", "214");
    setText("kpi-races", "1 172");
    const topDriversList = document.getElementById("overview-top-drivers");
    if (topDriversList) {
      topDriversList.innerHTML = `<div class="sc-list-item"><span class="item-meta" style="color:#e10600;">Backend déconnecté</span></div>`;
    }
  }
}

function buildConstrChart(canvasId, data) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.map((d) => d.name || d._id),
      datasets: [
        {
          label: "Victoires",
          data: data.map((d) => d.wins ?? d.total_wins ?? 0),
          backgroundColor: "#e10600",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "rgba(255,255,255,0.6)", font: { size: 10 } },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
        y: {
          ticks: { color: "#f4f6fb", font: { size: 10, weight: "bold" } },
          grid: { display: false },
        },
      },
    },
  });
}

/* ==========================================================================
   02. PILOTES (RECHERCHE, TRI, FICHE DÉTAILLÉE)
   ========================================================================== */
function renderDriversScreen() {
  setScreenLeft(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title" id="drv-header-title">PILOTES — ${driversState.total || 881}</span>
        <span class="sc-badge" id="drv-page-badge">PAGE ${driversState.page}/${driversState.totalPages}</span>
      </div>
      <div class="sc-body">
        <div class="sc-controls-row">
          <input class="sc-search" id="drv-search" placeholder="🔍 Nom, prénom, driver_id..."
                 value="${driversState.search}" oninput="onDriverSearch(this.value)" />
          <select class="sc-select" onchange="onDriverStatus(this.value)">
            <option value="">Tous statuts</option>
            <option value="En activité" ${driversState.status === "En activité" ? "selected" : ""}>En activité</option>
            <option value="Retraité" ${driversState.status === "Retraité" ? "selected" : ""}>Retraités</option>
          </select>
          <select class="sc-select" onchange="onDriverSort(this.value)">
            <option value="wins_desc" ${driversState.sort === "wins_desc" ? "selected" : ""}>↓ Victoires</option>
            <option value="titles_desc" ${driversState.sort === "titles_desc" ? "selected" : ""}>↓ Titres</option>
            <option value="races_desc" ${driversState.sort === "races_desc" ? "selected" : ""}>↓ Courses</option>
            <option value="name_asc" ${driversState.sort === "name_asc" ? "selected" : ""}>A→Z Nom</option>
          </select>
        </div>

        <div class="sc-list" id="drivers-list">
          <div class="sc-list-item"><span class="item-meta">Chargement des pilotes...</span></div>
        </div>

        <div class="sc-pagination">
          <button class="sc-btn" id="btn-prev-drv" onclick="prevPage()">◀ PRÉC.</button>
          <span id="drv-count-footer">${driversState.total} pilotes</span>
          <button class="sc-btn" id="btn-next-drv" onclick="nextPage()">SUIV. ▶</button>
        </div>
      </div>
    </div>
  `);

  setScreenRight(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">TÉLÉMÉTRIE PILOTE</span>
        <span class="sc-badge">SÉLECTION</span>
      </div>
      <div class="sc-body" id="driver-detail-screen">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;opacity:0.45;">
          <div style="font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;">F1</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:0.72rem;">CLIQUEZ SUR UN PILOTE À GAUCHE</div>
        </div>
      </div>
    </div>
  `);

  fetchDrivers();
}

async function fetchDrivers() {
  const list = document.getElementById("drivers-list");
  if (list)
    list.innerHTML = `<div class="sc-list-item"><span class="item-meta">Interrogation MongoDB Atlas...</span></div>`;

  const params = new URLSearchParams({
    page: driversState.page,
    limit: driversState.limit,
    sort: driversState.sort,
  });
  if (driversState.search) params.append("search", driversState.search);
  if (driversState.status) params.append("status", driversState.status);

  try {
    const res = await fetch(`${API_BASE}/drivers?${params}`);
    const json = await res.json();
    if (json.result && json.drivers) {
      driversState.total = json.total;
      driversState.totalPages = json.totalPages || 1;
      driversState.data = json.drivers;

      renderDriversList(json.drivers);
      setText("drv-header-title", `PILOTES — ${json.total}`);
      setText(
        "drv-page-badge",
        `PAGE ${driversState.page}/${driversState.totalPages}`,
      );
      setText("drv-count-footer", `${json.total} pilotes trouvés`);

      const prevBtn = document.getElementById("btn-prev-drv");
      const nextBtn = document.getElementById("btn-next-drv");
      if (prevBtn) prevBtn.disabled = driversState.page <= 1;
      if (nextBtn)
        nextBtn.disabled = driversState.page >= driversState.totalPages;
    }
  } catch {
    if (list)
      list.innerHTML = `<div class="sc-list-item"><span class="item-meta" style="color:#e10600;">Backend hors-ligne</span></div>`;
  }
}

function renderDriversList(drivers) {
  const list = document.getElementById("drivers-list");
  if (!list) return;
  if (!drivers.length) {
    list.innerHTML = `<div class="sc-list-item"><span class="item-meta">Aucun pilote trouvé</span></div>`;
    return;
  }

  list.innerHTML = drivers
    .map((d) => {
      const wins = d.career_stats?.total_wins || 0;
      const titles = d.world_titles || 0;
      const badge =
        d.active_status === "En activité"
          ? `<span class="item-badge badge-active">ACTIF</span>`
          : `<span class="item-badge badge-retired">RET</span>`;
      const champBadge =
        titles > 0
          ? `<span class="item-badge badge-champ">${titles} 🏆</span>`
          : "";

      return `
        <div class="sc-list-item" onclick="showDriverDetail('${d.driver_id}', this)">
          <div>
            <span class="item-name">${getFlagEmoji(d.nationality)} ${d.first_name} ${d.last_name}</span>
            <span class="item-meta" style="display:block;">#${d._id} · ${d.driver_id}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${champBadge}
            ${badge}
            <span class="item-stat">${wins}W</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function onDriverSearch(val) {
  driversState.search = val;
  driversState.page = 1;
  clearTimeout(onDriverSearch._t);
  onDriverSearch._t = setTimeout(fetchDrivers, 300);
}

function onDriverSort(val) {
  driversState.sort = val;
  driversState.page = 1;
  fetchDrivers();
}

function onDriverStatus(val) {
  driversState.status = val;
  driversState.page = 1;
  fetchDrivers();
}

async function showDriverDetail(driverId, rowEl) {
  const panel = document.getElementById("driver-detail-screen");
  if (!panel) return;

  if (rowEl) {
    document
      .querySelectorAll("#drivers-list .sc-list-item")
      .forEach((el) => el.classList.remove("selected"));
    rowEl.classList.add("selected");
  }

  panel.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-family:'Share Tech Mono',monospace;font-size:0.75rem;color:var(--f1-cyan);">CHARGEMENT TÉLÉMÉTRIE...</div>`;

  try {
    const res = await fetch(`${API_BASE}/drivers/detail/${driverId}`);
    const json = await res.json();
    if (!json.result || !json.driver) throw new Error();
    const d = json.driver;
    const stats = d.career_stats || {};
    const teams = d.teams || [];
    const latestTeamId = teams.length
      ? teams[teams.length - 1].constructor_id
      : "default";
    applyTeamTheme(latestTeamId);

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;">
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:1.05rem;font-weight:900;">
            ${getFlagEmoji(d.nationality)} ${d.first_name} ${d.last_name}
          </div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:0.66rem;color:var(--f1-cyan);margin-top:2px;">
            _id: ${d._id} · driver_id: ${d.driver_id} ${d.car_number ? `· N°${d.car_number}` : ""}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:'Orbitron',sans-serif;font-size:1.5rem;font-weight:900;color:var(--f1-yellow);line-height:1;">${d.world_titles || 0}</div>
          <div style="font-size:0.58rem;color:rgba(255,255,255,0.5);">TITRES</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        ${[
          ["VICTOIRES", stats.total_wins || 0, "#e10600"],
          ["PODIUMS", stats.total_podiums || 0, "#ffd600"],
          ["POLES", stats.total_poles || 0, "#00d2ff"],
          ["COURSES", stats.total_races || 0, "#00e676"],
        ]
          .map(
            ([lbl, val, clr]) => `
          <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:5px;padding:6px 4px;text-align:center;">
            <span style="font-size:0.55rem;color:rgba(255,255,255,0.5);display:block;">${lbl}</span>
            <span style="font-family:'Orbitron',sans-serif;font-size:1rem;font-weight:700;color:${clr};">${val}</span>
          </div>
        `,
          )
          .join("")}
      </div>

      <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:var(--f1-cyan);">PARCOURS ÉCURIES (${teams.length})</div>
      <div class="sc-list">
        ${
          teams.length
            ? teams
                .map(
                  (t) => `
            <div class="sc-list-item" style="cursor:default;">
              <div>
                <span class="item-name">${t.team_name}</span>
                <span class="item-meta" style="margin-left:6px;">${t.start_year}–${t.end_year || "Présent"}</span>
              </div>
              <span class="item-stat">${t.races_won || 0}W ${t.drivers_titles_won ? `· ${t.drivers_titles_won} 🏆` : ""}</span>
            </div>
          `,
                )
                .join("")
            : `<div class="sc-list-item"><span class="item-meta">Aucun historique d'écurie</span></div>`
        }
      </div>

      <button class="sc-btn" style="width:100%;padding:7px;font-weight:bold;" onclick="openDriverModal('${d.driver_id}')">
        OUVRIR LA FICHE COMPLÈTE (DOCUMENT JSON) ↗
      </button>
    `;
  } catch {
    panel.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#e10600;font-family:'Share Tech Mono',monospace;">ERREUR DE CHARGEMENT</div>`;
  }
}

async function openDriverModal(driverId) {
  const modal = document.getElementById("driver-modal");
  const body = document.getElementById("driver-modal-body");
  modal.classList.remove("hidden");
  body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--f1-cyan);font-family:'Share Tech Mono',monospace;">CHARGEMENT...</div>`;

  try {
    const res = await fetch(`${API_BASE}/drivers/detail/${driverId}`);
    const json = await res.json();
    if (!json.result || !json.driver) throw new Error();
    const d = json.driver;
    const stats = d.career_stats || {};
    const teams = d.teams || [];
    const latestTeamId = teams.length
      ? teams[teams.length - 1].constructor_id
      : "default";
    applyTeamTheme(latestTeamId);

    body.innerHTML = `
      <div class="modal-driver-header">
        <div>
          <div class="modal-driver-name">${getFlagEmoji(d.nationality)} ${d.first_name} ${d.last_name}</div>
          <div class="modal-driver-id">
            _id: <strong>${d._id}</strong> · driver_id: <strong>${d.driver_id}</strong>
            ${d.car_number ? ` · <span style="color:#e10600;font-weight:700;">#${d.car_number}</span>` : ""}
          </div>
        </div>
        <div class="modal-titles">
          <div class="modal-titles-num">${d.world_titles || 0}</div>
          <div class="modal-titles-label">TITRES MONDIAUX</div>
        </div>
      </div>
      <div class="modal-stats-grid">
        <div class="modal-stat-card"><span class="modal-stat-label">Victoires</span><span class="modal-stat-val" style="color:#e10600;">${stats.total_wins || 0}</span></div>
        <div class="modal-stat-card"><span class="modal-stat-label">Podiums</span><span class="modal-stat-val" style="color:#ffd600;">${stats.total_podiums || 0}</span></div>
        <div class="modal-stat-card"><span class="modal-stat-label">Poles</span><span class="modal-stat-val" style="color:#00d2ff;">${stats.total_poles || 0}</span></div>
        <div class="modal-stat-card"><span class="modal-stat-label">Courses</span><span class="modal-stat-val" style="color:#00e676;">${stats.total_races || 0}</span></div>
      </div>
      <div class="modal-info-row"><span class="modal-info-label">Nationalité</span><span class="modal-info-val">${d.nationality || "—"}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Statut</span><span class="modal-info-val">${d.active_status || "—"}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Date de naissance</span><span class="modal-info-val">${d.date_of_birth || "—"}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Clé Étape 4 (name_length_id)</span><span class="modal-info-val cyan">${d.name_length_id || d.last_name?.length || "—"} lettres</span></div>
      ${
        d.biographical_notes || d.status_info
          ? `<div class="modal-info-row"><span class="modal-info-label">Notes</span><span class="modal-info-val">${d.biographical_notes || d.status_info}</span></div>`
          : ""
      }
      ${
        teams.length
          ? `
        <div class="modal-teams-title">HISTORIQUE D'ÉCURIES (EMBEDDED DOCUMENTS)</div>
        ${teams
          .map(
            (t) => `
          <div class="modal-team-row">
            <div>
              <strong>${t.team_name}</strong>
              <span style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-left:8px;">(${t.constructor_id})</span>
            </div>
            <div>
              <span style="color:rgba(255,255,255,0.5);margin-right:10px;">${t.start_year}–${t.end_year || "Présent"}</span>
              <strong style="color:#00e676;">${t.races_won || 0} W</strong>
            </div>
          </div>
        `,
          )
          .join("")}
      `
          : ""
      }
    `;
  } catch {
    body.innerHTML = `<div style="text-align:center;padding:40px;color:#e10600;">Impossible de charger la fiche pilote.</div>`;
  }
}

function closeDriverModal() {
  document.getElementById("driver-modal").classList.add("hidden");
}

function runQuickAntonelli() {
  openDriverModal("antonelli");
}

/* ==========================================================================
   03. CONSTRUCTEURS (214 ÉCURIES)
   ========================================================================== */
function renderConstructorsScreen() {
  setScreenLeft(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">ÉCURIES — ${constructorsCache.length || 214}</span>
        <span class="sc-badge" id="ctor-page-badge">PAGE 1</span>
      </div>
      <div class="sc-body">
        <div class="sc-controls-row">
          <input class="sc-search" id="ctor-search" placeholder="🔍 Ferrari, McLaren, Williams..."
                 oninput="onCtorSearch(this.value)" />
          <button class="sc-btn" onclick="filterCtorChampions()">🏆 Titrées</button>
          <button class="sc-btn" onclick="resetCtorFilter()">↺ Toutes</button>
        </div>
        <div class="sc-list" id="constructors-list">
          <div class="sc-list-item"><span class="item-meta">Chargement des écuries...</span></div>
        </div>
        <div class="sc-pagination">
          <button class="sc-btn" onclick="prevPage()">◀ PRÉC.</button>
          <span id="ctor-count-label">${constructorsFiltered.length} écuries</span>
          <button class="sc-btn" onclick="nextPage()">SUIV. ▶</button>
        </div>
      </div>
    </div>
  `);

  setScreenRight(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">TOP CONSTRUCTEURS</span>
        <span class="sc-badge">VICTOIRES HISTORIQUES</span>
      </div>
      <div class="sc-body">
        <div style="flex:1;position:relative;min-height:0;">
          <canvas id="chart-ctor-wins"></canvas>
        </div>
      </div>
    </div>
  `);

  if (constructorsCache.length === 0) {
    fetchConstructors();
  } else {
    renderConstructorsCards();
    buildConstrChart("chart-ctor-wins", constructorsCache.slice(0, 10));
  }
}

async function fetchConstructors() {
  try {
    const res = await fetch(`${API_BASE}/constructors?sort=wins_desc`);
    const json = await res.json();
    if (json.result && json.constructors) {
      constructorsCache = json.constructors;
      constructorsFiltered = json.constructors;
      constructorsPage = 1;
      renderConstructorsCards();
      buildConstrChart("chart-ctor-wins", json.constructors.slice(0, 10));
    }
  } catch {
    const list = document.getElementById("constructors-list");
    if (list)
      list.innerHTML = `<div class="sc-list-item"><span class="item-meta" style="color:#e10600;">Backend hors-ligne</span></div>`;
  }
}

function renderConstructorsCards() {
  const list = document.getElementById("constructors-list");
  if (!list) return;
  const start = (constructorsPage - 1) * CTORS_PER_PAGE;
  const page = constructorsFiltered.slice(start, start + CTORS_PER_PAGE);

  if (!page.length) {
    list.innerHTML = `<div class="sc-list-item"><span class="item-meta">Aucune écurie trouvée</span></div>`;
    return;
  }

  list.innerHTML = page
    .map((c) => {
      const wins = c.total_wins || 0;
      const titles = c.championships?.championships_wins || 0;
      return `
        <div class="sc-list-item" onclick="applyTeamTheme('${c.constructor_id}', '${c.name.replace(/'/g, "\\'")}')">
          <div>
            <span class="item-name">${c.name}</span>
            <span class="item-meta" style="display:block;">#${c._id} · ${c.constructor_id} · ${c.nationality || ""}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            ${titles > 0 ? `<span class="item-badge badge-champ">${titles} 🏆</span>` : ""}
            <span class="item-stat">${wins}W</span>
          </div>
        </div>
      `;
    })
    .join("");

  const maxPage = Math.max(
    1,
    Math.ceil(constructorsFiltered.length / CTORS_PER_PAGE),
  );
  setText("ctor-page-badge", `PAGE ${constructorsPage}/${maxPage}`);
  setText("ctor-count-label", `${constructorsFiltered.length} écuries`);
}

function onCtorSearch(val) {
  const q = val.toLowerCase().trim();
  constructorsFiltered = constructorsCache.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.nationality || "").toLowerCase().includes(q) ||
      (c.constructor_id || "").toLowerCase().includes(q),
  );
  constructorsPage = 1;
  renderConstructorsCards();
}

function filterCtorChampions() {
  constructorsFiltered = constructorsCache.filter(
    (c) =>
      (c.championships?.championships_wins || 0) > 0 ||
      (c.driver_championships || 0) > 0,
  );
  constructorsPage = 1;
  renderConstructorsCards();
}

function resetCtorFilter() {
  constructorsFiltered = constructorsCache;
  constructorsPage = 1;
  const searchInput = document.getElementById("ctor-search");
  if (searchInput) searchInput.value = "";
  renderConstructorsCards();
}

/* ==========================================================================
   04. GRANDS PRIX (PAR SAISON 1950 - 2026)
   ========================================================================== */
function renderRacesScreen() {
  let optionsHtml = "";
  for (let y = 2026; y >= 1950; y--) {
    optionsHtml += `<option value="${y}" ${y === racesState.season ? "selected" : ""}>Saison ${y}</option>`;
  }

  setScreenLeft(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title" id="races-header-title">GRANDS PRIX — SAISON ${racesState.season}</span>
        <span class="sc-badge">1950–2026</span>
      </div>
      <div class="sc-body">
        <select class="sc-select" id="season-select" onchange="loadSeason(this.value)">
          ${optionsHtml}
        </select>
        <div class="sc-list" id="races-list">
          <div class="sc-list-item"><span class="item-meta">Chargement de la saison...</span></div>
        </div>
      </div>
    </div>
  `);

  setScreenRight(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">PODIUM &amp; CIRCUIT</span>
        <span class="sc-badge">EXTENDED REFERENCE</span>
      </div>
      <div class="sc-body" id="race-detail-screen">
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;opacity:0.45;">
          <div style="font-size:2rem;">🏁</div>
          <div style="font-family:'Share Tech Mono',monospace;font-size:0.72rem;">SÉLECTIONNEZ UN GRAND PRIX À GAUCHE</div>
        </div>
      </div>
    </div>
  `);

  loadSeason(racesState.season);
}

async function loadSeason(season) {
  racesState.season = parseInt(season, 10);
  const list = document.getElementById("races-list");
  if (list)
    list.innerHTML = `<div class="sc-list-item"><span class="item-meta">Chargement saison ${season}...</span></div>`;

  try {
    const res = await fetch(`${API_BASE}/races?season=${season}&limit=100`);
    const json = await res.json();
    if (json.result && json.races) {
      // Trier par round croissant
      const sorted = [...json.races].sort(
        (a, b) => a.round_number - b.round_number,
      );
      racesState.data = sorted;
      renderRacesList(sorted, season);
      if (sorted.length > 0) showRaceDetail(0);
    }
  } catch {
    if (list)
      list.innerHTML = `<div class="sc-list-item"><span class="item-meta" style="color:#e10600;">Backend hors-ligne</span></div>`;
  }
}

function renderRacesList(races, season) {
  const list = document.getElementById("races-list");
  if (!list) return;
  setText("races-header-title", `GRANDS PRIX ${season} (${races.length})`);

  if (!races.length) {
    list.innerHTML = `<div class="sc-list-item"><span class="item-meta">Aucun Grand Prix enregistré pour ${season}</span></div>`;
    return;
  }

  list.innerHTML = races
    .map((r, idx) => {
      const rawWinner = r.race_results?.winner_driver_id;
      const podiumFirst = r.race_results?.podium?.[0]?.driver_id;

      // Récupère l'objet pilote peuplé (depuis winner_driver_id ou depuis la P1 du podium)
      const winnerObj =
        rawWinner && typeof rawWinner === "object"
          ? rawWinner
          : podiumFirst && typeof podiumFirst === "object"
            ? podiumFirst
            : null;

      let winnerDisplay = "À venir";
      if (winnerObj) {
        const initial = winnerObj.first_name
          ? `${winnerObj.first_name.charAt(0).toUpperCase()}. `
          : "";
        winnerDisplay =
          `${initial}${winnerObj.last_name || winnerObj.driver_id || ""}`.trim();
      } else if (typeof rawWinner === "string" && rawWinner.trim() !== "") {
        winnerDisplay = rawWinner;
      }

      const circuit = r.circuit || {};
      return `
        <div class="sc-list-item ${idx === 0 ? "selected" : ""}" onclick="showRaceDetail(${idx}, this)">
          <div>
            <span class="item-name">R${r.round_number} · ${r.gp_name}</span>
            <span class="item-meta" style="display:block;">${circuit.country || ""} · ${circuit.name || ""}</span>
          </div>
          <span class="item-stat">🥇 ${winnerDisplay}</span>
        </div>
      `;
    })
    .join("");
}

function showRaceDetail(idx, rowEl) {
  const r = racesState.data[idx];
  const panel = document.getElementById("race-detail-screen");
  if (!r || !panel) return;

  if (rowEl) {
    document
      .querySelectorAll("#races-list .sc-list-item")
      .forEach((el) => el.classList.remove("selected"));
    rowEl.classList.add("selected");
  }

  const results = r.race_results || {};
  const podium = results.podium || [];
  const circuit = r.circuit || {};
  const medals = ["🥇", "🥈", "🥉"];

  const polemanObj =
    typeof results.qualifications?.poleman_driver_id === "object" &&
    results.qualifications?.poleman_driver_id !== null
      ? results.qualifications.poleman_driver_id
      : null;
  const polemanName = polemanObj
    ? `${polemanObj.first_name || ""} ${polemanObj.last_name || ""}`.trim()
    : results.qualifications?.poleman_driver_id || "—";

  const flObj =
    typeof results.fastest_lap?.driver_id === "object" &&
    results.fastest_lap?.driver_id !== null
      ? results.fastest_lap.driver_id
      : null;
  const flName = flObj
    ? `${flObj.first_name || ""} ${flObj.last_name || ""}`.trim()
    : results.fastest_lap?.driver_id || "—";

  panel.innerHTML = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:8px;">
      <div style="font-family:'Orbitron',sans-serif;font-size:0.95rem;font-weight:900;color:#fff;">
        ROUND ${r.round_number} — ${r.gp_name} (${r.season})
      </div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:var(--f1-cyan);margin-top:3px;">
        📍 ${circuit.name || "—"} (${circuit.city || ""}, ${circuit.country || ""}) · ${r.laps || "?"} tours
      </div>
    </div>

    <div style="font-family:'Share Tech Mono',monospace;font-size:0.66rem;color:rgba(255,255,255,0.5);">PODIUM OFFICIEL</div>
    <div class="sc-list">
      ${
        podium.length
          ? podium
              .map((p, i) => {
                const driverObj =
                  typeof p.driver_id === "object" && p.driver_id !== null
                    ? p.driver_id
                    : null;
                const ctorObj =
                  typeof p.constructor_id === "object" &&
                  p.constructor_id !== null
                    ? p.constructor_id
                    : null;

                const driverName = driverObj
                  ? `${driverObj.first_name || ""} ${driverObj.last_name || ""}`.trim()
                  : p.driver_id || "—";

                const ctorName = ctorObj
                  ? ctorObj.name || ctorObj.constructor_id || ""
                  : p.constructor_id || "";

                const rawDriverId = driverObj
                  ? driverObj.driver_id
                  : p.driver_id;

                return `
                  <div class="sc-list-item" onclick="openDriverModal('${rawDriverId}')">
                    <span class="item-name">${medals[i] || "·"} P${p.position} — ${driverName}</span>
                    <span class="item-stat">${ctorName}</span>
                  </div>
                `;
              })
              .join("")
          : `<div class="sc-list-item"><span class="item-meta">Résultats non disponibles</span></div>`
      }
    </div>

    <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:10px 12px;font-family:'Share Tech Mono',monospace;font-size:0.82rem;line-height:1.7;display:flex;flex-direction:column;gap:3px;">
      <div>🏎️ <strong>Pole Position :</strong> <span style="color:var(--f1-cyan);">${polemanName}</span> ${results.qualifications?.qualif_fastest_lap ? `(${results.qualifications.qualif_fastest_lap})` : ""}</div>
      <div>⚡ <strong>Meilleur Tour :</strong> <span style="color:var(--f1-yellow);">${flName}</span> ${results.fastest_lap?.lap_time ? `(${results.fastest_lap.lap_time})` : ""}</div>
      <div>⏱️ <strong>Temps Vainqueur :</strong> ${results.winning_time || "—"} · <strong>gp_id :</strong> ${r.gp_id}</div>
    </div>
  `;
}

/* ==========================================================================
   05. CONSOLE NOSQL (ÉTAPES 2 À 5 DU TP)
   ========================================================================== */
function renderNoSQLScreen() {
  const steps = [
    {
      path: "/steps/step2/q1-id?id=1",
      method: "GET",
      step: "ÉTAPE 2.1",
      name: "Recherche par _id numérique",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q2-driver-id?id=alonso",
      method: "GET",
      step: "ÉTAPE 2.2",
      name: "ID Métier (driver_id)",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q3-sort",
      method: "GET",
      step: "ÉTAPE 2.3",
      name: "Tri sur 2 champs (.sort)",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q4-projection",
      method: "GET",
      step: "ÉTAPE 2.4",
      name: "Projection (3 écuries)",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q5-gt?wins=50",
      method: "GET",
      step: "ÉTAPE 2.5",
      name: "Filtre $gt (>50 victoires)",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q6-and",
      method: "GET",
      step: "ÉTAPE 2.6",
      name: "Combinaison logique $and",
      color: "#e10600",
    },
    {
      path: "/steps/step2/q7-regex",
      method: "GET",
      step: "ÉTAPE 2.7",
      name: "Regex (Exact 3 docs)",
      color: "#00e676",
    },
    {
      path: "/steps/step4/lookup",
      method: "GET",
      step: "ÉTAPE 4",
      name: "Jointure $lookup (name_lengths)",
      color: "#ffd600",
    },
    {
      path: "/steps/step5/create-indexes",
      method: "POST",
      step: "ÉTAPE 5.1",
      name: "Création des Index MongoDB",
      color: "#00d2ff",
    },
    {
      path: "/steps/step5/explain",
      method: "GET",
      step: "ÉTAPE 5.2",
      name: "Explain Index (IXSCAN)",
      color: "#00d2ff",
    },
    {
      path: "/races/dashboard-stats",
      method: "GET",
      step: "AGRÉGATION",
      name: "Pipeline $facet Dashboard",
      color: "#a855f7",
    },
  ];

  setScreenLeft(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title">REQUÊTES TP NOSQL (ÉTAPES 2 → 5)</span>
        <span class="sc-badge">LIVE ATLAS</span>
      </div>
      <div class="sc-body">
        <div class="nosql-btns">
          ${steps
            .map(
              (s) => `
            <button class="nosql-btn" onclick="runNoSQLQuery('${s.path}', '${s.method}', '${s.step} — ${s.name}')">
              <span class="nb-step" style="color:${s.color};">${s.step} (${s.method})</span>
              <span class="nb-name">${s.name}</span>
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `);

  setScreenRight(`
    <div class="screen-content">
      <div class="sc-header">
        <span class="sc-title" id="nosql-title">TERMINAL MONGODB SHELL</span>
        <span class="sc-badge" id="nosql-count">PRÊT</span>
      </div>
      <div class="sc-body">
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.65rem;color:var(--f1-cyan);padding:6px 8px;background:rgba(0,0,0,0.55);border-radius:4px;border:1px solid rgba(0,210,255,0.18);">
          <span id="nosql-cmd">// Cliquez sur une étape à gauche pour exécuter la requête</span>
        </div>
        <div class="sc-terminal" id="nosql-output">&gt; En attente d'instruction...</div>
      </div>
    </div>
  `);
}

async function runNoSQLQuery(endpoint, method, label) {
  const titleEl = document.getElementById("nosql-title");
  const countEl = document.getElementById("nosql-count");
  const cmdEl = document.getElementById("nosql-cmd");
  const outputEl = document.getElementById("nosql-output");
  if (!outputEl) return;

  if (titleEl) titleEl.textContent = label;
  if (countEl) countEl.textContent = "EXÉCUTION...";
  if (cmdEl) cmdEl.textContent = `${method} ${API_BASE}${endpoint}`;
  outputEl.textContent = "Exécution sur MongoDB Atlas en cours...";

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
    });
    const json = await res.json();

    if (cmdEl && json.mongoCommand) {
      cmdEl.textContent = json.mongoCommand;
    }

    const payload = json.data !== undefined ? json.data : json;
    const count =
      json.count ?? (Array.isArray(payload) ? payload.length : null);
    if (countEl)
      countEl.textContent = count !== null ? `${count} DOC(S)` : "200 OK";

    outputEl.textContent = JSON.stringify(payload, null, 2);
  } catch {
    if (countEl) countEl.textContent = "ERREUR";
    outputEl.textContent = `Erreur : impossible de joindre le backend (${API_BASE || "serveur"}).`;
  }
}

/* ==========================================================================
   ANIMATION LEDS RPM & VÉRIFICATION BACKEND
   ========================================================================== */
function animateRPM() {
  const segs = document.querySelectorAll(".rpm-seg");
  let count = 0;
  let dir = 1;

  rpmInterval = setInterval(() => {
    count += dir * (Math.random() > 0.55 ? 2 : 1);
    if (count >= 12) dir = -1;
    if (count <= 1) dir = 1;

    segs.forEach((seg, i) => {
      seg.className = "rpm-seg";
      if (i < count) {
        if (i < 7) seg.classList.add("on-green");
        else if (i < 10) seg.classList.add("on-yellow");
        else seg.classList.add("on-red");
      }
    });

    const gearEl = document.getElementById("sw-gear-num");
    const speedEl = document.getElementById("sw-speed");
    if (gearEl && speedEl) {
      const gears = ["N", "1", "2", "3", "4", "5", "6", "7", "8"];
      const gIdx = Math.min(8, Math.floor(count / 1.4));
      gearEl.textContent = gears[gIdx];
      if (!wheelStatusOverride) {
        speedEl.textContent = `${Math.round(80 + count * 21)} KM/H`;
      }
    }
  }, 220);
}

function toggleRPM() {
  if (rpmRunning) {
    clearInterval(rpmInterval);
    document
      .querySelectorAll(".rpm-seg")
      .forEach((s) => (s.className = "rpm-seg"));
    setText("sw-gear-num", "P");
    setText("sw-speed", "STANDBY");
    rpmRunning = false;
  } else {
    animateRPM();
    rpmRunning = true;
  }
}

async function checkBackendStatus() {
  const el = document.getElementById("hud-backend");
  try {
    const res = await fetch(`${API_BASE}/races/dashboard-stats`);
    if (res.ok && el) {
      el.textContent = API_BASE ? "● ATLAS LIVE :3000" : "● ATLAS CLOUD LIVE";
      el.style.color = "#00e676";
    } else {
      throw new Error();
    }
  } catch {
    if (el) {
      el.textContent = "● HORS-LIGNE";
      el.style.color = "#e10600";
    }
  }
}

/* ==========================================================================
   HELPERS DOM
   ========================================================================== */
function setScreenLeft(html) {
  const sc = document.getElementById("screen-left");
  if (!sc) return;
  sc.querySelectorAll(".screen-boot, .screen-content").forEach((el) =>
    el.remove(),
  );
  sc.insertAdjacentHTML("beforeend", html);
}

function setScreenRight(html) {
  const sc = document.getElementById("screen-right");
  if (!sc) return;
  sc.querySelectorAll(".screen-boot, .screen-content").forEach((el) =>
    el.remove(),
  );
  sc.insertAdjacentHTML("beforeend", html);
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function getFlagEmoji(nationality) {
  const map = {
    British: "🇬🇧",
    French: "🇫🇷",
    German: "🇩🇪",
    Italian: "🇮🇹",
    Spanish: "🇪🇸",
    Dutch: "🇳🇱",
    Brazilian: "🇧🇷",
    Australian: "🇦🇺",
    American: "🇺🇸",
    Monegasque: "🇲🇨",
    Finnish: "🇫🇮",
    Austrian: "🇦🇹",
    Canadian: "🇨🇦",
    Japanese: "🇯🇵",
    Mexican: "🇲🇽",
    Swedish: "🇸🇪",
    Swiss: "🇨🇭",
    Belgian: "🇧🇪",
    Argentine: "🇦🇷",
    "New Zealander": "🇳🇿",
    Danish: "🇩🇰",
    Thai: "🇹🇭",
    Chinese: "🇨🇳",
  };
  return map[nationality] || "🏁";
}
