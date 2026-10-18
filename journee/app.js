import { planRoute, travelMinutesFallback } from "../tournee/route.js";
import { ACTS, BAREME, actById, actMinutes, quote } from "./ngap.js";

const KEY = "journee-idel-v1";
const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const WEEK = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Jeu"], [5, "Ven"], [6, "Sam"], [0, "Dim"]];
const SLOTS = [
  ["6-8", "6h–8h", 6],
  ["8-10", "8h–10h", 8],
  ["10-12", "10h–12h", 10],
  ["12-14", "12h–14h", 12],
  ["14-16", "14h–16h", 14],
  ["16-18", "16h–18h", 16],
  ["18-20", "18h–20h", 18],
  ["20-22", "20h–22h", 20],
  ["22-24", "22h–minuit", 22],
  ["quand", "N'importe quand", null],
];
const VITALS = [
  ["tension", "Tension", "12/8"],
  ["pouls", "Pouls", "72"],
  ["glycemie", "Glycémie", "1,10"],
  ["sat", "Saturation", "98"],
  ["douleur", "Douleur", "0-10"],
  ["temp", "Température", "37"],
  ["fr", "Respiration", "16"],
  ["poids", "Poids", "kg"],
];

const els = {
  app: document.querySelector("#app"),
  title: document.querySelector("#title"),
  when: document.querySelector("#when"),
  toast: document.querySelector("#toast"),
  sheet: document.querySelector("#sheet"),
  lock: document.querySelector("#lock"),
  print: document.querySelector("#print-sheet"),
};

const state = load();
let view = "jour";
let cursor = dateKey(new Date());
let unlocked = !state.settings.pin;
let busy = false;
let vitalDraft = { key: "", values: {} };
let suggestSeq = 0;
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function blank() {
  return {
    settings: { pin: "", nurse: "", rpps: "", gps: "google", zone: "plaine", signature: "", cabinetId: "" },
    cabinets: [],
    patients: [],
    days: {},
    notes: {},
    orders: {},
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.cabinets) return normalize(saved);
  } catch { /* base neuve */ }
  const next = blank();
  next.cabinets.push(freshCabinet());
  next.settings.cabinetId = next.cabinets[0].id;
  return next;
}

function freshCabinet() {
  return { id: uid(), name: "Cabinet", titulaire: "", rate: 0, address: "", lat: null, lon: null, label: "" };
}

function normalize(saved) {
  const next = blank();
  next.settings = { ...next.settings, ...(saved.settings || {}) };
  next.cabinets = (saved.cabinets || []).map((item) => ({ ...freshCabinet(), ...item, id: item.id || uid() }));
  if (!next.cabinets.length) next.cabinets.push(freshCabinet());
  if (!next.cabinets.some((item) => item.id === next.settings.cabinetId)) next.settings.cabinetId = next.cabinets[0].id;
  next.patients = (saved.patients || []).map(patientRecord);
  next.days = saved.days || {};
  next.notes = saved.notes || {};
  next.orders = saved.orders || {};
  return next;
}

function patientRecord(raw) {
  const passages = Array.isArray(raw.passages) && raw.passages.length ? raw.passages : [{ slot: "8-10", acts: [], mau: true, mie: false, mci: false }];
  return {
    id: raw.id || uid(),
    cabinetId: raw.cabinetId || "",
    name: raw.name || "",
    address: raw.address || "",
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
    geoLabel: raw.geoLabel || "",
    phone: raw.phone || "",
    note: raw.note || "",
    paused: Boolean(raw.paused),
    domicile: raw.domicile !== false,
    horsAgglo: Boolean(raw.horsAgglo),
    km: Number(raw.km) || 0,
    days: Array.isArray(raw.days) ? raw.days.map(Number).filter((day) => day >= 0 && day <= 6) : [],
    passages: passages.slice(0, 3).map((item) => ({
      slot: SLOTS.some((slot) => slot[0] === item.slot) ? item.slot : "8-10",
      acts: (item.acts || []).filter((id) => actById(id)),
      mau: item.mau !== false,
      mie: Boolean(item.mie),
      mci: Boolean(item.mci),
    })),
  };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(iso) {
  return new Date(`${iso}T12:00:00`);
}

function formatHM(minutes) {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function flash(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { els.toast.hidden = true; }, 2800);
}

function cabinet() {
  return state.cabinets.find((item) => item.id === state.settings.cabinetId) || state.cabinets[0];
}

function patientById(id) {
  return state.patients.find((item) => item.id === id) || null;
}

function dayRecord(iso = cursor) {
  if (!state.days[iso]) state.days[iso] = {};
  const id = cabinet().id;
  if (!state.days[iso][id]) state.days[iso][id] = { order: [], status: {}, goingTo: "", eta: {}, leave: null };
  return state.days[iso][id];
}

function slotOf(id) {
  return SLOTS.find((slot) => slot[0] === id) || SLOTS[1];
}

function passageStops(iso = cursor) {
  const weekday = parseDate(iso).getDay();
  const cab = cabinet();
  const list = [];
  for (const patient of state.patients) {
    if (patient.paused || patient.cabinetId !== cab.id) continue;
    if (!(patient.days || []).includes(weekday)) continue;
    patient.passages.forEach((passage, index) => {
      const slot = slotOf(passage.slot);
      list.push({
        key: `${patient.id}:${index}`,
        patient,
        passage,
        index,
        hour: slot[2],
        label: slot[1],
        open: slot[2] == null ? null : slot[2] * 60,
        close: slot[2] == null ? null : slot[2] * 60 + 119,
      });
    });
  }
  return list;
}

function orderedStops(iso = cursor) {
  const stops = passageStops(iso);
  const byKey = new Map(stops.map((stop) => [stop.key, stop]));
  const record = dayRecord(iso);
  const order = [];
  for (const key of record.order || []) if (byKey.has(key)) order.push(byKey.get(key));
  const rest = [...stops].sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99) || a.patient.name.localeCompare(b.patient.name, "fr"));
  for (const stop of rest) if (!order.some((item) => item.key === stop.key)) order.push(stop);
  return order;
}

