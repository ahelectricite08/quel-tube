import { optimizeFree, placeAfter, planRoute, travelMinutesFallback } from "./route.js";
import { chooseSide, createCode, encryptState, formatCode, normalizeCode, openSync } from "./sync.js";

const KEY = "tournee-idel-v2";
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const els = {
  app: document.querySelector("#app"),
  print: document.querySelector("#print-sheet"),
  title: document.querySelector("#page-title"),
  dayLabel: document.querySelector("#day-label"),
  toast: document.querySelector("#toast"),
  editor: document.querySelector("#editor"),
  form: document.querySelector("#patient-form"),
  suggest: document.querySelector("#f-suggest"),
  geoOk: document.querySelector("#geo-ok"),
  deleteBtn: document.querySelector("#f-delete"),
  editorTitle: document.querySelector("#editor-title"),
};

const state = load();
let view = "tour";
let dayOffset = 0;
let pickIds = new Set();
let pickCabinet = "all";
let editingId = null;
let draftGeo = null;
let suggestSeq = 0;
let busy = false;
let draft = null;
const SYNC_CODE = "tournee-sync-code";
let syncNote = "Pas encore relié. Crée un code, colle-le sur l'autre appareil : une adresse changée d'un côté arrive de l'autre.";
let syncLink = null;
let syncTimer = 0;
let syncHeard = false;

function blank() {
  return {
    settings: {
      startAddress: "",
      startLat: null,
      startLon: null,
      startLabel: "",
      startQuery: "",
      depart: "07:00",
      gps: "google",
      returnHome: false,
      cabinetId: "",
    },
    cabinets: [],
    patients: [],
    tours: {},
    done: {},
  };
}

function patientRecord(raw) {
  return {
    id: raw.id,
    name: raw.name || "",
    address: raw.address || "",
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
    geoLabel: raw.geoLabel || "",
    geoQuery: raw.geoQuery || "",
    care: raw.care || "",
    minutes: Number(raw.minutes) || 20,
    phone: raw.phone || "",
    note: raw.note || "",
    paused: Boolean(raw.paused),
    cabinetId: raw.cabinetId || "",
    habits: Array.isArray(raw.habits) ? raw.habits.map((item) => cleanPass(item)) : [],
  };
}

function load() {
  let saved = null;
  let old = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { saved = null; }
  try { old = JSON.parse(localStorage.getItem("tournee-idel-v1")); } catch { old = null; }
  const next = saved?.patients ? normalize(saved) : blank();
  const seen = new Set(next.patients.map((patient) => patient.id));
  let recovered = 0;
  for (const raw of old?.patients || []) {
    if (!raw?.name || seen.has(raw.id)) continue;
    next.patients.push(patientRecord({ ...raw, id: raw.id || uid() }));
    seen.add(raw.id);
    recovered += 1;
  }
  if (!next.settings.startAddress && old?.settings) {
    next.settings.startAddress = old.settings.startAddress || "";
    next.settings.startLat = old.settings.startLat ?? null;
    next.settings.startLon = old.settings.startLon ?? null;
    next.settings.startLabel = old.settings.startLabel || "";
    next.settings.startQuery = old.settings.startQuery || "";
    next.settings.gps = old.settings.gps || next.settings.gps;
    next.settings.returnHome = Boolean(old.settings.returnHome);
    const oldDepart = old.settings.depart;
    if (!saved?.settings?.depart) next.settings.depart = typeof oldDepart === "string" ? oldDepart : oldDepart?.matin || "07:00";
  }
  ensureCabinets(next);
  next.recovered = recovered > 0 || !Array.isArray(saved?.cabinets) || !saved.cabinets.length;
  return next;
}

function ensureCabinets(next) {
  if (!Array.isArray(next.cabinets) || !next.cabinets.length) {
    next.cabinets = [{ id: uid(), name: "Cabinet" }];
  }
  const ids = new Set(next.cabinets.map((cabinet) => cabinet.id));
  if (!ids.has(next.settings.cabinetId)) next.settings.cabinetId = next.cabinets[0].id;
  for (const patient of next.patients) {
    if (!ids.has(patient.cabinetId)) patient.cabinetId = next.cabinets[0].id;
  }
}

function normalize(saved) {
  const next = blank();
  next.settings = { ...next.settings, ...saved.settings };
  if (typeof next.settings.depart !== "string") next.settings.depart = "07:00";
  next.patients = (saved.patients || []).map(patientRecord);
  next.tours = Object.fromEntries(Object.entries(saved.tours || {}).map(([key, tour]) => [key, migrateTour(tour)]));
  next.done = saved.done || {};
  next.cabinets = Array.isArray(saved.cabinets) ? saved.cabinets.filter((cabinet) => cabinet?.id && cabinet?.name) : [];
  next.updatedAt = Number(saved.updatedAt) || 0;
  ensureCabinets(next);
  return next;
}

function save(options = {}) {
  const cutoff = dateKey(addDays(new Date(), -14));
  for (const key of Object.keys(state.done)) if (key < cutoff) delete state.done[key];
  for (const key of Object.keys(state.tours)) if (key < cutoff) delete state.tours[key];
  if (!options.remote) state.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  if (!options.remote) scheduleSync();
}

function scheduleSync() {
  if (!syncLink || !localStorage.getItem(SYNC_CODE)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushSync(), 700);
}

async function pushSync() {
  const code = localStorage.getItem(SYNC_CODE);
  if (!code || !syncLink) return;
  try {
    syncLink.publish(await encryptState(code, state));
  } catch {
    syncNote = "L'envoi a échoué";
  }
}

function connectSync() {
  const code = normalizeCode(localStorage.getItem(SYNC_CODE) || "");
  if (code.length !== 16) return;
  syncLink?.close();
  syncHeard = false;
  syncLink = openSync(code, {
    onStatus(text) {
      syncNote = text;
      const note = document.querySelector("#sync-note");
      if (note) note.textContent = text;
    },
    onState(remote) {
      syncHeard = true;
      receiveSync(remote);
    },
  });
  setTimeout(() => {
    if (!syncHeard && state.patients.length) pushSync();
  }, 2000);
}

function receiveSync(remote) {
  let next = null;
  try { next = normalize(remote); } catch { return; }
  const choice = chooseSide(state, next);
  if (choice === "local") {
    scheduleSync();
    return;
  }
  if (choice !== "remote") return;
  state.settings = next.settings;
  state.patients = next.patients;
  state.tours = next.tours;
  state.done = next.done;
  state.cabinets = next.cabinets;
  state.updatedAt = next.updatedAt;
  save({ remote: true });
  render();
  flash("Mis à jour depuis l'autre appareil");
}

function useSyncCode(code) {
  localStorage.setItem(SYNC_CODE, normalizeCode(code));
  connectSync();
  render();
}

function uid() {
  return crypto.randomUUID();
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  next.setHours(12, 0, 0, 0);
  return next;
}

function selectedDate() {
  return addDays(new Date(), dayOffset);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayKey() {
  return dateKey(selectedDate());
}

function toMin(value) {
  if (!value) return null;
  const [h, m] = String(value).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function departMin() {
  return toMin(state.settings.depart) ?? 7 * 60;
}

function fromMin(min) {
  const day = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, "0")}:${String(day % 60).padStart(2, "0")}`;
}

function formatHM(min) {
  const rounded = Math.round(min);
  const day = ((rounded % 1440) + 1440) % 1440;
  return `${Math.floor(day / 60)}h${String(day % 60).padStart(2, "0")}`;
}

function formatClock(value) {
  const min = toMin(value);
  return min == null ? "" : formatHM(min);
}

function clockParts(value) {
  const total = toMin(value);
  if (total == null) return { hour: "", minute: "" };
  return { hour: String(Math.floor(total / 60)), minute: String(total % 60).padStart(2, "0") };
}

function clockControl(value, extra = "") {
  const { hour, minute } = clockParts(value);
  const hours = [`<option value="">—</option>`, ...Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${String(h) === hour ? "selected" : ""}>${h}</option>`)].join("");
  const minutes = [`<option value="">—</option>`];
  for (let m = 0; m < 60; m += 5) {
    const label = String(m).padStart(2, "0");
    minutes.push(`<option value="${label}" ${label === minute ? "selected" : ""}>${label}</option>`);
  }
  if (minute && Number(minute) % 5 !== 0) minutes.push(`<option value="${minute}" selected>${minute}</option>`);
  return `<span class="clock" ${extra}><select data-hour aria-label="Heure">${hours}</select><span>h</span><select data-minute aria-label="Minutes">${minutes.join("")}</select></span>`;
}

