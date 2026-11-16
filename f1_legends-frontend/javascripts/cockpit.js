/* ==========================================================================
   F1 LEGENDS — COCKPIT DASHBOARD CONTROLLER & LOGIC
   ========================================================================== */

// Détection automatique : en local utilise http://localhost:3000, en production sur Vercel utilise des requêtes relatives ""
const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://f1-legends-backend.vercel.app";

// Écuries et palettes graphiques
const CONSTRUCTORS_LIVERY = {
  ferrari: {
    name: "Scuderia Ferrari HP",
    code: "FER",
    primaryColor: "#e10600",
    glowColor: "rgba(225, 6, 0, 0.45)",
    topWins: 243,
    titles: 16,
    drivers: ["leclerc", "hamilton", "schumacher"],
  },
  mercedes: {
    name: "Mercedes-AMG PETRONAS",
    code: "MER",
    primaryColor: "#00d2be",
    glowColor: "rgba(0, 210, 190, 0.45)",
    topWins: 125,
    titles: 8,
    drivers: ["hamilton", "russell"],
  },
  red_bull: {
    name: "Oracle Red Bull Racing",
    code: "RBR",
    primaryColor: "#1e40af",
    glowColor: "rgba(30, 64, 175, 0.5)",
    topWins: 113,
    titles: 6,
    drivers: ["verstappen", "vettel"],
  },
  mclaren: {
    name: "McLaren Formula 1 Team",
    code: "MCL",
    primaryColor: "#ff8000",
    glowColor: "rgba(255, 128, 0, 0.45)",
    topWins: 183,
    titles: 8,
    drivers: ["norris", "senna", "prost"],
  },
  williams: {
    name: "Williams Racing",
    code: "WIL",
    primaryColor: "#005aff",
    glowColor: "rgba(0, 90, 255, 0.45)",
    topWins: 114,
    titles: 9,
    drivers: ["mansell", "albon"],
  },
  aston_martin: {
    name: "Aston Martin Aramco",
    code: "AMR",
    primaryColor: "#006f62",
    glowColor: "rgba(0, 111, 98, 0.45)",
    topWins: 1,
    titles: 0,
    drivers: ["alonso", "stroll"],
  },
};

// Base de repli si le backend est hors-ligne
const FALLBACK_DRIVERS = {
  hamilton: {
    name: "Lewis Hamilton",
    number: 44,
    nationality: "British",
    flag: "🇬🇧",
    titles: 7,
    wins: 103,
    podiums: 197,
    poles: 104,
    status: "En activité",
    team: "Mercedes-AMG (-> Ferrari 2025)",
  },
  verstappen: {
    name: "Max Verstappen",
    number: 1,
    nationality: "Dutch",
    flag: "🇳🇱",
    titles: 3,
    wins: 61,
    podiums: 106,
    poles: 39,
    status: "En activité",
    team: "Red Bull Racing",
  },
  alonso: {
    name: "Fernando Alonso",
    number: 14,
    nationality: "Spanish",
    flag: "🇪🇸",
    titles: 2,
    wins: 32,
    podiums: 106,
    poles: 22,
    status: "En activité",
    team: "Aston Martin",
  },
  senna: {
    name: "Ayrton Senna",
    number: 12,
    nationality: "Brazilian",
    flag: "🇧🇷",
    titles: 3,
    wins: 41,
    podiums: 80,
    poles: 65,
    status: "Légende",
    team: "McLaren Honda",
  },
  prost: {
    name: "Alain Prost",
    number: 2,
    nationality: "French",
    flag: "🇫🇷",
    titles: 4,
    wins: 51,
    podiums: 106,
    poles: 33,
    status: "Légende",
    team: "McLaren / Williams",
  },
  schumacher: {
    name: "Michael Schumacher",
    number: 5,
    nationality: "German",
    flag: "🇩🇪",
    titles: 7,
    wins: 91,
    podiums: 155,
    poles: 68,
    status: "Légende",
    team: "Scuderia Ferrari",
  },
};