function statusOf(key, iso = cursor) {
  return dayRecord(iso).status?.[key] || "";
}

function placeKey(stop) {
  return `${(stop.patient.address || "").trim().toLowerCase()}|${stop.passage.slot}`;
}

function prices(stops, iso) {
  const sunday = parseDate(iso).getDay() === 0;
  const seen = new Set();
  const map = new Map();
  for (const stop of stops) {
    if (statusOf(stop.key, iso) === "absent") {
      map.set(stop.key, { lines: [], total: 0 });
      continue;
    }
    const key = placeKey(stop);
    const first = !seen.has(key);
    if (first) seen.add(key);
    map.set(stop.key, quote(stop.passage.acts, {
      domicile: stop.patient.domicile !== false,
      ifd: first,
      km: stop.patient.km,
      horsAgglo: stop.patient.horsAgglo,
      zone: state.settings.zone,
      sunday,
      hour: stop.hour,
      mau: stop.passage.mau !== false,
      mie: stop.passage.mie,
      mci: stop.passage.mci,
    }));
  }
  return map;
}

function money(stops, iso) {
  const map = prices(stops, iso);
  const done = stops.filter((stop) => statusOf(stop.key, iso) === "done").reduce((sum, stop) => sum + (map.get(stop.key)?.total || 0), 0);
  const all = [...map.values()].reduce((sum, item) => sum + item.total, 0);
  const rate = Number(cabinet().rate) || 0;
  return { map, done, all, retro: Math.round(all * rate) / 100, rate };
}