function clockValue(root) {
  if (!root) return "";
  const hour = root.querySelector("[data-hour]")?.value;
  const minute = root.querySelector("[data-minute]")?.value;
  if (hour === "" || minute === "" || hour == null || minute == null) return "";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function formatDuration(min) {
  const rounded = Math.max(0, Math.round(min));
  if (rounded < 60) return `${rounded} min`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

function flash(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2800);
}

function currentTour() {
  return state.tours[todayKey()] || null;
}

function tourStops() {
  const tour = currentTour();
  if (!tour?.stops?.length) return [];
  const byId = new Map(tour.stops.map((stop) => [stop.id, stop]));
  const ordered = [];
  for (const id of tour.order || []) {
    if (byId.has(id)) {
      ordered.push(byId.get(id));
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()];
}

function rows() {
  return tourStops().map((stop) => ({ stop, patient: patientById(stop.patientId) })).filter((row) => row.patient);
}

function rowName(row) {
  const total = tourStops().filter((stop) => stop.patientId === row.stop.patientId).length;
  return total > 1 ? `${row.patient.name} · passage ${row.stop.pass}` : row.patient.name;
}

function statusOf(id) {
  return state.done[todayKey()]?.[id] || "";
}

function markStatus(id, status) {
  const day = todayKey();
  state.done[day] ||= {};
  if (status) state.done[day][id] = status;
  else delete state.done[day][id];
  save();
}

function pending() {
  return rows().filter((row) => !statusOf(row.stop.id));
}

function patientById(id) {
  return state.patients.find((patient) => patient.id === id);
}

function normalizedVisit(visit) {
  const minutes = Number(visit?.minutes) || 20;
  if (visit?.mode) return { minutes, mode: visit.mode, at: visit.at || "", from: visit.from || "", to: visit.to || "" };
  if (visit?.around) return { minutes, mode: "fixe", at: visit.around, from: "", to: "" };
  if (visit && "around" in visit) return { minutes, mode: "quand", at: "", from: "", to: "" };
  return { minutes, mode: "", at: "", from: "", to: "" };
}

function cleanPass(visit) {
  const item = normalizedVisit(visit);
  return {
    minutes: Math.min(180, Math.max(5, Number(item.minutes) || 20)),
    mode: item.mode,
    at: item.at,
    from: item.from,
    to: item.to,
  };
}

function migrateTour(tour) {
  if (!tour || typeof tour !== "object") return { stops: [], order: [], ids: [], matrix: null, source: "", manual: false };
  if (Array.isArray(tour.stops) && tour.stops.length) return tour;
  const stops = Object.entries(tour.visits || {}).map(([patientId, visit]) => ({
    id: patientId,
    patientId,
    pass: 1,
    ...cleanPass(visit),
  }));
  return { ...tour, stops, order: tour.order?.length ? tour.order : stops.map((stop) => stop.id) };
}

function slotFor(visit) {
  const item = normalizedVisit(visit);
  if (item.mode === "fixe") {
    const at = toMin(item.at);
    return at == null ? { open: null, close: null } : { open: at, close: at + 10 };
  }
  if (item.mode === "partir") {
    const at = toMin(item.at);
    return at == null ? { open: null, close: null } : { open: at, close: null };
  }
  if (item.mode === "entre") {
    const open = toMin(item.from);
    const close = toMin(item.to);
    if (open == null || close == null || open >= close) return { open: null, close: null };
    return { open, close };
  }
  return { open: null, close: null };
}

function compareNames(a, b) {
  return String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base" });
}

function activePatients() {
  return state.patients
    .filter((patient) => !patient.paused)
    .sort((a, b) => compareNames(a.name, b.name));
}

async function geocode(query) {
  const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`);
  if (!response.ok) return null;
  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) return null;
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon, label: feature.properties.label };
}

async function suggest(query) {
  const response = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.features || []).map((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    return { lat, lon, label: feature.properties.label };
  });
}

async function ensurePatientGeo(patient) {
  if (patient.lat != null && patient.geoQuery === patient.address) return patient;
  const geo = await geocode(patient.address);
  if (!geo) return null;
  patient.lat = geo.lat;
  patient.lon = geo.lon;
  patient.geoLabel = geo.label;
  patient.geoQuery = patient.address;
  return patient;
}

async function ensureStartGeo() {
  const settings = state.settings;
  if (!settings.startAddress.trim()) return null;
  if (settings.startLat != null && settings.startQuery === settings.startAddress) {
    return { lat: settings.startLat, lon: settings.startLon, label: settings.startLabel };
  }
  const geo = await geocode(settings.startAddress);
  if (!geo) return null;
  settings.startLat = geo.lat;
  settings.startLon = geo.lon;
  settings.startLabel = geo.label;
  settings.startQuery = settings.startAddress;
  return geo;
}

async function travelMatrix(points) {
  const path = points.map((point) => `${point.lon},${point.lat}`).join(";");
  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${path}?annotations=duration`);
    if (!response.ok) throw new Error("osrm");
    const data = await response.json();
    if (!data.durations) throw new Error("osrm");
    return {
      source: "road",
      matrix: data.durations.map((row, rowIndex) => row.map((seconds, colIndex) => {
        if (rowIndex === colIndex) return 0;
        if (seconds == null) return travelMinutesFallback(points[rowIndex], points[colIndex]);
        return Math.max(1, Math.round(seconds / 60));
      })),
    };
  } catch {
    return {
      source: "estimate",
      matrix: points.map((from, rowIndex) => points.map((to, colIndex) => (rowIndex === colIndex ? 0 : travelMinutesFallback(from, to)))),
    };
  }
}

function computeEtas() {
  const tour = currentTour();
  const map = new Map();
  if (!tour?.matrix || !tour.order?.length) return map;
  const index = new Map((tour.ids || []).map((id, i) => [id, i]));
  const byId = new Map((tour.stops || []).map((stop) => [stop.id, stop]));
  let time = departMin();
  let prev = tour.ids[0];
  for (const id of tour.order) {
    const stop = byId.get(id);
    const from = index.get(prev);
    const to = index.get(id);
    if (!stop || from == null || to == null) continue;
    const travel = tour.matrix[from][to];
    const arrive = time + travel;
    const slot = slotFor(stop);
    const placed = stop.hand === true || (stop.hand !== false && tour.manual);
    const held = placed && normalizedVisit(stop).mode === "fixe" ? null : slot.open;
    const start = held == null ? arrive : Math.max(arrive, held);
    const late = slot.close == null ? 0 : Math.max(0, start - slot.close);
    map.set(id, {
      travel,
      arrive,
      start,
      wait: Math.max(0, start - arrive),
      late,
      end: start + Number(stop.minutes),
    });
    time = start + Number(stop.minutes);
    prev = id;
  }
  if (state.settings.returnHome) {
    const backFrom = index.get(prev);
    const backTo = index.get(tour.ids[0]);
    if (backFrom != null && backTo != null) {
      map.set("__return__", { travel: tour.matrix[backFrom][backTo], arrive: time + tour.matrix[backFrom][backTo] });
    }
  }
  return map;
}