// État de l'application
const state = {
  currentTeam: "williams",
  currentDriver: "hamilton",
  audioEnabled: false,
  focusedScreen: null,
  backendConnected: false,
};

/* ==========================================================================
   AUDIO FX SYNTHESIZER (Web Audio API sans fichier externe)
   ========================================================================== */
const AudioFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
  },
  playRadioBeep() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        800,
        this.ctx.currentTime + 0.08,
      );
      gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  },
  playShiftTone() {
    if (!state.audioEnabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(450, this.ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(900, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
    } catch (e) {}
  },
};

/* ==========================================================================
   CHANGEMENT DE LIVERY / CONSTRUCTEUR
   ========================================================================== */
function selectTeam(teamKey) {
  const team = CONSTRUCTORS_LIVERY[teamKey] || CONSTRUCTORS_LIVERY.ferrari;
  state.currentTeam = teamKey;

  // Mise à jour des variables CSS
  document.documentElement.style.setProperty("--team-color", team.primaryColor);
  document.documentElement.style.setProperty("--team-glow", team.glowColor);

  // Mise à jour des tags d'écurie
  document
    .querySelectorAll(".team-name-tag")
    .forEach((el) => (el.textContent = team.name));
  document
    .querySelectorAll(".team-code-tag")
    .forEach((el) => (el.textContent = team.code));

  // Effet d'animation glitch sur les écrans
  triggerScreenGlitch();
  animateRevLeds();
  AudioFX.playRadioBeep();

  // Mise à jour de l'affichage du volant
  document.getElementById("wheel-team-code").textContent = team.code;
  document.getElementById("wheel-sub-status").textContent =
    `${team.titles} TITLES | ${team.topWins} WINS`;
}

/* ==========================================================================
   CHANGEMENT DE PILOTE
   ========================================================================== */
async function selectDriver(driverKey) {
  state.currentDriver = driverKey;
  triggerScreenGlitch();
  animateRevLeds();
  AudioFX.playShiftTone();

  let driver = FALLBACK_DRIVERS[driverKey] || FALLBACK_DRIVERS.hamilton;

  // Tentative de récupération directe depuis l'API MongoDB
  try {
    const res = await fetch(
      `${API_BASE}/api/steps/step2/q1-id?id=${driverKey}`,
    );
    if (res.ok) {
      const json = await res.json();
      if (json.data) {
        const d = json.data;
        driver = {
          name: `${d.first_name} ${d.last_name}`,
          number: d.car_number || 0,
          nationality: d.nationality,
          flag: getFlagEmoji(d.nationality),
          titles: d.world_titles || 0,
          wins: d.career_stats?.total_wins || 0,
          podiums: d.career_stats?.total_podiums || 0,
          poles: d.career_stats?.total_poles || 0,
          status: d.active_status || "Retraité",
          team: d.teams?.[0]?.team_name || "F1 Legends",
        };
      }
    }
  } catch (e) {
    // Utilise fallback local
  }

  // Rendu dans l'écran de droite (Fiche Pilote)
  document.getElementById("driver-display-name").textContent = driver.name;
  document.getElementById("driver-display-flag").textContent = driver.flag;
  document.getElementById("driver-display-num").textContent =
    `#${driver.number}`;
  document.getElementById("driver-display-team").textContent = driver.team;
  document.getElementById("driver-titles-val").textContent = driver.titles;
  document.getElementById("driver-wins-val").textContent = driver.wins;
  document.getElementById("driver-podiums-val").textContent = driver.podiums;
  document.getElementById("driver-poles-val").textContent = driver.poles;

  // Volant
  document.getElementById("wheel-driver-badge").textContent =
    `${driver.name.split(" ").pop().substring(0, 3).toUpperCase()} ${driver.number}`;
}

/* ==========================================================================
   EXÉCUTION DES ÉTAPES NOSQL (TEST CONSOLE DANS LE COCKPIT)
   ========================================================================== */
async function executeExamQuery(endpoint, label) {
  triggerScreenGlitch();
  AudioFX.playRadioBeep();

  const titleEl = document.getElementById("right-screen-title");
  const codeEl = document.getElementById("right-screen-code");
  const dataEl = document.getElementById("right-screen-data");

  titleEl.textContent = label;
  codeEl.textContent = "Exécution MongoDB en cours...";
  dataEl.textContent = "Chargement des données depuis Atlas...";

  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    const json = await res.json();
    codeEl.textContent = json.mongoCommand || endpoint;
    dataEl.textContent = JSON.stringify(
      json.data || json.result || json,
      null,
      2,
    );

    // Flash volant
    document.getElementById("wheel-sub-status").textContent = "STATUS: 200 OK";
  } catch (err) {
    codeEl.textContent = `// Requête : ${endpoint}`;
    dataEl.textContent = `⚠️ Mode Démonstration hors-ligne\nLance le backend (npm start dans f1_legends_backend) pour exécuter la requête live sur MongoDB Atlas !`;
    document.getElementById("wheel-sub-status").textContent = "STATUS: OFFLINE";
  }
}