function phoneHref(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function gpsUrl(patient) {
  if (state.settings.gps === "waze") {
    if (patient.lat != null) return `https://waze.com/ul?ll=${patient.lat},${patient.lon}&navigate=yes`;
    return `https://waze.com/ul?q=${encodeURIComponent(patient.address)}&navigate=yes`;
  }
  const destination = patient.lat != null ? `${patient.lat},${patient.lon}` : patient.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function openGps(patient) {
  const opened = window.open(gpsUrl(patient), "_blank", "noopener");
  if (!opened) flash("Le GPS n'a pas pu s'ouvrir. Réessaie avec le bouton GPS.");
}

function captureVitals() {
  const fields = document.querySelectorAll("[data-vital]");
  if (!fields.length) return;
  const values = {};
  let key = "";
  fields.forEach((field) => {
    values[field.dataset.vital] = field.value;
    key = field.dataset.key || key;
  });
  vitalDraft = { key, values };
}

function vitalBlock(key) {
  const values = vitalDraft.key === key ? vitalDraft.values : {};
  const tiles = VITALS.map(([name, label, placeholder]) => `
    <label>${label}<input data-vital="${name}" data-key="${esc(key)}" inputmode="decimal" placeholder="${placeholder}" value="${esc(values[name] || "")}"></label>`).join("");
  return `<details class="vitals"><summary>Constantes et transmission</summary><div class="grid">${tiles}</div>
    <label>Transmission<textarea data-vital="text" data-key="${esc(key)}" rows="2" placeholder="Pour la collègue">${esc(values.text || "")}</textarea></label></details>`;
}

function saveVitals(patientId, key) {
  const values = vitalDraft.key === key ? vitalDraft.values : {};
  const fields = {};
  for (const [name] of VITALS) {
    const value = String(values[name] || "").trim();
    if (value) fields[name] = value;
  }
  const text = String(values.text || "").trim();
  if (!text && !Object.keys(fields).length) return;
  const list = state.notes[patientId] || [];
  list.push({ id: uid(), at: Date.now(), date: cursor, key, text, ...fields });
  state.notes[patientId] = list.slice(-80);
  vitalDraft = { key: "", values: {} };
}

function vitalLine(note) {
  return VITALS.map(([name, label]) => (note[name] ? `${label} ${note[name]}` : "")).filter(Boolean).join(" · ");
}

function renderShell() {
  const date = parseDate(cursor);
  const names = { jour: "Journée", planning: "Planning", patients: "Patients", compte: "Compte" };
  els.title.textContent = names[view];
  els.when.textContent = cursor === dateKey(new Date()) ? `Aujourd'hui · ${dateLabel(cursor)}` : dateLabel(cursor);
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("on", button.dataset.view === view));
  document.title = `${DAYS[date.getDay()]} ${date.getDate()} · Journée`;
}

function dateLabel(iso) {
  return parseDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

function cabinetSelect() {
  if (state.cabinets.length < 2) return `<p class="meta">${esc(cabinet().name)}${cabinet().titulaire ? ` · ${esc(cabinet().titulaire)}` : ""}</p>`;
  return `<label>Cabinet<select id="cabinet-switch">${state.cabinets.map((item) => `<option value="${esc(item.id)}" ${item.id === cabinet().id ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label>`;
}

function renderJour() {
  const stops = orderedStops();
  const record = dayRecord();
  const bill = money(stops, cursor);
  const pending = stops.filter((stop) => !statusOf(stop.key));
  const next = pending[0];
  const doneCount = stops.filter((stop) => statusOf(stop.key) === "done").length;
  let current = "";
  if (next) {
    const price = bill.map.get(next.key);
    const eta = record.eta?.[next.key];
    current = `
      <article class="card">
        <p class="kicker">Prochain passage</p>
        <h2 class="name">${esc(next.patient.name)}</h2>
        <p>${esc(next.patient.geoLabel || next.patient.address)}</p>
        <p class="meta">${esc(next.label)} · ${esc(actsLabel(next.passage))}${eta ? ` · arrivée ${formatHM(eta.start)}` : ""}</p>
        <p class="money">${euro.format(price?.total || 0)}</p>
        ${next.patient.note ? `<p class="note">${esc(next.patient.note)}</p>` : ""}
        ${vitalBlock(next.key)}
        <div class="stack">
          ${next.patient.phone ? `<a class="ghost" href="tel:${esc(phoneHref(next.patient.phone))}">Appeler</a>` : ""}
          ${record.goingTo === next.key
            ? `<button type="button" class="primary" id="done-next">${pending.length === 1 ? "Soin fait, terminer" : "Soin fait, GPS suivant"}</button>`
            : `<button type="button" class="primary" id="go-next">Y aller</button>`}
          <button type="button" class="ghost" id="absent-next">Absent, passer au suivant</button>
        </div>
      </article>`;
  } else if (stops.length) {
    current = `<article class="card"><h2 class="name">Journée terminée</h2><p class="meta">${doneCount} passage${doneCount > 1 ? "s" : ""} fait${doneCount > 1 ? "s" : ""}.</p></article>`;
  }
  const rows = stops.map((stop, index) => {
    const status = statusOf(stop.key);
    const eta = record.eta?.[stop.key];
    const price = bill.map.get(stop.key);
    return `<li class="stop ${status}">
      <span class="num">${index + 1}</span>
      <div>
        <h3>${esc(stop.patient.name)}${stop.patient.passages.length > 1 ? ` · passage ${stop.index + 1}` : ""}</h3>
        <p class="meta">${esc(stop.label)} · ${esc(actsLabel(stop.passage))}${eta ? ` · ${formatHM(eta.start)}` : ""} · ${euro.format(price?.total || 0)}</p>
        <div class="row">
          <button type="button" data-move="-1" data-key="${esc(stop.key)}">Monter</button>
          <button type="button" data-move="1" data-key="${esc(stop.key)}">Descendre</button>
          <button type="button" data-gps="${esc(stop.patient.id)}">GPS</button>
          ${status ? `<button type="button" data-clear="${esc(stop.key)}">Remettre</button>` : `<button type="button" data-done="${esc(stop.key)}">Fait</button>`}
        </div>
      </div>
    </li>`;
  }).join("");
  const leave = record.leave != null ? `<p class="banner">Pars à ${formatHM(record.leave)}.</p>` : "";
  els.app.innerHTML = `
    ${cabinetSelect()}
    <div class="switch">
      <button type="button" id="go-today" class="${cursor === dateKey(new Date()) ? "on" : ""}">Aujourd'hui</button>
      <button type="button" id="go-tomorrow" class="${cursor === dateKey(addDays(new Date(), 1)) ? "on" : ""}">Demain</button>
    </div>
    ${leave}
    ${current}
    ${stops.length ? `<div class="stats"><div><strong>${euro.format(bill.done)}</strong><span>faits</span></div><div><strong>${euro.format(bill.all)}</strong><span>journée</span></div>${bill.rate ? `<div><strong>${euro.format(bill.all - bill.retro)}</strong><span>après ${bill.rate} %</span></div>` : ""}</div>` : ""}
    <div class="stack">
      ${stops.length ? `<button type="button" class="primary" id="organize" ${busy ? "disabled" : ""}>${busy ? "Organisation…" : "Organiser la tournée"}</button>` : ""}
      ${stops.length ? `<button type="button" class="ghost" id="print-releve">Relevé pour la collègue</button>` : ""}
      <button type="button" class="ghost" id="add-from-day">Ajouter un patient</button>
    </div>
    ${stops.length ? `<ol class="stops">${rows}</ol>` : `<div class="empty"><strong>Personne sur cette journée.</strong>Ajoute un patient, coche ses jours, et le créneau de 2 heures. Organiser classe la route.</div>`}
    <p class="hint">${esc(BAREME)}</p>`;
}

function actsLabel(passage) {
  const names = (passage.acts || []).map((id) => actById(id)?.label).filter(Boolean);
  return names.length ? names.join(", ") : "Soin à coter";
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function weekDates(iso) {
  const date = parseDate(iso);
  const monday = addDays(date, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => dateKey(addDays(monday, index)));
}

function renderPlanning() {
  const blocks = weekDates(cursor).map((iso) => {
    const people = state.patients
      .filter((patient) => !patient.paused && patient.cabinetId === cabinet().id && (patient.days || []).includes(parseDate(iso).getDay()))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const cards = people.length
      ? people.map((patient) => `<button type="button" data-edit="${esc(patient.id)}"><strong>${esc(patient.name)}</strong><small>${esc(patient.passages.map((item) => slotOf(item.slot)[1]).join(" · "))}</small></button>`).join("")
      : `<p class="hint">Personne.</p>`;
    return `<section class="day"><div class="day-head"><h2>${esc(dateLabel(iso))}</h2><button type="button" data-open-day="${iso}">Ouvrir</button></div>${cards}</section>`;
  }).join("");
  els.app.innerHTML = `${cabinetSelect()}<p class="hint">Les jours se cochent sur la fiche. Chaque passage a un créneau de 2 heures. Ouvrir affiche la tournée de ce jour.</p>${blocks}`;
}

function renderPatients() {
  const query = (renderPatients.query || "").trim().toLowerCase();
  const list = state.patients
    .filter((patient) => patient.cabinetId === cabinet().id)
    .filter((patient) => !query || `${patient.name} ${patient.address}`.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  els.app.innerHTML = `
    ${cabinetSelect()}
    <div class="tools"><label class="grow">Rechercher<input id="search" value="${esc(renderPatients.query || "")}" placeholder="Nom ou rue"></label><button type="button" class="add" id="add-patient">Ajouter</button></div>
    ${list.map((patient) => `<article class="card slim">
      <h3>${esc(patient.name)}${patient.paused ? " · en pause" : ""}</h3>
      <p class="meta">${esc(patient.address)}</p>
      <p class="meta">${esc((patient.days || []).map((day) => DAYS[day]).join(", ") || "Aucun jour")} · ${esc(patient.passages.map((item) => slotOf(item.slot)[1]).join(" · "))}</p>
      <div class="row"><button type="button" data-edit="${esc(patient.id)}">Modifier</button><button type="button" data-order="${esc(patient.id)}">Ordonnance</button></div>
    </article>`).join("") || `<div class="empty"><strong>Aucun patient dans ce cabinet.</strong>Un nom, une adresse, les jours et les soins suffisent.</div>`}`;
}

function renderCompte() {
  const stops = orderedStops();
  const bill = money(stops, cursor);
  const lines = stops.filter((stop) => statusOf(stop.key) !== "absent").map((stop) => {
    const price = bill.map.get(stop.key);
    const detail = (price?.lines || []).map((line) => `${line.code} ${euro.format(line.amount)}`).join(" · ");
    return `<article class="card slim"><h3>${esc(stop.patient.name)}</h3><p class="meta">${esc(stop.label)} · ${esc(detail || "Pas de cotation")}</p><p class="money">${euro.format(price?.total || 0)}</p></article>`;
  }).join("");
  const keep = bill.all - bill.retro;
  els.app.innerHTML = `
    ${cabinetSelect()}
    <p class="meta">${esc(dateLabel(cursor))}</p>
    <div class="stats"><div><strong>${euro.format(bill.all)}</strong><span>journée</span></div>${bill.rate ? `<div><strong>${euro.format(bill.retro)}</strong><span>rétrocession ${bill.rate} %</span></div><div><strong>${euro.format(keep)}</strong><span>pour toi</span></div>` : ""}</div>
    ${lines || `<div class="empty"><strong>Rien à coter ce jour.</strong>Les soins cochés sur les fiches remplissent le compte.</div>`}
    <div class="stack"><button type="button" class="primary" id="print-compte">Imprimer le compte</button></div>
    <p class="hint">${esc(BAREME)}</p>`;
}

function render() {
  if (!unlocked) return;
  captureVitals();
  renderShell();
  if (view === "planning") renderPlanning();
  else if (view === "patients") renderPatients();
  else if (view === "compte") renderCompte();
  else renderJour();
  bind();
}

function bind() {
  document.querySelector("#cabinet-switch")?.addEventListener("change", (event) => {
    state.settings.cabinetId = event.target.value;
    save();
    render();
  });
  document.querySelector("#go-today")?.addEventListener("click", () => { cursor = dateKey(new Date()); render(); });
  document.querySelector("#go-tomorrow")?.addEventListener("click", () => { cursor = dateKey(addDays(new Date(), 1)); render(); });
  document.querySelector("#organize")?.addEventListener("click", organize);
  document.querySelector("#go-next")?.addEventListener("click", goNext);
  document.querySelector("#done-next")?.addEventListener("click", () => finish("done"));
  document.querySelector("#absent-next")?.addEventListener("click", () => finish("absent"));
  document.querySelector("#add-from-day")?.addEventListener("click", () => openPatient(null));
  document.querySelector("#add-patient")?.addEventListener("click", () => openPatient(null));
  document.querySelector("#print-releve")?.addEventListener("click", printReleve);
  document.querySelector("#print-compte")?.addEventListener("click", printCompte);
  document.querySelector("#search")?.addEventListener("input", (event) => {
    renderPatients.query = event.target.value;
    const pos = event.target.selectionStart;
    render();
    const field = document.querySelector("#search");
    if (field) { field.focus(); field.setSelectionRange(pos, pos); }
  });
  els.app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openPatient(button.dataset.edit)));
  els.app.querySelectorAll("[data-order]").forEach((button) => button.addEventListener("click", () => openOrder(button.dataset.order)));
  els.app.querySelectorAll("[data-open-day]").forEach((button) => button.addEventListener("click", () => {
    cursor = button.dataset.openDay;
    view = "jour";
    render();
  }));
  els.app.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => moveStop(button.dataset.key, Number(button.dataset.move))));
  els.app.querySelectorAll("[data-gps]").forEach((button) => button.addEventListener("click", () => openGps(patientById(button.dataset.gps))));
  els.app.querySelectorAll("[data-done]").forEach((button) => button.addEventListener("click", () => mark(button.dataset.done, "done")));
  els.app.querySelectorAll("[data-clear]").forEach((button) => button.addEventListener("click", () => mark(button.dataset.clear, "")));
}

function moveStop(key, dir) {
  const record = dayRecord();
  const order = orderedStops().map((stop) => stop.key);
  const from = order.indexOf(key);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= order.length) return;
  const [item] = order.splice(from, 1);
  order.splice(to, 0, item);
  record.order = order;
  record.eta = {};
  record.leave = null;
  save();
  render();
}

function mark(key, status) {
  const record = dayRecord();
  if (status) record.status[key] = status;
  else delete record.status[key];
  save();
  render();
}

function goNext() {
  const next = orderedStops().find((stop) => !statusOf(stop.key));
  if (!next) return;
  dayRecord().goingTo = next.key;
  save();
  render();
  openGps(next.patient);
}

function finish(status) {
  const pending = orderedStops().filter((stop) => !statusOf(stop.key));
  const current = pending[0];
  if (!current) return;
  captureVitals();
  if (status === "done") saveVitals(current.patient.id, current.key);
  const record = dayRecord();
  record.status[current.key] = status;
  record.goingTo = pending[1]?.key || "";
  save();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (pending[1]) openGps(pending[1].patient);
  else flash("Journée terminée");
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

async function geocode(query) {
  const rows = await suggest(query);
  return rows[0] || null;
}

async function organize() {
  if (busy) return;
  const stops = orderedStops().filter((stop) => statusOf(stop.key) !== "done" && statusOf(stop.key) !== "absent");
  if (!stops.length) return;
  const cab = cabinet();
  if (!cab.address.trim()) {
    flash("Indique l'adresse du cabinet dans les réglages");
    openSettings();
    return;
  }
  busy = true;
  render();
  try {
    if (cab.lat == null || cab.label !== cab.address) {
      const geo = await geocode(cab.address);
      if (!geo) { flash("Adresse du cabinet introuvable"); return; }
      cab.lat = geo.lat;
      cab.lon = geo.lon;
      cab.label = cab.address;
    }
    for (const stop of stops) {
      if (stop.patient.lat != null && stop.patient.geoLabel) continue;
      const geo = await geocode(stop.patient.address);
      if (!geo) continue;
      stop.patient.lat = geo.lat;
      stop.patient.lon = geo.lon;
      stop.patient.geoLabel = geo.label;
    }
    const located = stops.filter((stop) => stop.patient.lat != null);
    if (!located.length) { flash("Aucune adresse trouvée"); return; }
    const points = [{ lat: cab.lat, lon: cab.lon }, ...located.map((stop) => ({ lat: stop.patient.lat, lon: stop.patient.lon }))];
    const matrix = await travelMatrix(points);
    const planned = planRoute({
      travelMin: matrix,
      serviceMin: located.map((stop) => actMinutes(stop.passage.acts)),
      windowStart: located.map((stop) => stop.open),
      windowEnd: located.map((stop) => stop.close),
      departMin: 6 * 60,
    });
    const plannedKeys = planned.order.map((index) => located[index].key);
    const locatedKeys = new Set(located.map((stop) => stop.key));
    const queue = [...plannedKeys];
    const next = [];
    for (const stop of orderedStops()) {
      next.push(locatedKeys.has(stop.key) ? queue.shift() : stop.key);
    }
    const record = dayRecord();
    record.order = next.filter(Boolean);
    record.eta = {};
    planned.steps.forEach((step) => {
      record.eta[located[step.stop].key] = { travel: step.travel, start: step.start };
    });
    const first = planned.steps[0];
    record.leave = first ? first.start - first.travel : null;
    save();
    flash("Tournée classée");
  } catch {
    flash("Le calcul de la route a échoué");
  } finally {
    busy = false;
    render();
  }
}

async function travelMatrix(points) {
  const path = points.map((point) => `${point.lon},${point.lat}`).join(";");
  try {
    const response = await fetch(`https://router.project-osrm.org/table/v1/driving/${path}?annotations=duration`);
    if (!response.ok) throw new Error("osrm");
    const data = await response.json();
    if (!data.durations) throw new Error("osrm");
    return data.durations.map((row, rowIndex) => row.map((seconds, colIndex) => {
      if (rowIndex === colIndex) return 0;
      if (seconds == null) return travelMinutesFallback(points[rowIndex], points[colIndex]);
      return Math.max(1, Math.round(seconds / 60));
    }));
  } catch {
    return points.map((from, rowIndex) => points.map((to, colIndex) => (rowIndex === colIndex ? 0 : travelMinutesFallback(from, to))));
  }
}

function openSheet(html, bindSheet) {
  els.sheet.innerHTML = html;
  bindSheet();
  if (!els.sheet.open) els.sheet.showModal();
}

function closeSheet() {
  els.sheet.close();
}

function passageHtml(passage, index) {
  return `<section class="pass" data-pass>
    <p class="label">Passage ${index + 1}</p>
    <label>Créneau de 2 h<select data-slot>${SLOTS.map((slot) => `<option value="${slot[0]}" ${passage.slot === slot[0] ? "selected" : ""}>${slot[1]}</option>`).join("")}</select></label>
    <div class="chips">${ACTS.map((act) => `<button type="button" data-act="${act.id}" class="${passage.acts.includes(act.id) ? "on" : ""}">${esc(act.label)}</button>`).join("")}</div>
    <label class="check"><input type="checkbox" data-flag="mau" ${passage.mau !== false ? "checked" : ""}> Acte unique (MAU)</label>
    <label class="check"><input type="checkbox" data-flag="mie" ${passage.mie ? "checked" : ""}> Enfant de moins de 7 ans</label>
    <label class="check"><input type="checkbox" data-flag="mci" ${passage.mci ? "checked" : ""}> Coordination infirmière</label>
    ${index ? `<button type="button" class="text" data-drop>Retirer ce passage</button>` : ""}
  </section>`;
}

function openPatient(id) {
  const patient = id ? patientById(id) : patientRecord({ cabinetId: cabinet().id, days: [parseDate(cursor).getDay()] });
  const history = (state.notes[patient.id] || []).slice().reverse().slice(0, 8).map((note) => {
    const when = new Date(note.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return `<p><strong>${esc(when)}</strong> ${esc(vitalLine(note))}${note.text ? ` — ${esc(note.text)}` : ""}</p>`;
  }).join("");
  openSheet(`
    <form id="patient-form">
      <div class="dialog-head"><h2>${id ? "Patient" : "Nouveau patient"}</h2><button type="button" class="text" data-close>Fermer</button></div>
      <label>Nom<input name="name" required value="${esc(patient.name)}" placeholder="Nom et prénom"></label>
      <label>Adresse<input name="address" required value="${esc(patient.address)}" placeholder="Numéro, rue, ville" autocomplete="off"></label>
      <ul class="suggest" hidden></ul>
      <label>Téléphone<input name="phone" value="${esc(patient.phone)}" inputmode="tel"></label>
      <label>Accès<input name="note" value="${esc(patient.note)}" placeholder="Digicode, étage"></label>
      <label>Cabinet<select name="cabinet">${state.cabinets.map((item) => `<option value="${esc(item.id)}" ${item.id === (patient.cabinetId || cabinet().id) ? "selected" : ""}>${esc(item.name)}</option>`).join("")}</select></label>
      <p class="label">Jours</p>
      <div class="days">${WEEK.map(([day, label]) => `<button type="button" data-day="${day}" class="${(patient.days || []).includes(day) ? "on" : ""}">${label}</button>`).join("")}</div>
      <label class="check"><input name="domicile" type="checkbox" ${patient.domicile !== false ? "checked" : ""}> Au domicile (IFD)</label>
      <label class="check"><input name="hors" type="checkbox" ${patient.horsAgglo ? "checked" : ""}> Hors de ton agglomération (IK)</label>
      <label>Km aller, si hors agglomération<input name="km" type="number" min="0" max="200" step="1" value="${patient.km || ""}"></label>
      <label class="check"><input name="paused" type="checkbox" ${patient.paused ? "checked" : ""}> En pause</label>
      <div id="passes">${patient.passages.map(passageHtml).join("")}</div>
      <button type="button" class="ghost" id="add-pass">Autre passage</button>
      ${history ? `<section class="history"><p class="label">Carnet</p>${history}</section>` : ""}
      <div class="dialog-actions">
        ${id ? `<button type="button" class="text danger" id="delete-patient">Supprimer</button>` : ""}
        <button type="submit" class="primary">Enregistrer</button>
      </div>
    </form>`, () => bindPatient(patient));
}

function readPasses(root) {
  return [...root.querySelectorAll("[data-pass]")].slice(0, 3).map((block) => ({
    slot: block.querySelector("[data-slot]").value,
    acts: [...block.querySelectorAll("[data-act].on")].map((button) => button.dataset.act),
    mau: block.querySelector("[data-flag=mau]").checked,
    mie: block.querySelector("[data-flag=mie]").checked,
    mci: block.querySelector("[data-flag=mci]").checked,
  }));
}

function bindPatient(patient) {
  const form = document.querySelector("#patient-form");
  form.querySelector("[data-close]").addEventListener("click", closeSheet);
  form.addEventListener("click", (event) => {
    const day = event.target.closest("[data-day]");
    if (day) day.classList.toggle("on");
    const act = event.target.closest("[data-act]");
    if (act) act.classList.toggle("on");
    if (event.target.closest("[data-drop]")) {
      event.target.closest("[data-pass]").remove();
      renumberPasses();
    }
  });
  form.querySelector("#add-pass").addEventListener("click", () => {
    const list = form.querySelector("#passes");
    if (list.querySelectorAll("[data-pass]").length >= 3) return;
    list.insertAdjacentHTML("beforeend", passageHtml({ slot: "16-18", acts: [], mau: true, mie: false, mci: false }, list.querySelectorAll("[data-pass]").length));
  });
  form.querySelector("[name=address]").addEventListener("input", onAddress);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const address = String(data.get("address") || "").trim();
    if (!name || !address) return;
    const next = patientRecord({
      ...patient,
      name,
      address,
      phone: String(data.get("phone") || "").trim(),
      note: String(data.get("note") || "").trim(),
      cabinetId: String(data.get("cabinet") || cabinet().id),
      domicile: data.get("domicile") === "on",
      horsAgglo: data.get("hors") === "on",
      km: Number(data.get("km")) || 0,
      paused: data.get("paused") === "on",
      days: [...form.querySelectorAll("[data-day].on")].map((button) => Number(button.dataset.day)),
      passages: readPasses(form),
    });
    if (next.address !== patient.address) {
      next.lat = null;
      next.lon = null;
      next.geoLabel = "";
    }
    const index = state.patients.findIndex((item) => item.id === patient.id);
    if (index >= 0) state.patients[index] = next;
    else state.patients.push(next);
    save();
    closeSheet();
    render();
  });
  form.querySelector("#delete-patient")?.addEventListener("click", () => {
    state.patients = state.patients.filter((item) => item.id !== patient.id);
    save();
    closeSheet();
    render();
  });
}

function renumberPasses() {
  document.querySelectorAll("[data-pass] .label").forEach((label, index) => { label.textContent = `Passage ${index + 1}`; });
}

async function onAddress(event) {
  const query = event.target.value.trim();
  const list = document.querySelector(".suggest");
  const seq = ++suggestSeq;
  if (query.length < 3) { list.hidden = true; return; }
  try {
    const rows = await suggest(query);
    if (seq !== suggestSeq) return;
    list.innerHTML = rows.map((row, index) => `<li><button type="button" data-suggest="${index}">${esc(row.label)}</button></li>`).join("");
    list.hidden = !rows.length;
    list.querySelectorAll("[data-suggest]").forEach((button) => button.addEventListener("click", () => {
      const row = rows[Number(button.dataset.suggest)];
      document.querySelector("[name=address]").value = row.label;
      list.hidden = true;
    }));
  } catch { list.hidden = true; }
}

function openOrder(id) {
  const patient = patientById(id);
  if (!patient) return;
  const previous = (state.orders[id] || []).slice().reverse().slice(0, 5).map((item) => `<p class="meta">${esc(new Date(item.at).toLocaleDateString("fr-FR"))} · ${esc(item.text.slice(0, 80))}</p>`).join("");
  openSheet(`
    <form id="order-form">
      <div class="dialog-head"><h2>Ordonnance</h2><button type="button" class="text" data-close>Fermer</button></div>
      <p class="meta">${esc(patient.name)} · ${esc(patient.address)}</p>
      <label>Date<input name="date" type="date" value="${cursor}"></label>
      <label>Prescription<textarea name="text" rows="5" required placeholder="Ce que tu prescris"></textarea></label>
      <label class="check"><input name="ald" type="checkbox"> Affection de longue durée</label>
      <label class="check"><input name="replacement" type="checkbox" ${cabinet().titulaire ? "checked" : ""}> En remplacement${cabinet().titulaire ? ` de ${esc(cabinet().titulaire)}` : ""}</label>
      <p class="hint">La signature et ton RPPS se règlent une fois dans Réglages.</p>
      ${previous ? `<section><p class="label">Déjà rédigées</p>${previous}</section>` : ""}
      <button type="submit" class="primary">Enregistrer et imprimer</button>
    </form>`, () => {
    const form = document.querySelector("#order-form");
    form.querySelector("[data-close]").addEventListener("click", closeSheet);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const text = String(data.get("text") || "").trim();
      if (!text) return;
      const order = {
        id: uid(),
        at: Date.now(),
        date: String(data.get("date") || cursor),
        text,
        ald: data.get("ald") === "on",
        replacement: data.get("replacement") === "on",
      };
      state.orders[id] = [...(state.orders[id] || []), order].slice(-30);
      save();
      closeSheet();
      printOrder(patient, order);
    });
  });
}