function gpsUrl(patient) {
  const destination = patient.lat != null ? `${patient.lat},${patient.lon}` : patient.address || patient.label;
  if (state.settings.gps === "waze") {
    if (patient.lat != null) return `https://waze.com/ul?ll=${patient.lat},${patient.lon}&navigate=yes`;
    return `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function openGps(patient) {
  const opened = window.open(gpsUrl(patient), "_blank", "noopener");
  if (!opened) flash("Le GPS n'a pas pu s'ouvrir. Utilise le bouton GPS du patient.");
}

function renderShell() {
  const date = selectedDate();
  const titles = { tour: "Tournée", patients: "Patients", pick: "Patients du jour", pass: draft?.phase === "start" ? "Départ" : "Heure de passage" };
  els.dayLabel.textContent = `${dayOffset === 0 ? "Aujourd'hui" : "Demain"} · ${DAYS[date.getDay()]} ${date.getDate()}`;
  els.title.textContent = titles[view] || "Tournée";
  document.querySelector("#day-today").classList.toggle("on", dayOffset === 0);
  document.querySelector("#day-tomorrow").classList.toggle("on", dayOffset === 1);
  document.querySelectorAll("[data-view]").forEach((button) => {
    const on = button.dataset.view === "patients" ? view === "patients" : view !== "patients";
    button.classList.toggle("on", on);
  });
  document.body.classList.toggle("in-pass", view === "pass");
  document.title = `${DAYS[date.getDay()]} ${date.getDate()} · Tournée`;
}

function departBlock() {
  const settings = state.settings;
  return `
    <section class="depart">
      <label>Je pars de<input id="start-address" value="${esc(settings.startAddress)}" placeholder="Cabinet ou domicile"></label>
      ${settings.startLabel ? `<p class="geo-ok">Repéré : ${esc(settings.startLabel)}</p>` : ""}
      <div class="split" style="margin-top:10px">
        <label>GPS
          <select id="gps-app">
            <option value="google" ${settings.gps === "google" ? "selected" : ""}>Google Maps</option>
            <option value="waze" ${settings.gps === "waze" ? "selected" : ""}>Waze</option>
          </select>
        </label>
      </div>
      <label class="check" style="margin-top:10px"><input id="return-home" type="checkbox" ${settings.returnHome ? "checked" : ""}> Revenir au point de départ à la fin</label>
      <p class="hint privacy">Les noms restent dans ce téléphone. L'adresse sert seulement à trouver la rue et le temps de route.</p>
    </section>`;
}

function whenLabel(visit) {
  const item = normalizedVisit(visit);
  if (item.mode === "fixe" && item.at) return `Fixe ${formatClock(item.at)}`;
  if (item.mode === "partir" && item.at) return `À partir de ${formatClock(item.at)}`;
  if (item.mode === "entre" && item.from && item.to) return `Entre ${formatClock(item.from)} et ${formatClock(item.to)}`;
  if (item.mode === "quand") return "N'importe quand";
  return "Heure à choisir";
}

function etaBadges(eta, visit) {
  if (!eta) return `<div class="badges"><span class="badge">${esc(whenLabel(visit))}</span></div>`;
  const bits = [
    `<span class="badge">${eta.travel} min de route</span>`,
    `<span class="badge">Arrivée ${formatHM(eta.arrive)}</span>`,
    `<span class="badge">${esc(whenLabel(visit))}</span>`,
  ];
  if (eta.wait >= 2) bits.push(`<span class="badge wait">Attente ${eta.wait} min</span>`);
  if (eta.late > 0) bits.push(`<span class="badge late">Après l'heure, ${eta.late} min</span>`);
  return `<div class="badges">${bits.join("")}</div>`;
}

function renderTour() {
  const beforeDepart = state.settings.depart;
  refreshLeave();
  if (beforeDepart !== state.settings.depart) save();
  const route = rows();
  const list = [...route].sort((a, b) => compareNames(a.patient.name, b.patient.name) || a.stop.pass - b.stop.pass);
  const etas = computeEtas();
  const next = pending()[0];
  const doneCount = list.filter((row) => statusOf(row.stop.id) === "done").length;
  const absentCount = list.filter((row) => statusOf(row.stop.id) === "absent").length;
  const careMin = list.reduce((sum, row) => sum + (statusOf(row.stop.id) ? 0 : Number(row.stop.minutes) || 0), 0);
  const travelMin = [...etas.values()].reduce((sum, eta) => sum + (eta.travel || 0), 0);
  const tour = currentTour();
  const missingStart = !state.settings.startAddress.trim();
  const lastPending = pending().length === 1;

  const stats = list.length ? `
    <div class="stats">
      <div class="stat"><strong>${doneCount}/${list.length}</strong><span>faits${absentCount ? ` · ${absentCount} absents` : ""}</span></div>
      <div class="stat"><strong>${formatDuration(careMin)}</strong><span>de soins restants</span></div>
      <div class="stat"><strong>${tour?.matrix ? formatDuration(travelMin) : "—"}</strong><span>${tour?.source === "estimate" ? "route estimée" : "de route"}</span></div>
    </div>` : "";

  let current = "";
  if (next) {
    const eta = etas.get(next.stop.id);
    current = `
      <article class="stop-card">
        <p class="now-kicker">Prochain passage</p>
        <h2 class="name"><button type="button" class="when-link" data-when="${esc(next.patient.id)}">${esc(rowName(next))}</button></h2>
        <p>${esc(next.patient.geoLabel || next.patient.address)}</p>
        <p class="meta">${esc(next.patient.care || "Soin")} · ${next.stop.minutes} min · ${esc(whenLabel(next.stop))}${eta ? ` · fin ${formatHM(eta.end)}` : ""}</p>
        ${etaBadges(eta, next.stop)}
        ${next.patient.note ? `<p class="note">${esc(next.patient.note)}</p>` : ""}
        <div class="stepper">
          <button type="button" data-step="-5" data-id="${esc(next.stop.id)}" aria-label="Retirer 5 minutes">−</button>
          <strong>${next.stop.minutes} min</strong>
          <button type="button" data-step="5" data-id="${esc(next.stop.id)}" aria-label="Ajouter 5 minutes">+</button>
        </div>
        <div class="stack">
          ${next.patient.phone ? `<a class="linkish" href="tel:${esc(next.patient.phone)}">Appeler</a>` : ""}
          ${tour?.goingTo === next.stop.id
            ? `<button type="button" class="primary" id="done-next">${lastPending ? (state.settings.returnHome ? "Soin fait, retour au départ" : "Soin fait, terminer") : "Soin fait, GPS suivant"}</button>`
            : `<button type="button" class="primary" id="go-next">Y aller</button>`}
          <button type="button" class="ghost" data-when="${esc(next.patient.id)}">Modifier l'horaire</button>
          <button type="button" class="ghost" id="absent-next">Absent, passer au suivant</button>
        </div>
      </article>`;
  } else if (list.length) {
    current = `<article class="stop-card"><h2 class="name">Tournée terminée</h2><p class="meta">${doneCount} soins faits${absentCount ? `, ${absentCount} absents` : ""}.</p></article>`;
  }

  const stops = list.map((row, index) => {
    const status = statusOf(row.stop.id);
    const eta = etas.get(row.stop.id);
    const cls = [status, eta?.late > 0 && !status ? "late" : ""].filter(Boolean).join(" ");
    const rank = route.findIndex((item) => item.stop.id === row.stop.id) + 1;
    return `
      <li class="stop ${cls}">
        <div class="thread"><span class="num">${index + 1}</span></div>
        <div class="stop-body">
          <h3><button type="button" class="when-link" data-when="${esc(row.patient.id)}">${esc(rowName(row))}</button></h3>
          <p class="meta">${esc(row.patient.care || "Soin")} · ${row.stop.minutes} min · ${esc(whenLabel(row.stop))}${eta ? ` · arrivée ${formatHM(eta.arrive)}` : ""} · ${rank === 1 ? "1er sur la route" : `${rank}e sur la route`}</p>
          <p class="meta">${esc(row.patient.address)}</p>
          ${status ? `<div class="badges"><span class="badge done">${status === "done" ? "Fait" : "Absent"}</span></div>` : etaBadges(eta, row.stop)}
          ${row.patient.note ? `<p class="note">${esc(row.patient.note)}</p>` : ""}
          <label class="check pin"><input type="checkbox" data-hold="${esc(row.stop.id)}" ${row.stop.hold ? "checked" : ""}> À la main</label>
          <div class="row-actions">
            <button type="button" data-move="-1" data-id="${esc(row.stop.id)}">Monter</button>
            <button type="button" data-move="1" data-id="${esc(row.stop.id)}">Descendre</button>
            <button type="button" data-when="${esc(row.patient.id)}">Horaire</button>
            <button type="button" data-gps="${esc(row.patient.id)}">GPS</button>
            ${status ? `<button type="button" data-clear="${esc(row.stop.id)}">Remettre</button>` : `<button type="button" data-done="${esc(row.stop.id)}">Fait</button>`}
          </div>
        </div>
      </li>`;
  }).join("");

  const returnEta = etas.get("__return__");
  const first = route[0];
  const firstEta = first ? etas.get(first.stop.id) : null;
  const leave = tour?.matrix && first && firstEta ? `<p class="banner leave"><strong>Pars à ${formatClock(state.settings.depart)}</strong>. ${firstEta.travel} min de route, tu es chez ${esc(rowName(first))} à ${formatHM(firstEta.arrive)}.${tour.leaveProposed ? " Aucune heure n'est imposée, l'arrivée chez le premier est calée à 8h00." : ""}</p>` : "";
  els.app.innerHTML = `
    ${missingStart && list.length ? `<p class="banner">Indique d'où tu pars pour calculer la route.</p>` : ""}
    ${leave}
    ${current}
    ${stats}
    ${list.length ? firstPatientControl(tour) : ""}
    <div class="stack">
      ${list.length ? `<button type="button" class="primary" id="organize" ${busy ? "disabled" : ""}>${busy ? "Optimisation…" : "Optimiser"}</button>` : ""}
      <button type="button" class="ghost" id="choose">${list.length ? "Changer les patients" : "Choisir les patients"}</button>
      ${list.length ? `<button type="button" class="ghost" id="print-tour">Imprimer la tournée</button>` : ""}
      ${state.tours[dateKey(new Date())]?.stops?.length ? `<button type="button" class="ghost" id="copy-tomorrow">Même tournée pour demain</button>` : ""}
    </div>
    ${list.length ? `<p class="hint">Les noms sont dans l'ordre alphabétique. Appuie sur un nom pour changer son horaire. Le prochain patient et les arrivées suivent la route. « À la main », déjà fait ou absent, ne bouge pas.</p><ol class="stops">${stops}</ol>` : `<div class="empty"><strong>La journée n'est pas encore composée.</strong>Coche les patients dans ta base. Les horaires habituels reviennent tout seuls.</div>`}
    ${returnEta ? `<p class="return-line">Retour au départ : ${returnEta.travel} min, arrivée ${formatHM(returnEta.arrive)}.</p>` : ""}
    ${backupBlock()}
    <details class="depart-fold" ${missingStart ? "open" : ""}>
      <summary>Départ et GPS</summary>
      ${departBlock()}
    </details>`;
}

function cabinetName(id) {
  return state.cabinets.find((cabinet) => cabinet.id === id)?.name || "Cabinet";
}

function careMinutes(patient) {
  return Number(patient.habits?.[0]?.minutes) || Number(patient.minutes) || 20;
}

function cabinetBar(filter) {
  const chips = state.cabinets.map((cabinet) => {
    const on = filter ? (filter === "all" ? false : cabinet.id === filter) : cabinet.id === state.settings.cabinetId;
    return `<button type="button" data-cabinet="${esc(cabinet.id)}" class="${on ? "on" : ""}">${esc(cabinet.name)}</button>`;
  }).join("");
  const all = filter ? `<button type="button" data-cabinet="all" class="${filter === "all" ? "on" : ""}">Tous</button>` : "";
  return `
    <div class="cabinet-switch">${all}${chips}<button type="button" id="show-cabinet">Autre cabinet</button></div>
    <form id="cabinet-form" class="cabinet-form" hidden>
      <label>Nom du cabinet<input id="cabinet-name" placeholder="Remplacement, autre ville…" required></label>
      <button type="submit" class="primary">Ajouter ce cabinet</button>
    </form>`;
}

function renderPick() {
  const query = (renderPick.query || "").trim().toLowerCase();
  const list = activePatients().filter((patient) => {
    if (pickCabinet !== "all" && patient.cabinetId !== pickCabinet) return false;
    return !query || `${patient.name} ${patient.address} ${cabinetName(patient.cabinetId)}`.toLowerCase().includes(query);
  });
  const count = pickIds.size;
  const countText = count ? `<strong>${count}</strong> patient${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""}` : "<strong>Aucun</strong> patient sélectionné";
  els.app.innerHTML = `
    <p class="hint" style="margin-bottom:12px">Coche ceux de cette journée. Le temps à côté du nom est le temps de soin : tu peux le changer ici. Décocher retire le patient seulement d'aujourd'hui.</p>
    ${cabinetBar(pickCabinet)}
    <div class="tools">
      <label class="search">Rechercher<input id="pick-search" value="${esc(renderPick.query || "")}" placeholder="Nom ou rue"></label>
    </div>
    ${list.length ? list.map((patient) => `
      <article class="pick">
        <label>
          <input type="checkbox" data-pick="${esc(patient.id)}" ${pickIds.has(patient.id) ? "checked" : ""}>
          <span><strong>${esc(patient.name)}</strong><small>${esc(patient.address)}${state.cabinets.length > 1 ? ` · ${esc(cabinetName(patient.cabinetId))}` : ""}</small></span>
        </label>
        <div class="pick-time">
          <button type="button" data-pick-min="-5" data-id="${esc(patient.id)}" aria-label="Retirer 5 minutes">−</button>
          <strong>${careMinutes(patient)} min</strong>
          <button type="button" data-pick-min="5" data-id="${esc(patient.id)}" aria-label="Ajouter 5 minutes">+</button>
        </div>
      </article>`).join("") : `<div class="empty"><strong>Aucun patient dans ce cabinet.</strong>Ajoute un cabinet, ou enregistre d'abord les fiches.</div>`}
    <div class="pick-bar">
      <p id="pick-count">${countText}</p>
      <div class="stack">
        <button type="button" class="primary" id="to-pass">Passer les horaires</button>
        <button type="button" class="ghost" id="add-from-pick">Ajouter un patient</button>
        <button type="button" class="ghost" id="back-tour">Retour</button>
      </div>
    </div>`;
}

function passFields(visit, index) {
  if (visit.mode === "fixe") return `<label>Heure fixe${clockControl(visit.at, `data-pass="${index}" data-time="at"`)}</label>`;
  if (visit.mode === "partir") return `<label>À partir de${clockControl(visit.at, `data-pass="${index}" data-time="at"`)}</label>`;
  if (visit.mode === "entre") {
    return `<div class="split">
      <label>De${clockControl(visit.from, `data-pass="${index}" data-time="from"`)}</label>
      <label>À${clockControl(visit.to, `data-pass="${index}" data-time="to"`)}</label>
    </div>`;
  }
  if (visit.mode === "quand") return `<p class="hint">Ce passage se place là où la route est la plus courte.</p>`;
  return "";
}

function passBlock(visit, index, total) {
  return `
    <section class="pass-block">
      <p class="label">${total > 1 ? `Passage ${index + 1}` : "Heure de passage"}</p>
      <div class="chips">
        ${[10, 15, 20, 30, 45, 60].map((minutes) => `<button type="button" data-pass="${index}" data-minutes="${minutes}" class="${Number(visit.minutes) === minutes ? "on" : ""}">${minutes} min</button>`).join("")}
      </div>
      <div class="stepper">
        <button type="button" data-pass-step="-5" data-pass="${index}" aria-label="Retirer 5 minutes">−</button>
        <strong>${visit.minutes} min</strong>
        <button type="button" data-pass-step="5" data-pass="${index}" aria-label="Ajouter 5 minutes">+</button>
      </div>
      <div class="mode-row">
        <button type="button" data-mode="fixe" data-pass="${index}" class="${visit.mode === "fixe" ? "on" : ""}">Horaire fixe</button>
        <button type="button" data-mode="partir" data-pass="${index}" class="${visit.mode === "partir" ? "on" : ""}">À partir de</button>
        <button type="button" data-mode="entre" data-pass="${index}" class="${visit.mode === "entre" ? "on" : ""}">Entre deux heures</button>
        <button type="button" data-mode="quand" data-pass="${index}" class="${visit.mode === "quand" ? "on" : ""}">N'importe quand</button>
      </div>
      ${passFields(visit, index)}
    </section>`;
}

function firstPatientControl(tour) {
  const seen = new Set();
  const options = [];
  for (const row of rows()) {
    if (seen.has(row.patient.id)) continue;
    seen.add(row.patient.id);
    const passage = tourStops().filter((stop) => stop.patientId === row.patient.id).sort((a, b) => a.pass - b.pass)[0];
    const when = passage ? whenLabel(passage) : "";
    const label = when && when !== "N'importe quand" ? `${row.patient.name} · ${when}` : row.patient.name;
    options.push({ name: row.patient.name, html: `<option value="${esc(row.patient.id)}" ${tour?.firstPatientId === row.patient.id ? "selected" : ""}>${esc(label)}</option>` });
  }
  options.sort((a, b) => compareNames(a.name, b.name));
  return `<label class="first-patient">C'est qui, le premier ?
    <select id="first-patient">
      <option value="" ${tour?.firstPatientId ? "" : "selected"}>—</option>
      ${options.map((option) => option.html).join("")}
    </select>
  </label>`;
}

function renderStart() {
  const picks = [...draft.ids].sort((a, b) => compareNames(patientById(a)?.name, patientById(b)?.name)).map((id) => {
    const patient = patientById(id);
    if (!patient) return "";
    return `<button type="button" data-first="${esc(id)}" class="${draft.firstId === id ? "on" : ""}">${esc(patient.name)}</button>`;
  }).join("");
  els.app.innerHTML = `
    <article class="stop-card">
      <p class="now-kicker">Avant de calculer</p>
      <h2 class="name">D'où tu pars ?</h2>
      <label>Adresse de départ
        <input id="day-from" value="${esc(draft.from || state.settings.startAddress)}" placeholder="Cabinet ou domicile" autocomplete="off">
      </label>
      <ul id="start-suggest" class="suggest" hidden></ul>
      <p class="geo-ok" id="start-geo" ${draft.geoLabel || state.settings.startLabel ? "" : "hidden"}>${esc(draft.geoLabel || (draft.from ? "" : state.settings.startLabel ? `Repéré : ${state.settings.startLabel}` : ""))}</p>
      <p class="label">C'est qui, le premier ?</p>
      <div class="first-picks">${picks}</div>
      <p class="hint">L'heure de départ se cale sur ce patient. Les autres passent après, sans te faire partir au milieu de la nuit.</p>
      <div class="stack">
        <button type="button" class="ghost" id="pass-back">Retour au dernier patient</button>
        <button type="button" class="primary" id="confirm-start">Calculer la tournée</button>
      </div>
    </article>`;
}

function renderPass() {
  if (draft.phase === "start") {
    renderStart();
    return;
  }
  const id = draft.ids[draft.index];
  const patient = patientById(id);
  const sheet = draft.sheets[id];
  const last = draft.index === draft.ids.length - 1;
  const known = patient.habits?.some((item) => item.mode);
  const nextLabel = draft.single ? "Enregistrer l'horaire" : last ? "C'est bon, le départ" : known ? "C'est bon, suivant" : "Patient suivant";
  els.app.innerHTML = `
    ${draft.single ? "" : `<p class="progress">${draft.index + 1} sur ${draft.ids.length}</p>`}
    <article class="stop-card pass-card">
      <h2 class="name">${esc(patient.name)}</h2>
      <p>${esc(patient.geoLabel || patient.address)}</p>
      <p class="meta">${esc(patient.care || "Soin")}</p>
      ${draft.single ? `<p class="hint">Tu changes l'horaire de ce patient. Les autres restent dans la tournée.</p>` : known ? `<p class="hint">Habitude enregistrée. Laisse comme ça si c'est bon, ou change pour cette tournée.</p>` : ""}
      <p class="label">Nombre de passages</p>
      <div class="stepper">
        <button type="button" id="count-minus" aria-label="Un passage de moins">−</button>
        <strong>${sheet.count}</strong>
        <button type="button" id="count-plus" aria-label="Un passage de plus">+</button>
      </div>
      ${sheet.passes.slice(0, sheet.count).map((pass, index) => passBlock(pass, index, sheet.count)).join("")}
      <div class="stack">
        ${draft.single ? `<button type="button" class="ghost" id="pass-cancel">Retour</button>` : draft.index > 0 ? `<button type="button" class="ghost" id="pass-back">Patient précédent</button>` : ""}
        <button type="button" class="primary" id="pass-next">${nextLabel}</button>
      </div>
    </article>`;
}

function renderPatients() {
  const query = (renderPatients.query || "").trim().toLowerCase();
  const list = state.patients
    .filter((patient) => patient.cabinetId === state.settings.cabinetId)
    .filter((patient) => !query || `${patient.name} ${patient.address} ${patient.care}`.toLowerCase().includes(query))
    .sort((a, b) => compareNames(a.name, b.name));
  els.app.innerHTML = `
    ${cabinetBar("")}
    <div class="tools">
      <label class="search">Rechercher<input id="patient-search" value="${esc(renderPatients.query || "")}" placeholder="Nom ou rue"></label>
      <button type="button" class="add" id="add-patient">Ajouter</button>
    </div>
    ${list.length ? list.map((patient) => `
      <article class="patient-card">
        <h3>${esc(patient.name)}${patient.paused ? " · en pause" : ""}</h3>
        <p class="meta">${esc(patient.address)}</p>
        <p class="meta">${esc(patient.care || "Soin")} · ${patient.habits?.length ? patient.habits.map((item) => whenLabel(item)).join(" · ") : `${patient.minutes} min habituelles`}</p>
        <div class="row-actions"><button type="button" data-edit="${esc(patient.id)}">Modifier</button></div>
      </article>`).join("") : `<div class="empty"><strong>La base est vide.</strong>Un nom et une adresse suffisent. Le temps du jour se choisit au moment de la tournée.</div>`}
    ${backupBlock()}`;
}

function backupBlock() {
  const code = localStorage.getItem(SYNC_CODE) || "";
  return `
    <section class="backup">
      <h2>Téléphone et ordinateur</h2>
      <p class="hint" id="sync-note">${esc(syncNote)}</p>
      ${code ? `
        <p class="sync-code">${esc(formatCode(code))}</p>
        <div class="row-actions">
          <button type="button" id="sync-copy">Copier le code</button>
          <button type="button" id="sync-stop">Arrêter la liaison</button>
        </div>` : `
        <div class="stack">
          <button type="button" class="primary" id="sync-create">Créer le code</button>
          <label>Code de l'autre appareil<input id="sync-paste" autocomplete="off" placeholder="Colle le code ici"></label>
          <button type="button" class="ghost" id="sync-join">Relier avec ce code</button>
        </div>`}
      <p class="hint">Le code est le secret. Sans lui, les noms ne se lisent pas. Garde-le pour tes appareils seulement.</p>
      <div class="row-actions">
        <button type="button" id="export-data">Télécharger la base</button>
        <label class="file ghost">Importer<input id="import-data" type="file" accept="application/json" hidden></label>
      </div>
    </section>`;
}

function render() {
  renderShell();
  if (view === "patients") renderPatients();
  else if (view === "pick") renderPick();
  else if (view === "pass") renderPass();
  else renderTour();
  renderPrint();
  bindView();
}

function renderPrint() {
  const list = rows();
  const etas = computeEtas();
  const date = selectedDate().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const tour = currentTour();
  const from = state.settings.startLabel || state.settings.startAddress;
  const leave = tour?.matrix && state.settings.depart ? `Pars à ${formatClock(state.settings.depart)}` : "";
  const returnEta = etas.get("__return__");
  const stops = list.map((row, index) => {
    const eta = etas.get(row.stop.id);
    const status = statusOf(row.stop.id);
    const mark = status === "done" ? "Fait" : status === "absent" ? "Absent" : "";
    return `
      <article class="sheet-stop">
        <span class="sheet-box"></span>
        <div>
          <p class="sheet-kicker">${index + 1}${eta ? ` · arrivée ${formatHM(eta.arrive)}` : ""} · ${esc(whenLabel(row.stop))}${mark ? ` · ${mark}` : ""}</p>
          <h2>${esc(rowName(row))}</h2>
          <p>${esc(row.patient.care || "Soin")} · ${row.stop.minutes} min</p>
          <p>${esc(row.patient.geoLabel || row.patient.address)}</p>
          ${row.patient.phone ? `<p class="sheet-strong">${esc(row.patient.phone)}</p>` : ""}
          ${row.patient.note ? `<p class="sheet-strong">${esc(row.patient.note)}</p>` : ""}
        </div>
      </article>`;
  }).join("");
  els.print.innerHTML = list.length ? `
    <header class="sheet-head">
      <p>Tournée</p>
      <h1>${esc(date)}</h1>
      ${leave || from ? `<p>${esc([leave, from ? `Départ : ${from}` : ""].filter(Boolean).join(" · "))}</p>` : ""}
    </header>
    ${stops}
    ${returnEta ? `<p class="sheet-back">Retour au départ · ${returnEta.travel} min · arrivée ${formatHM(returnEta.arrive)}</p>` : state.settings.returnHome && from ? `<p class="sheet-back">Retour : ${esc(from)}</p>` : ""}
  ` : "";
}

function bindSearch(selector, store) {
  document.querySelector(selector)?.addEventListener("input", (event) => {
    store.query = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const field = document.querySelector(selector);
    if (field) {
      field.focus();
      field.setSelectionRange(pos, pos);
    }
  });
}

function bindView() {
  document.querySelector("#start-address")?.addEventListener("change", (event) => {
    state.settings.startAddress = event.target.value.trim();
    state.settings.startLat = null;
    state.settings.startLabel = "";
    state.settings.startQuery = "";
    save();
    if (tourStops().length) organize();
  });
  document.querySelector("#gps-app")?.addEventListener("change", (event) => {
    state.settings.gps = event.target.value;
    save();
  });
  document.querySelector("#return-home")?.addEventListener("change", (event) => {
    state.settings.returnHome = event.target.checked;
    save();
    render();
  });
  document.querySelector("#choose")?.addEventListener("click", () => {
    pickIds = new Set(tourStops().map((stop) => stop.patientId));
    pickCabinet = "all";
    view = "pick";
    render();
  });
  document.querySelector("#print-tour")?.addEventListener("click", () => window.print());
  document.querySelector("#copy-tomorrow")?.addEventListener("click", copyTodayToTomorrow);
  document.querySelector("#back-tour")?.addEventListener("click", () => {
    view = "tour";
    render();
  });
  document.querySelector("#to-pass")?.addEventListener("click", startPass);
  document.querySelector("#organize")?.addEventListener("click", () => organize());
  document.querySelector("#go-next")?.addEventListener("click", goToCurrent);
  document.querySelector("#done-next")?.addEventListener("click", () => finishNext("done"));
  document.querySelector("#absent-next")?.addEventListener("click", () => finishNext("absent"));
  document.querySelector("#add-patient")?.addEventListener("click", () => openEditor(null));
  document.querySelector("#sync-create")?.addEventListener("click", () => useSyncCode(createCode()));
  document.querySelector("#sync-join")?.addEventListener("click", () => {
    const code = normalizeCode(document.querySelector("#sync-paste")?.value);
    if (code.length !== 16) {
      flash("Le code doit faire 16 caractères");
      return;
    }
    useSyncCode(code);
  });
  document.querySelector("#sync-copy")?.addEventListener("click", async () => {
    const code = formatCode(localStorage.getItem(SYNC_CODE) || "");
    try {
      await navigator.clipboard.writeText(code.replace(/ /g, ""));
      flash("Code copié");
    } catch {
      flash(code);
    }
  });
  document.querySelector("#sync-stop")?.addEventListener("click", () => {
    syncLink?.close();
    syncLink = null;
    localStorage.removeItem(SYNC_CODE);
    syncNote = "Liaison arrêtée sur cet appareil.";
    render();
  });
  document.querySelector("#export-data")?.addEventListener("click", exportData);
  document.querySelector("#import-data")?.addEventListener("change", importData);
  bindSearch("#patient-search", renderPatients);
  bindSearch("#pick-search", renderPick);
  bindCabinets();
  document.querySelector("#add-from-pick")?.addEventListener("click", () => {
    if (pickCabinet !== "all") state.settings.cabinetId = pickCabinet;
    openEditor(null);
  });
  els.app.querySelectorAll("[data-pick]").forEach((input) => input.addEventListener("change", () => {
    if (input.checked) pickIds.add(input.dataset.pick);
    else pickIds.delete(input.dataset.pick);
    const count = pickIds.size;
    const line = document.querySelector("#pick-count");
    if (line) line.innerHTML = count ? `<strong>${count}</strong> patient${count > 1 ? "s" : ""} sélectionné${count > 1 ? "s" : ""}` : "<strong>Aucun</strong> patient sélectionné";
  }));
  els.app.querySelectorAll("[data-pick-min]").forEach((button) => button.addEventListener("click", () => changePickMinutes(button.dataset.id, Number(button.dataset.pickMin))));
  els.app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditor(button.dataset.edit)));
  els.app.querySelectorAll("[data-step]").forEach((button) => button.addEventListener("click", () => changeMinutes(button.dataset.id, Number(button.dataset.step))));
  els.app.querySelectorAll("[data-hold]").forEach((input) => input.addEventListener("change", () => {
    const stop = currentTour()?.stops?.find((item) => item.id === input.dataset.hold);
    if (!stop) return;
    stop.hold = input.checked;
    if (!input.checked && currentTour()?.matrix) replanFromMatrix();
    else save();
    render();
  }));
  els.app.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => moveStop(button.dataset.id, Number(button.dataset.move))));
  els.app.querySelectorAll("[data-gps]").forEach((button) => button.addEventListener("click", () => openGps(patientById(button.dataset.gps))));
  els.app.querySelectorAll("[data-done]").forEach((button) => button.addEventListener("click", () => {
    markStatus(button.dataset.done, "done");
    render();
  }));
  els.app.querySelectorAll("[data-clear]").forEach((button) => button.addEventListener("click", () => {
    markStatus(button.dataset.clear, "");
    render();
  }));
  document.querySelector("#count-minus")?.addEventListener("click", () => setPassCount(-1));
  document.querySelector("#count-plus")?.addEventListener("click", () => setPassCount(1));
  document.querySelectorAll("[data-minutes]").forEach((button) => button.addEventListener("click", () => {
    currentPasses()[Number(button.dataset.pass)].minutes = Number(button.dataset.minutes);
    render();
  }));
  document.querySelectorAll("[data-pass-step]").forEach((button) => button.addEventListener("click", () => {
    const pass = currentPasses()[Number(button.dataset.pass)];
    pass.minutes = Math.min(180, Math.max(5, Number(pass.minutes) + Number(button.dataset.passStep)));
    render();
  }));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    currentPasses()[Number(button.dataset.pass)].mode = button.dataset.mode;
    render();
  }));
  document.querySelectorAll(".clock[data-time]").forEach((clock) => {
    clock.querySelectorAll("select").forEach((select) => select.addEventListener("change", () => {
      currentPasses()[Number(clock.dataset.pass)][clock.dataset.time] = clockValue(clock);
    }));
  });
  document.querySelector("#day-from")?.addEventListener("input", onStartAddress);
  document.querySelector("#pass-back")?.addEventListener("click", () => {
    if (draft.phase === "start") {
      draft.phase = "patient";
      draft.index = draft.ids.length - 1;
    } else if (draft.index > 0) draft.index -= 1;
    render();
  });
  document.querySelector("#pass-cancel")?.addEventListener("click", () => {
    draft = null;
    view = "tour";
    render();
  });
  document.querySelectorAll("[data-when]").forEach((button) => button.addEventListener("click", () => editSchedule(button.dataset.when)));
  document.querySelector("#pass-next")?.addEventListener("click", () => {
    const error = sheetError(draft.sheets[draft.ids[draft.index]]);
    if (error) {
      flash(error);
      return;
    }
    if (draft.single) {
      saveOneSchedule();
      return;
    }
    if (draft.index < draft.ids.length - 1) {
      draft.index += 1;
      render();
      return;
    }
    draft.phase = "start";
    draft.from = draft.from || state.settings.startAddress;
    if (!draft.ids.includes(draft.firstId)) draft.firstId = draft.ids.length === 1 ? draft.ids[0] : "";
    render();
  });
  document.querySelectorAll("[data-first]").forEach((button) => button.addEventListener("click", () => {
    draft.firstId = button.dataset.first;
    render();
  }));
  document.querySelector("#first-patient")?.addEventListener("change", (event) => {
    const tour = currentTour();
    if (!tour) return;
    tour.firstPatientId = event.target.value;
    if (tour.matrix && tour.firstPatientId) replanFromMatrix();
    else save();
    render();
  });
  document.querySelector("#confirm-start")?.addEventListener("click", confirmStart);
}

function currentPasses() {
  return draft.sheets[draft.ids[draft.index]].passes;
}

function setPassCount(delta) {
  const patient = patientById(draft.ids[draft.index]);
  const sheet = draft.sheets[patient.id];
  const next = Math.min(3, Math.max(1, sheet.count + delta));
  while (sheet.passes.length < next) {
    const habit = patient.habits?.[sheet.passes.length];
    sheet.passes.push(cleanPass(habit || { minutes: patient.minutes || 20 }));
  }
  sheet.count = next;
  render();
}

function sheetError(sheet) {
  for (const pass of sheet.passes.slice(0, sheet.count)) {
    if (!pass.mode) return "Choisis le type d'heure pour chaque passage";
    if ((pass.mode === "fixe" || pass.mode === "partir") && !pass.at) return "Indique l'heure";
    if (pass.mode === "entre" && (!pass.from || !pass.to || pass.from >= pass.to)) return "L'heure de début doit être avant l'heure de fin";
  }
  return "";
}

function sheetFrom(patient) {
  const today = (currentTour()?.stops || []).filter((stop) => stop.patientId === patient.id);
  const source = today.length ? today : patient.habits || [];
  const passes = (source.length ? source : [{ minutes: patient.minutes || 20 }]).map((item) => cleanPass(item));
  return { count: Math.min(3, passes.length), passes };
}

function bindCabinets() {
  document.querySelector("#show-cabinet")?.addEventListener("click", () => {
    const form = document.querySelector("#cabinet-form");
    form.hidden = false;
    document.querySelector("#cabinet-name").focus();
  });
  document.querySelector("#cabinet-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#cabinet-name").value.trim();
    if (!name) return;
    const cabinet = { id: uid(), name };
    state.cabinets.push(cabinet);
    state.settings.cabinetId = cabinet.id;
    if (view === "pick") pickCabinet = cabinet.id;
    save();
    render();
    flash(`${name} est prêt. Ajoute ses patients.`);
  });
  document.querySelectorAll("[data-cabinet]").forEach((button) => button.addEventListener("click", () => {
    if (view === "pick") pickCabinet = button.dataset.cabinet;
    else {
      state.settings.cabinetId = button.dataset.cabinet;
      save();
    }
    render();
  }));
}

function changePickMinutes(id, delta) {
  const patient = patientById(id);
  if (!patient) return;
  const minutes = Math.min(180, Math.max(5, careMinutes(patient) + delta));
  patient.minutes = minutes;
  if (patient.habits?.[0]) patient.habits[0].minutes = minutes;
  const first = currentTour()?.stops?.find((stop) => stop.patientId === id);
  if (first) first.minutes = minutes;
  save();
  const label = document.querySelector(`[data-pick="${CSS.escape(id)}"]`)?.closest(".pick")?.querySelector(".pick-time strong");
  if (label) label.textContent = `${minutes} min`;
}

function editSchedule(patientId) {
  const patient = patientById(patientId);
  if (!patient) return;
  draft = {
    phase: "patient",
    single: true,
    ids: [patientId],
    index: 0,
    from: state.settings.startAddress,
    geoLabel: state.settings.startLabel || "",
    sheets: { [patientId]: sheetFrom(patient) },
  };
  view = "pass";
  render();
}

function applySheetToTour(patientId, used) {
  const patient = patientById(patientId);
  const passes = used.map((item) => cleanPass(item));
  patient.habits = passes;
  patient.minutes = passes[0].minutes;
  const tour = currentTour();
  if (!tour) return;
  const old = (tour.stops || []).filter((stop) => stop.patientId === patientId).sort((a, b) => a.pass - b.pass);
  const kept = passes.map((pass, index) => ({
    id: old[index]?.id || uid(),
    patientId,
    pass: index + 1,
    ...pass,
    hold: Boolean(old[index]?.hold),
    hand: old[index]?.hand,
  }));
  const removed = old.slice(passes.length).map((stop) => stop.id);
  const day = todayKey();
  if (state.done[day]) {
    for (const id of removed) delete state.done[day][id];
  }
  if (removed.includes(tour.goingTo)) tour.goingTo = kept[0]?.id || "";
  const oldIds = new Set(old.map((stop) => stop.id));
  const order = [];
  let inserted = false;
  for (const id of tour.order || []) {
    if (!oldIds.has(id)) {
      order.push(id);
      continue;
    }
    if (!inserted) {
      order.push(...kept.map((stop) => stop.id));
      inserted = true;
    }
  }
  if (!inserted) order.push(...kept.map((stop) => stop.id));
  tour.stops = [...(tour.stops || []).filter((stop) => stop.patientId !== patientId), ...kept];
  tour.order = order;
  const sameStops = old.length === kept.length && old.every((stop, index) => stop.id === kept[index].id);
  if (!sameStops) {
    tour.matrix = null;
    tour.ids = [];
  }
}

async function saveOneSchedule() {
  const id = draft.ids[0];
  const error = sheetError(draft.sheets[id]);
  if (error) {
    flash(error);
    return;
  }
  applySheetToTour(id, draft.sheets[id].passes.slice(0, draft.sheets[id].count));
  draft = null;
  view = "tour";
  save();
  if (state.settings.startAddress.trim() && tourStops().length) await organize();
  else {
    render();
    flash("Horaire enregistré");
  }
}

function startPass() {
  const ids = [...pickIds].sort((a, b) => compareNames(patientById(a)?.name, patientById(b)?.name));
  if (!ids.length) {
    flash("Coche au moins un patient");
    return;
  }
  draft = {
    phase: "patient",
    ids,
    index: 0,
    from: state.settings.startAddress,
    geoLabel: state.settings.startLabel || "",
    sheets: Object.fromEntries(ids.map((id) => [id, sheetFrom(patientById(id))])),
  };
  view = "pass";
  render();
}

let startSuggestSeq = 0;
async function onStartAddress(event) {
  draft.from = event.target.value;
  draft.geo = null;
  draft.geoLabel = "";
  const query = event.target.value.trim();
  const seq = ++startSuggestSeq;
  const list = document.querySelector("#start-suggest");
  const note = document.querySelector("#start-geo");
  if (note) note.hidden = true;
  if (query.length < 3) {
    if (list) list.hidden = true;
    return;
  }
  try {
    const rows = await suggest(query);
    if (seq !== startSuggestSeq || !list) return;
    list.innerHTML = rows.map((row, index) => `<li><button type="button" data-start-suggest="${index}">${esc(row.label)}</button></li>`).join("");
    list.hidden = !rows.length;
    list.querySelectorAll("[data-start-suggest]").forEach((button) => button.addEventListener("click", () => {
      const row = rows[Number(button.dataset.startSuggest)];
      document.querySelector("#day-from").value = row.label;
      draft.from = row.label;
      draft.geo = row;
      draft.geoLabel = `Repéré : ${row.label}`;
      list.hidden = true;
      if (note) {
        note.hidden = false;
        note.textContent = draft.geoLabel;
      }
    }));
  } catch {
    if (list) list.hidden = true;
  }
}

async function confirmStart() {
  const address = (draft.from || "").trim();
  if (!address) {
    flash("Indique d'où tu pars");
    document.querySelector("#day-from")?.focus();
    return;
  }
  if (!draft.firstId) {
    flash("Choisis ton premier patient");
    return;
  }
  if (address !== state.settings.startAddress) {
    state.settings.startLat = null;
    state.settings.startLabel = "";
    state.settings.startQuery = "";
  }
  state.settings.startAddress = address;
  if (draft.geo) {
    state.settings.startLat = draft.geo.lat;
    state.settings.startLon = draft.geo.lon;
    state.settings.startLabel = draft.geo.label;
    state.settings.startQuery = address;
  }
  const stops = [];
  for (const id of draft.ids) {
    const patient = patientById(id);
    const used = draft.sheets[id].passes.slice(0, draft.sheets[id].count).map((item) => cleanPass(item));
    patient.habits = used;
    patient.minutes = used[0].minutes;
    used.forEach((pass, index) => {
      stops.push({ id: uid(), patientId: id, pass: index + 1, ...pass });
    });
  }
  state.tours[todayKey()] = { stops, order: stops.map((stop) => stop.id), ids: [], matrix: null, source: "", manual: false, firstPatientId: draft.firstId };
  draft = null;
  view = "tour";
  save();
  await organize();
}

function changeMinutes(id, delta) {
  const stop = currentTour()?.stops?.find((item) => item.id === id);
  if (!stop) return;
  stop.minutes = Math.min(180, Math.max(5, Number(stop.minutes) + delta));
  save();
  replanFromMatrix();
  render();
}

function moveStop(id, dir) {
  const tour = currentTour();
  if (!tour) return;
  const order = tourStops().map((stop) => stop.id);
  const from = order.indexOf(id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= order.length) return;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  tour.order = order;
  const stop = tour.stops.find((entry) => entry.id === id);
  if (stop) stop.hand = true;
  tour.manual = true;
  if (!stop?.hold) reoptimizeAfter(id);
  const lead = tour.stops.find((entry) => entry.id === tour.order[0]);
  if (lead) tour.firstPatientId = lead.patientId;
  refreshLeave();
  save();
  render();
}

function reoptimizeAfter(movedId) {
  const tour = currentTour();
  if (!tour?.matrix) return;
  const located = (tour.ids || []).slice(1);
  const byId = new Map((tour.stops || []).map((stop) => [stop.id, stop]));
  const indexOf = new Map(located.map((id, index) => [id, index]));
  const known = tour.order.filter((id) => indexOf.has(id));
  const unknown = tour.order.filter((id) => !indexOf.has(id));
  const head = known.indexOf(movedId);
  if (head < 0) return;
  const prefix = known.slice(0, head + 1);
  const suffix = known.slice(head + 1);
  const pinned = [];
  const free = [];
  for (const id of suffix) {
    const stop = byId.get(id);
    if (stop?.hold) pinned.push(id);
    else {
      if (stop) stop.hand = false;
      free.push(id);
    }
  }
  const serviceMin = located.map((id) => Number(byId.get(id)?.minutes) || 20);
  const windowStart = located.map((id) => slotFor(byId.get(id) || {}).open);
  const windowEnd = located.map((id) => slotFor(byId.get(id) || {}).close);
  const next = placeAfter({
    travelMin: tour.matrix,
    serviceMin,
    windowStart,
    windowEnd,
    departMin: departMin(),
    order: [...prefix, ...pinned].map((id) => indexOf.get(id)),
    free: free.map((id) => indexOf.get(id)),
    minPos: prefix.length,
  });
  tour.order = [...next.map((index) => located[index]), ...unknown];
}

function goToCurrent() {
  const next = pending()[0];
  const tour = currentTour();
  if (!next || !tour) return;
  tour.goingTo = next.stop.id;
  save();
  render();
  openGps(next.patient);
}

function finishNext(status) {
  const list = pending();
  const current = list[0];
  if (!current) return;
  const following = list[1];
  const tour = currentTour();
  if (tour) tour.goingTo = following ? following.stop.id : "";
  markStatus(current.stop.id, status);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (following) openGps(following.patient);
  else if (status === "done" && state.settings.returnHome && state.settings.startAddress) {
    openGps({ lat: state.settings.startLat, lon: state.settings.startLon, address: state.settings.startLabel || state.settings.startAddress });
  } else flash("Tournée terminée");
}

function replanFromMatrix() {
  const tour = currentTour();
  if (!tour?.matrix) return;
  const located = tour.ids.slice(1).map((id) => tour.stops.find((stop) => stop.id === id)).filter(Boolean);
  if (located.length !== tour.ids.length - 1) return;
  applyPlan(located, tour.matrix, tour.source);
  save();
}

function refreshLeave() {
  const tour = currentTour();
  if (!tour?.matrix || !tour.order?.length) return;
  const located = (tour.ids || []).slice(1);
  const byId = new Map((tour.stops || []).map((stop) => [stop.id, stop]));
  const indexOf = new Map(located.map((id, index) => [id, index]));
  const order = tour.order.map((id) => indexOf.get(id)).filter((index) => index != null);
  const serviceMin = located.map((id) => Number(byId.get(id)?.minutes) || 20);
  const windowStart = located.map((id) => slotFor(byId.get(id) || {}).open);
  const leave = departFromFirst(tour.matrix, order, serviceMin, windowStart);
  state.settings.depart = fromMin(leave.depart);
  tour.leaveProposed = leave.proposed;
}

function departFromFirst(matrix, order, serviceMin, windowStart) {
  if (!order.length) return { depart: 8 * 60, proposed: true };
  const travel = matrix[0]?.[order[0] + 1] ?? 0;
  const open = windowStart[order[0]];
  if (open == null) return { depart: Math.max(0, 8 * 60 - travel), proposed: true };
  return { depart: Math.max(0, open - travel), proposed: false };
}

function chosenFirstIndex(located) {
  const wanted = currentTour()?.firstPatientId;
  if (!wanted) return -1;
  const candidates = located
    .map((stop, index) => ({ stop, index }))
    .filter((item) => item.stop.patientId === wanted);
  candidates.sort((a, b) => a.stop.pass - b.stop.pass);
  return candidates[0]?.index ?? -1;
}

function applyPlan(located, matrix, source) {
  const tour = currentTour();
  const serviceMin = located.map((stop) => Number(stop.minutes) || 20);
  const windowStart = located.map((stop) => slotFor(stop).open);
  const windowEnd = located.map((stop) => slotFor(stop).close);
  const locked = new Set(located.map((stop, index) => (stop.hold || statusOf(stop.id) ? index : -1)).filter((index) => index >= 0));
  const indexOf = new Map(located.map((stop, index) => [stop.id, index]));
  const current = [];
  for (const id of tour.order || []) if (indexOf.has(id)) current.push(indexOf.get(id));
  for (let index = 0; index < located.length; index += 1) if (!current.includes(index)) current.push(index);
  const firstIndex = chosenFirstIndex(located);
  if (firstIndex >= 0) {
    locked.add(firstIndex);
    const place = current.indexOf(firstIndex);
    if (place > 0) {
      current.splice(place, 1);
      current.unshift(firstIndex);
    }
  }
  const anchor = firstIndex >= 0 ? firstIndex : current[0];
  const departMin = anchor == null ? 8 * 60 : departFromFirst(matrix, [anchor], serviceMin, windowStart).depart;
  const order = locked.size
    ? optimizeFree({ travelMin: matrix, serviceMin, windowStart, windowEnd, departMin, order: current, locked })
    : planRoute({ travelMin: matrix, serviceMin, windowStart, windowEnd, departMin }).order;
  for (const stop of located) if (!stop.hold || stop.hand !== true) stop.hand = false;
  const leave = departFromFirst(matrix, order, serviceMin, windowStart);
  state.settings.depart = fromMin(leave.depart);
  tour.leaveProposed = leave.proposed;
  const missing = tourStops().filter((stop) => !located.some((item) => item.id === stop.id));
  tour.ids = ["__depot__", ...located.map((stop) => stop.id)];
  tour.matrix = matrix;
  tour.order = [...order.map((index) => located[index].id), ...missing.map((stop) => stop.id)];
  tour.source = source;
  tour.manual = located.some((stop) => stop.hold || stop.hand);
  let time = leave.depart;
  let prev = 0;
  let lateCount = 0;
  for (const stop of order) {
    const arrive = time + (matrix[prev]?.[stop + 1] ?? 0);
    const start = windowStart[stop] == null ? arrive : Math.max(arrive, windowStart[stop]);
    if (windowEnd[stop] != null && start > windowEnd[stop]) lateCount += 1;
    time = start + serviceMin[stop];
    prev = stop + 1;
  }
  return { order, lateCount };
}

async function organize() {
  if (busy) return;
  const stops = tourStops();
  if (!stops.length) return;
  if (!state.settings.startAddress.trim()) {
    flash("Indique d'où tu pars");
    return;
  }
  busy = true;
  render();
  try {
    const start = await ensureStartGeo();
    if (!start) {
      flash("Adresse de départ introuvable");
      return;
    }
    const located = [];
    const missing = [];
    for (const stop of stops) {
      const patient = patientById(stop.patientId);
      const geo = patient ? await ensurePatientGeo(patient) : null;
      if (geo) located.push(stop);
      else missing.push(stop);
    }
    save();
    if (!located.length) {
      flash("Aucune adresse trouvée");
      return;
    }
    const points = [{ lat: start.lat, lon: start.lon }, ...located.map((stop) => {
      const patient = patientById(stop.patientId);
      return { lat: patient.lat, lon: patient.lon };
    })];
    const { matrix, source } = await travelMatrix(points);
    const planned = applyPlan(located, matrix, source);
    const late = planned.lateCount;
    save();
    flash(missing.length
      ? `${missing.length} adresse non trouvée, placée à la fin`
      : late
        ? `${late} patient${late > 1 ? "s" : ""} un peu après l'heure demandée`
        : "Tournée ajustée");
  } catch {
    flash("Le calcul de la route a échoué");
  } finally {
    busy = false;
    render();
  }
}