/* ==========================================================================
   ANIMATIONS CRT / GLITCH & REV LEDS
   ========================================================================== */
function triggerScreenGlitch() {
  const screens = document.querySelectorAll(".cockpit-screen");
  screens.forEach((s) => {
    s.classList.remove("screen-glitch-active");
    void s.offsetWidth; // Force reflow
    s.classList.add("screen-glitch-active");
  });
}

function animateRevLeds() {
  const leds = document.querySelectorAll(".rev-led");
  leds.forEach((led, i) => {
    setTimeout(() => {
      led.classList.add("active");
      setTimeout(() => led.classList.remove("active"), 280);
    }, i * 25);
  });
}

/* ==========================================================================
   ZOOM / MODE FOCUS PLEIN ÉCRAN SUR UN ÉCRAN
   ========================================================================== */
function toggleScreenFocus(screenId) {
  const screen = document.getElementById(screenId);
  const overlay = document.getElementById("backdrop-overlay");

  if (state.focusedScreen === screenId) {
    // Fermeture du zoom
    screen.classList.remove("focused");
    overlay.classList.remove("active");
    state.focusedScreen = null;
  } else {
    // Zoom sur l'écran
    if (state.focusedScreen) {
      document.getElementById(state.focusedScreen)?.classList.remove("focused");
    }
    screen.classList.add("focused");
    overlay.classList.add("active");
    state.focusedScreen = screenId;
    AudioFX.playRadioBeep();
  }
}

function closeFocusedScreen() {
  if (state.focusedScreen) {
    document.getElementById(state.focusedScreen)?.classList.remove("focused");
    document.getElementById("backdrop-overlay")?.classList.remove("active");
    state.focusedScreen = null;
  }
}

/* ==========================================================================
   TÉLÉMÉTRIE CANVAS DYNAMIQUE
   ========================================================================== */
function drawTelemetryTrace() {
  const canvas = document.getElementById("telemetry-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Grille
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 25) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 15) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Trace Vitesse (Ligne 1 - Rouge F1)
  ctx.beginPath();
  ctx.strokeStyle = "#e10600";
  ctx.lineWidth = 1.8;
  for (let x = 0; x < w; x++) {
    const y = h * 0.5 + Math.sin(x * 0.04) * (h * 0.3) + Math.cos(x * 0.08) * 8;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Trace Accélérateur (Ligne 2 - Cyan)
  ctx.beginPath();
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 1.2;
  for (let x = 0; x < w; x++) {
    const y = h * 0.65 + Math.sin(x * 0.035 + 2) * (h * 0.25);
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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
  };
  return map[nationality] || "🏁";
}

/* ==========================================================================
   INITIALISATION AU CHARGEMENT
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
  selectTeam("williams");
  selectDriver("hamilton");
  drawTelemetryTrace();

  // Activer audio au premier clic utilisateur
  document.addEventListener("click", () => AudioFX.init(), { once: true });

  // Écoute touche ESC pour fermer le zoom
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFocusedScreen();
  });
});