function printOrder(patient, order) {
  const nurse = state.settings.nurse || "Infirmier libéral";
  const when = parseDate(order.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  els.print.innerHTML = `
    <header class="sheet-head"><p>Ordonnance infirmière</p><h1>${esc(when)}</h1></header>
    <p><strong>${esc(patient.name)}</strong><br>${esc(patient.address)}</p>
    ${order.ald ? `<p class="sheet-strong">Ordonnance pour affection de longue durée</p>` : ""}
    <p class="sheet-body">${esc(order.text)}</p>
    ${order.replacement && cabinet().titulaire ? `<p>En remplacement de ${esc(cabinet().titulaire)}</p>` : ""}
    ${state.settings.signature ? `<img class="sign" alt="Signature" src="${state.settings.signature}">` : ""}
    <p class="sheet-strong">${esc(nurse)}${state.settings.rpps ? `<br>RPPS ${esc(state.settings.rpps)}` : ""}</p>`;
  window.print();
}

function printReleve() {
  const notes = [];
  for (const stop of orderedStops()) {
    for (const note of state.notes[stop.patient.id] || []) {
      if (note.date === cursor && note.key === stop.key) notes.push({ stop, note });
    }
  }
  if (!notes.length) { flash("Aucune transmission pour ce jour"); return; }
  const blocks = notes.map(({ stop, note }) => `
    <article class="sheet-stop"><p class="sheet-kicker">${esc(new Date(note.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }))} · ${esc(stop.label)}</p>
    <h2>${esc(stop.patient.name)}</h2>
    ${vitalLine(note) ? `<p>${esc(vitalLine(note))}</p>` : ""}
    ${note.text ? `<p class="sheet-strong">${esc(note.text)}</p>` : ""}</article>`).join("");
  els.print.innerHTML = `<header class="sheet-head"><p>Relevé pour la relève</p><h1>${esc(dateLabel(cursor))}</h1></header>${blocks}`;
  window.print();
}

function printCompte() {
  const stops = orderedStops().filter((stop) => statusOf(stop.key) !== "absent");
  const bill = money(orderedStops(), cursor);
  const blocks = stops.map((stop) => {
    const price = bill.map.get(stop.key);
    const lines = (price?.lines || []).map((line) => `<p>${esc(line.label)} · ${esc(line.code)} · ${euro.format(line.amount)}</p>`).join("");
    return `<article class="sheet-stop"><h2>${esc(stop.patient.name)} · ${esc(stop.label)}</h2>${lines}<p class="sheet-strong">${euro.format(price?.total || 0)}</p></article>`;
  }).join("");
  const rate = bill.rate;
  els.print.innerHTML = `
    <header class="sheet-head"><p>Compte · ${esc(cabinet().name)}</p><h1>${esc(dateLabel(cursor))}</h1></header>
    ${blocks}
    <p class="sheet-strong">Total ${euro.format(bill.all)}</p>
    ${rate ? `<p>Rétrocession ${rate} % pour ${esc(cabinet().titulaire || "la titulaire")} : ${euro.format(bill.retro)}</p><p class="sheet-strong">Pour toi : ${euro.format(bill.all - bill.retro)}</p>` : ""}
    <p>${esc(BAREME)}</p>`;
  window.print();
}

function openSettings() {
  const cab = cabinet();
  openSheet(`
    <form id="settings-form">
      <div class="dialog-head"><h2>Toi et tes cabinets</h2><button type="button" class="text" data-close>Fermer</button></div>
      <label>Ton nom<input name="nurse" value="${esc(state.settings.nurse)}" placeholder="Prénom Nom"></label>
      <label>RPPS<input name="rpps" value="${esc(state.settings.rpps)}" inputmode="numeric"></label>
      <label>GPS<select name="gps"><option value="google" ${state.settings.gps === "google" ? "selected" : ""}>Google Maps</option><option value="waze" ${state.settings.gps === "waze" ? "selected" : ""}>Waze</option></select></label>
      <label>IK<select name="zone"><option value="plaine" ${state.settings.zone !== "montagne" ? "selected" : ""}>Plaine, 0,35 € / km</option><option value="montagne" ${state.settings.zone === "montagne" ? "selected" : ""}>Montagne, 0,50 € / km</option></select></label>
      <label>Code de l'application<input name="pin" inputmode="numeric" maxlength="4" value="${esc(state.settings.pin)}" placeholder="4 chiffres, vide pour aucun"></label>
      <p class="label">Signature, une seule fois</p>
      <canvas id="sign" width="320" height="120"></canvas>
      <button type="button" class="text" id="clear-sign">Effacer la signature</button>
      <p class="label">Cabinet affiché</p>
      <label>Nom du cabinet<input name="cname" value="${esc(cab.name)}"></label>
      <label>Titulaire, si tu remplaces<input name="titulaire" value="${esc(cab.titulaire)}" placeholder="Nom de la titulaire"></label>
      <label>Rétrocession, en %<input name="rate" type="number" min="0" max="100" step="1" value="${Number(cab.rate) || 0}"></label>
      <label>Adresse de départ<input name="caddress" value="${esc(cab.address)}" placeholder="Cabinet ou domicile" autocomplete="off"></label>
      <ul class="suggest" hidden></ul>
      <button type="button" class="ghost" id="add-cabinet">Autre cabinet</button>
      <button type="submit" class="primary">Enregistrer</button>
    </form>`, bindSettings);
}

function bindSettings() {
  const form = document.querySelector("#settings-form");
  const canvas = document.querySelector("#sign");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fffaf6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.settings.signature) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = state.settings.signature;
  }
  ctx.strokeStyle = "#241c19";
  ctx.lineWidth = 2;
  let drawing = false;
  let signTouched = false;
  let signCleared = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * (canvas.width / rect.width), (event.clientY - rect.top) * (canvas.height / rect.height)];
  };
  canvas.onpointerdown = (event) => {
    signTouched = true;
    signCleared = false;
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  canvas.onpointermove = (event) => {
    if (!drawing) return;
    const [x, y] = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  canvas.onpointerup = () => { drawing = false; };
  form.querySelector("#clear-sign").addEventListener("click", () => {
    signTouched = true;
    signCleared = true;
    state.settings.signature = "";
    ctx.fillStyle = "#fffaf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
  form.querySelector("[data-close]").addEventListener("click", closeSheet);
  form.querySelector("[name=caddress]").addEventListener("input", onAddress);
  form.querySelector("#add-cabinet").addEventListener("click", () => {
    const created = freshCabinet();
    created.name = `Cabinet ${state.cabinets.length + 1}`;
    state.cabinets.push(created);
    state.settings.cabinetId = created.id;
    save();
    openSettings();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const pin = String(data.get("pin") || "").replace(/\D/g, "").slice(0, 4);
    state.settings.nurse = String(data.get("nurse") || "").trim();
    state.settings.rpps = String(data.get("rpps") || "").trim();
    state.settings.gps = String(data.get("gps") || "google");
    state.settings.zone = String(data.get("zone") || "plaine");
    state.settings.pin = pin.length === 4 ? pin : "";
    const cab = cabinet();
    const address = String(data.get("caddress") || "").trim();
    if (address !== cab.address) { cab.lat = null; cab.lon = null; cab.label = ""; }
    cab.name = String(data.get("cname") || "Cabinet").trim() || "Cabinet";
    cab.titulaire = String(data.get("titulaire") || "").trim();
    cab.rate = Math.min(100, Math.max(0, Number(data.get("rate")) || 0));
    cab.address = address;
    if (signCleared) state.settings.signature = "";
    else if (signTouched) state.settings.signature = canvas.toDataURL("image/png");
    save();
    closeSheet();
    render();
  });
}

function setupLock() {
  const pad = document.querySelector("#pad");
  pad.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((key) => key === "" ? `<span></span>` : `<button type="button" data-key="${key}">${key}</button>`).join("");
  let typed = "";
  const dots = document.querySelector("#pin-dots");
  const paint = () => { dots.textContent = `${"●".repeat(typed.length)}${"○".repeat(4 - typed.length)}`; };
  paint();
  pad.addEventListener("click", (event) => {
    const key = event.target.dataset.key;
    if (!key) return;
    if (key === "⌫") typed = typed.slice(0, -1);
    else if (typed.length < 4) typed += key;
    paint();
    if (typed.length === 4) {
      if (typed === state.settings.pin) {
        unlocked = true;
        document.body.classList.remove("locked");
        els.lock.hidden = true;
        render();
      } else {
        typed = "";
        paint();
        flash("Code incorrect");
      }
    }
  });
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  view = button.dataset.view;
  render();
}));
document.querySelector("#open-settings").addEventListener("click", openSettings);
setupLock();
if (unlocked) render();
else {
  document.body.classList.add("locked");
  els.lock.hidden = false;
}