function openEditor(id) {
  editingId = id;
  const patient = id ? patientById(id) : null;
  draftGeo = patient?.lat != null ? { lat: patient.lat, lon: patient.lon, label: patient.geoLabel, query: patient.address } : null;
  els.editorTitle.textContent = patient ? "Modifier le patient" : "Nouveau patient";
  els.deleteBtn.hidden = !patient;
  document.querySelector("#f-name").value = patient?.name || "";
  document.querySelector("#f-address").value = patient?.address || "";
  document.querySelector("#f-care").value = patient?.care || "";
  document.querySelector("#f-minutes").value = patient?.minutes || 20;
  document.querySelector("#f-phone").value = patient?.phone || "";
  document.querySelector("#f-note").value = patient?.note || "";
  document.querySelector("#f-paused").checked = Boolean(patient?.paused);
  const cabinetField = document.querySelector("#f-cabinet");
  cabinetField.innerHTML = state.cabinets.map((cabinet) => `<option value="${esc(cabinet.id)}">${esc(cabinet.name)}</option>`).join("");
  cabinetField.value = patient?.cabinetId || state.settings.cabinetId;
  document.querySelectorAll("#care-chips button").forEach((button) => button.classList.toggle("on", button.dataset.care === patient?.care));
  els.suggest.hidden = true;
  els.geoOk.hidden = !draftGeo?.label;
  els.geoOk.textContent = draftGeo?.label ? `Repéré : ${draftGeo.label}` : "";
  els.editor.showModal();
}

function readPatient() {
  const name = document.querySelector("#f-name").value.trim();
  const address = document.querySelector("#f-address").value.trim();
  const minutes = Number(document.querySelector("#f-minutes").value);
  if (!name || !address) return { error: "Le nom et l'adresse sont obligatoires" };
  if (!minutes || minutes < 5) return { error: "Le temps habituel est trop court" };
  const previous = editingId ? patientById(editingId) : null;
  const sameGeo = draftGeo && (draftGeo.query === address || draftGeo.label === address);
  return {
    patient: {
      id: previous?.id || uid(),
      name,
      address,
      lat: sameGeo ? draftGeo.lat : previous && previous.address === address ? previous.lat : null,
      lon: sameGeo ? draftGeo.lon : previous && previous.address === address ? previous.lon : null,
      geoLabel: sameGeo ? draftGeo.label : previous && previous.address === address ? previous.geoLabel : "",
      geoQuery: sameGeo ? address : previous && previous.address === address ? previous.geoQuery : "",
      care: document.querySelector("#f-care").value.trim(),
      minutes,
      habits: previous?.habits || [],
      phone: document.querySelector("#f-phone").value.trim(),
      note: document.querySelector("#f-note").value.trim(),
      paused: document.querySelector("#f-paused").checked,
      cabinetId: document.querySelector("#f-cabinet").value || state.settings.cabinetId,
    },
  };
}

function copyTodayToTomorrow() {
  const source = state.tours[dateKey(new Date())];
  if (!source?.stops?.length) {
    flash("Aucune tournée aujourd'hui à recopier");
    return;
  }
  const idMap = new Map();
  const stops = source.stops.map((stop) => {
    const id = uid();
    idMap.set(stop.id, id);
    return { ...stop, id };
  });
  const order = (source.order || []).map((id) => idMap.get(id)).filter(Boolean);
  for (const stop of stops) if (!order.includes(stop.id)) order.push(stop.id);
  let ids = [];
  let matrix = null;
  if (Array.isArray(source.ids) && source.matrix && source.ids.length === source.matrix.length) {
    const mapped = source.ids.map((id) => (id === "__depot__" ? id : idMap.get(id)));
    if (mapped.every(Boolean) && mapped.length === source.ids.length) {
      ids = mapped;
      matrix = source.matrix;
    }
  }
  const tomorrow = dateKey(addDays(new Date(), 1));
  state.tours[tomorrow] = {
    stops,
    order,
    ids,
    matrix,
    source: matrix ? source.source || "" : "",
    manual: Boolean(source.manual),
    firstPatientId: source.firstPatientId || "",
    leaveProposed: Boolean(source.leaveProposed),
  };
  delete state.done[tomorrow];
  dayOffset = 1;
  view = "tour";
  draft = null;
  save();
  render();
  flash("C'est copié sur demain");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tournee-sauvegarde.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    if (!Array.isArray(incoming.patients)) throw new Error("fichier");
    const next = normalize(incoming);
    state.settings = next.settings;
    state.patients = next.patients;
    state.tours = next.tours;
    state.done = next.done;
    state.cabinets = next.cabinets;
    state.settings.cabinetId = next.settings.cabinetId;
    save();
    render();
    flash("Sauvegarde restaurée");
  } catch {
    flash("Ce fichier n'est pas une sauvegarde de tournée");
  }
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  view = button.dataset.view;
  draft = null;
  render();
}));
document.querySelector("#day-today").addEventListener("click", () => {
  dayOffset = 0;
  draft = null;
  view = view === "pass" ? "tour" : view;
  render();
});
document.querySelector("#day-tomorrow").addEventListener("click", () => {
  dayOffset = 1;
  draft = null;
  view = view === "pass" ? "tour" : view;
  render();
});
document.querySelector("#editor-close").addEventListener("click", () => els.editor.close());
document.querySelectorAll("#care-chips button").forEach((button) => button.addEventListener("click", () => {
  document.querySelector("#f-care").value = button.dataset.care;
  document.querySelector("#f-minutes").value = button.dataset.minutes;
  document.querySelectorAll("#care-chips button").forEach((chip) => chip.classList.toggle("on", chip === button));
}));
document.querySelector("#f-address").addEventListener("input", async (event) => {
  const query = event.target.value.trim();
  draftGeo = null;
  els.geoOk.hidden = true;
  const seq = ++suggestSeq;
  if (query.length < 3) {
    els.suggest.hidden = true;
    return;
  }
  try {
    const rows = await suggest(query);
    if (seq !== suggestSeq) return;
    els.suggest.innerHTML = rows.map((row, index) => `<li><button type="button" data-suggest="${index}">${esc(row.label)}</button></li>`).join("");
    els.suggest.hidden = !rows.length;
    els.suggest.querySelectorAll("[data-suggest]").forEach((button) => button.addEventListener("click", () => {
      const row = rows[Number(button.dataset.suggest)];
      document.querySelector("#f-address").value = row.label;
      draftGeo = { ...row, query: row.label };
      els.suggest.hidden = true;
      els.geoOk.hidden = false;
      els.geoOk.textContent = `Repéré : ${row.label}`;
    }));
  } catch {
    els.suggest.hidden = true;
  }
});
document.querySelector("#f-care").addEventListener("input", (event) => {
  document.querySelectorAll("#care-chips button").forEach((chip) => chip.classList.toggle("on", chip.dataset.care === event.target.value));
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = readPatient();
  if (result.error) {
    flash(result.error);
    return;
  }
  if (editingId) {
    const index = state.patients.findIndex((patient) => patient.id === editingId);
    state.patients[index] = result.patient;
  } else {
    state.patients.push(result.patient);
    if (view === "pick") pickIds.add(result.patient.id);
  }
  save();
  els.editor.close();
  render();
  flash("Patient enregistré dans la base");
});

els.deleteBtn.addEventListener("click", () => {
  const patient = patientById(editingId);
  if (!patient || !confirm(`Supprimer ${patient.name} de la base ?`)) return;
  state.patients = state.patients.filter((item) => item.id !== editingId);
  save();
  els.editor.close();
  render();
});

const recovered = state.recovered;
delete state.recovered;
if (recovered) save();
render();
connectSync();
