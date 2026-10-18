import { planRoute, travelMinutesFallback } from "../tournee/route.js";
import { ACTS, actById, actMinutes, quote } from "./ngap.js";

const KEY = "journee-idel-v1";
const WEEK = [[1, "Lun"], [2, "Mar"], [3, "Mer"], [4, "Jeu"], [5, "Ven"], [6, "Sam"], [0, "Dim"]];
const SLOTS = [
  ["6-8", "6h–8h", 6], ["8-10", "8h–10h", 8], ["10-12", "10h–12h", 10], ["12-14", "12h–14h", 12],
  ["14-16", "14h–16h", 14], ["16-18", "16h–18h", 16], ["18-20", "18h–20h", 18], ["20-22", "20h–22h", 20],
  ["22-24", "22h–minuit", 22], ["quand", "N'importe quand", null],
];
const VITALS = [
  ["tension", "Tension"], ["pouls", "Pouls"], ["glycemie", "Glycémie / Insuline"], ["sat", "Saturation"],
  ["douleur", "EN"], ["temp", "T°"], ["fr", "FR"], ["poids", "Poids / taille"],
];

const els = {
  app: document.querySelector("#app"),
  nav: document.querySelector("#nav"),
  toast: document.querySelector("#toast"),
  sheet: document.querySelector("#sheet"),
  lock: document.querySelector("#lock"),
  print: document.querySelector("#print-sheet"),
};
const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const state = load();
let view = "home";
let cursor = dateKey(new Date());
let focusId = "";
let tourMoment = "matin";
let noteIndex = 0;
let unlocked = !state.settings.pin;
let busy = false;
let vitalDraft = { key: "", values: {} };
let suggestSeq = 0;

function blank() {
  return {
    settings: { pin: "2106", pinApplied: true, nurse: "", rpps: "", city: "", gps: "google", zone: "plaine", signature: "", cabinetId: "" },
    cabinets: [], patients: [], days: {}, notes: {}, orders: {},
  };
}
function freshCabinet() {
  return { id: uid(), name: "Tournée 1", titulaire: "", rate: 0, address: "", lat: null, lon: null, label: "" };
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
function normalize(saved) {
  const next = blank();
  next.settings = { ...next.settings, ...(saved.settings || {}) };
  if (!saved.settings?.pinApplied && !saved.settings?.pin) next.settings.pin = "2106";
  next.settings.pinApplied = true;
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
  const passages = Array.isArray(raw.passages) && raw.passages.length ? raw.passages : [{ slot: "8-10", care: raw.soins || "", acts: [] }];
  return {
    id: raw.id || uid(),
    cabinetId: raw.cabinetId || "",
    name: raw.name || "",
    sex: raw.sex === "m" || raw.sex === "f" ? raw.sex : "",
    birth: raw.birth || "",
    address: raw.address || "",
    lat: raw.lat ?? null,
    lon: raw.lon ?? null,
    geoLabel: raw.geoLabel || "",
    phone: raw.phone || "",
    doctor: raw.doctor || "",
    pharmacy: raw.pharmacy || "",
    soins: raw.soins || "",
    note: raw.note || "",
    paused: Boolean(raw.paused),
    domicile: raw.domicile !== false,
    horsAgglo: Boolean(raw.horsAgglo),
    km: Number(raw.km) || 0,
    days: Array.isArray(raw.days) ? raw.days.map(Number).filter((day) => day >= 0 && day <= 6) : [],
    passages: passages.slice(0, 3).map((item) => ({
      slot: SLOTS.some((slot) => slot[0] === item.slot) ? item.slot : "8-10",
      moment: item.moment === "soir" || item.moment === "matin" ? item.moment : "",
      care: item.care || "",
      acts: (item.acts || []).filter((id) => actById(id)),
      mau: item.mau !== false,
      mie: Boolean(item.mie),
      mci: Boolean(item.mci),
    })),
  };
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
function uid() { return Math.random().toString(36).slice(2, 10); }
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(iso) { return new Date(`${iso}T12:00:00`); }
function addDays(date, count) { const next = new Date(date); next.setDate(next.getDate() + count); return next; }
function formatHM(minutes) {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(value / 60)}h${String(value % 60).padStart(2, "0")}`;
}
function longDate(iso) {
  return parseDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function shortDate(iso) {
  return parseDate(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function flash(message) {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { els.toast.hidden = true; }, 2600);
}
function cabinet() { return state.cabinets.find((item) => item.id === state.settings.cabinetId) || state.cabinets[0]; }
function patientById(id) { return state.patients.find((item) => item.id === id) || null; }
function dayRecord(iso = cursor) {
  if (!state.days[iso]) state.days[iso] = {};
  const id = cabinet().id;
  if (!state.days[iso][id]) state.days[iso][id] = { order: [], status: {}, eta: {}, leave: null };
  return state.days[iso][id];
}
function slotOf(id) { return SLOTS.find((slot) => slot[0] === id) || SLOTS[1]; }
function momentOf(passage) {
  if (passage.moment === "matin" || passage.moment === "soir") return passage.moment;
  const hour = slotOf(passage.slot)[2];
  return hour != null && hour >= 14 ? "soir" : "matin";
}
function ageOf(birth) {
  if (!birth) return null;
  const born = parseDate(birth);
  const now = parseDate(cursor);
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
function sexMark(sex) { return sex === "m" ? "♂" : sex === "f" ? "♀" : ""; }
function personTitle(patient) {
  const age = ageOf(patient.birth);
  return `${sexMark(patient.sex)} ${patient.name}${age != null ? `, ${age} ans` : ""}`.trim();
}
function careLabel(passage) {
  if (passage.care) return passage.care;
  return (passage.acts || []).map((id) => actById(id)?.label).filter(Boolean).join(", ") || "Soin";
}
function guessAct(label) {
  const text = label.toLowerCase();
  if (text.includes("sang")) return "pds";
  if (text.includes("insuline")) return "insuline";
  if (text.includes("injection")) return "inj-sc";
  if (text.includes("toilette") || text.includes("séance") || text.includes("seance")) return "seance";
  if (text.includes("perfus")) return "perf-courte";
  if (text.includes("complexe") || text.includes("lourd")) return "lourd";
  if (text.includes("pansement") || text.includes("stom")) return "pansement";
  return "";
}
function passageStops(iso = cursor, moment = "") {
  const weekday = parseDate(iso).getDay();
  const list = [];
  for (const patient of state.patients) {
    if (patient.paused || patient.cabinetId !== cabinet().id) continue;
    if (!(patient.days || []).includes(weekday)) continue;
    patient.passages.forEach((passage, index) => {
      if (moment && momentOf(passage) !== moment) return;
      const slot = slotOf(passage.slot);
      list.push({
        key: `${patient.id}:${index}`, patient, passage, index,
        hour: slot[2], label: slot[1],
        open: slot[2] == null ? null : slot[2] * 60,
        close: slot[2] == null ? null : slot[2] * 60 + 119,
      });
    });
  }
  return list;
}
function orderedStops(iso = cursor, moment = "") {
  const stops = passageStops(iso, moment);
  const byKey = new Map(stops.map((stop) => [stop.key, stop]));
  const order = [];
  for (const key of dayRecord(iso).order || []) if (byKey.has(key)) order.push(byKey.get(key));
  const rest = [...stops].sort((a, b) => (a.hour ?? 99) - (b.hour ?? 99) || a.patient.name.localeCompare(b.patient.name, "fr"));
  for (const stop of rest) if (!order.some((item) => item.key === stop.key)) order.push(stop);
  return order;
}
function statusOf(key, iso = cursor) { return dayRecord(iso).status?.[key] || ""; }
function whenText(stop) {
  const eta = dayRecord().eta?.[stop.key];
  if (!eta) return `Auj, ${stop.label}`;
  const end = eta.start + actMinutes(stop.passage.acts);
  return `Auj, ${formatHM(eta.start)} – ${formatHM(end)}`;
}
function placeKey(stop) { return `${(stop.patient.address || "").trim().toLowerCase()}|${stop.passage.slot}`; }
function prices(stops, iso) {
  const sunday = parseDate(iso).getDay() === 0;
  const seen = new Set();
  const map = new Map();
  for (const stop of stops) {
    if (statusOf(stop.key, iso) === "absent") { map.set(stop.key, { lines: [], total: 0 }); continue; }
    const key = placeKey(stop);
    const first = !seen.has(key);
    if (first) seen.add(key);
    map.set(stop.key, quote(stop.passage.acts, {
      domicile: stop.patient.domicile !== false, ifd: first, km: stop.patient.km,
      horsAgglo: stop.patient.horsAgglo, zone: state.settings.zone, sunday, hour: stop.hour,
      mau: stop.passage.mau !== false, mie: stop.passage.mie, mci: stop.passage.mci,
    }));
  }
  return map;
}
function money(stops, iso) {
  const map = prices(stops, iso);
  const all = [...map.values()].reduce((sum, item) => sum + item.total, 0);
  const rate = Number(cabinet().rate) || 0;
  return { map, all, retro: Math.round(all * rate) / 100, rate };
}
function phoneHref(phone) { return String(phone || "").replace(/[^\d+]/g, ""); }
function gpsUrl(patient) {
  if (state.settings.gps === "waze") {
    return patient.lat != null
      ? `https://waze.com/ul?ll=${patient.lat},${patient.lon}&navigate=yes`
      : `https://waze.com/ul?q=${encodeURIComponent(patient.address)}&navigate=yes`;
  }
  const destination = patient.lat != null ? `${patient.lat},${patient.lon}` : patient.address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
function openGps(patient) {
  if (!patient) return;
  const opened = window.open(gpsUrl(patient), "_blank", "noopener");
  if (!opened) flash("Le GPS n'a pas pu s'ouvrir.");
}
function firstName() {
  const name = (state.settings.nurse || "").trim().split(/\s+/)[0];
  return name || "";
}

function renderNav() {
  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("on", button.dataset.nav === view);
  });
}
function backRow(title) {
  return `<div class="top"><button type="button" class="text" id="back">‹</button><h2 class="screen-title">${title}</h2><span></span></div>`;
}
function visitCard(stop, badge) {
  const patient = stop.patient;
  return `<article class="visit">
    ${badge ? `<span class="pill">${badge}</span>` : ""}
    <div class="visit-top">
      <div><h3>${esc(personTitle(patient))}</h3><p class="sub">${esc(careLabel(stop.passage))}</p></div>
      <div class="icon-btns">
        <button type="button" data-gps="${esc(patient.id)}" aria-label="GPS">⌖</button>
        ${patient.phone ? `<a href="tel:${esc(phoneHref(patient.phone))}" aria-label="Appeler">☎</a>` : ""}
      </div>
    </div>
    <button type="button" class="slot-bar" data-open="${esc(patient.id)}">${esc(whenText(stop))}</button>
  </article>`;
}
function renderHome() {
  const stops = orderedStops();
  const bill = money(stops, cursor);
  const morning = orderedStops(cursor, "matin").find((stop) => !statusOf(stop.key));
  const evening = orderedStops(cursor, "soir").find((stop) => !statusOf(stop.key));
  const hello = firstName() ? `Bonjour ${firstName()} !` : "Bonjour !";
  els.app.innerHTML = `
    <section class="hello">
      <div class="avatar">${esc((firstName() || "T").slice(0, 1).toUpperCase())}</div>
      <div><h1>${esc(hello)}</h1><p>${esc(state.settings.city || cabinet().name)}</p></div>
      <button type="button" class="round" data-nav="folder" aria-label="Profil">☺</button>
    </section>
    <div class="date-line">
      <button type="button" id="prev-day" aria-label="Jour précédent">‹</button>
      <span>${esc(longDate(cursor))}</span>
      <button type="button" id="next-day" aria-label="Jour suivant">›</button>
    </div>
    <div class="duo">
      <article><p>CA prévisionnel</p><strong>${euro.format(bill.all)}</strong></article>
      <article class="deep"><p>Nombre de rdv</p><strong>${stops.length} rdv</strong></article>
    </div>
    <div class="row-title"><h2>Tournée du matin</h2><button type="button" data-tour="matin">Tout voir</button></div>
    ${morning ? visitCard(morning, "Dernier soin") : `<p class="empty">Aucun passage ce matin.</p>`}
    <div class="row-title"><h2>Tournée du soir</h2><button type="button" data-tour="soir">Tout voir</button></div>
    ${evening ? visitCard(evening, "") : `<p class="empty">Aucun passage ce soir.</p>`}`;
}
function renderTour() {
  const title = tourMoment === "soir" ? "Tournée du soir" : "Tournée du matin";
  const stops = orderedStops(cursor, tourMoment);
  const groups = [];
  for (const stop of stops) {
    const label = stop.hour == null ? "N'importe quand" : `${stop.hour}h–${stop.hour + 2}h`;
    let group = groups.find((item) => item.label === label);
    if (!group) { group = { label, stops: [] }; groups.push(group); }
    group.stops.push(stop);
  }
  const cards = groups.map((group) => `
    <h3 class="group">${esc(group.label)}</h3>
    ${group.stops.map((stop, index) => {
      const status = statusOf(stop.key);
      const number = stops.indexOf(stop) + 1;
      return `<article class="stop-card ${status}">
        <span class="num">${number || index + 1}</span>
        <button type="button" class="text" data-open="${esc(stop.patient.id)}" style="text-align:left">
          <strong>${esc(personTitle(stop.patient))}</strong>
          <p class="sub">${esc(careLabel(stop.passage))}</p>
        </button>
        <div class="when">${esc(whenText(stop))}
          ${status === "done" ? `<span class="tag ok">Validé</span>` : ""}
          ${status === "absent" ? `<span class="tag no">Annulé</span>` : ""}
          <div class="decide">
            <button type="button" data-done="${esc(stop.key)}" aria-label="Valider">✓</button>
            <button type="button" data-absent="${esc(stop.key)}" aria-label="Annuler">✕</button>
          </div>
        </div>
      </article>`;
    }).join("")}`).join("");
  els.app.innerHTML = `
    ${backRow("Tournée détaillée")}
    <div class="row-title"><span>${esc(cabinet().name)}</span><button type="button" id="switch-tour">Changer de tournée</button></div>
    ${cards || `<p class="empty">Personne sur cette tournée.</p>`}
    <button type="button" class="primary full" id="organize">${busy ? "Organisation…" : "Lancer l'organisation de ma tournée"}</button>
    <p class="add-line">Ajouter d'autres passages ? <button type="button" class="linkish" id="add-pass">Ajouter ici</button></p>`;
}
function renderPatients() {
  const list = state.patients
    .filter((patient) => patient.cabinetId === cabinet().id && !patient.paused)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  els.app.innerHTML = `
    ${backRow("Patients")}
    ${list.map((patient) => `<button type="button" class="person" data-open="${esc(patient.id)}"><strong>${esc(personTitle(patient))}</strong><p class="sub">${esc(patient.phone || patient.address)}</p></button>`).join("") || `<p class="empty">Aucun patient. Le bouton + en ajoute un.</p>`}`;
}
function renderPatient() {
  const patient = patientById(focusId);
  if (!patient) { view = "patients"; renderPatients(); return; }
  const today = orderedStops().filter((stop) => stop.patient.id === patient.id);
  const slot = today[0] ? whenText(today[0]) : "Pas aujourd'hui";
  const map = patient.lat != null
    ? `<iframe title="Carte" src="https://www.openstreetmap.org/export/embed.html?bbox=${patient.lon - 0.012}%2C${patient.lat - 0.008}%2C${patient.lon + 0.012}%2C${patient.lat + 0.008}&layer=mapnik&marker=${patient.lat}%2C${patient.lon}"></iframe>`
    : "";
  const upcoming = [];
  for (let offset = 0; offset < 14 && upcoming.length < 4; offset += 1) {
    const date = addDays(parseDate(cursor), offset);
    if ((patient.days || []).includes(date.getDay())) {
      upcoming.push(`<div class="line"><span>${esc(shortDate(dateKey(date)))} – ${esc(patient.passages.map(careLabel).join(", ") || "Soin")}</span></div>`);
    }
  }
  els.app.innerHTML = `
    ${backRow("Information patient")}
    <div class="row-title"><div><h2>${esc(personTitle(patient))}</h2><p class="sub">${patient.birth ? `Date de naissance : ${esc(shortDate(patient.birth))}` : ""}</p></div><button type="button" class="linkish" id="more">Voir plus</button></div>
    <div class="pair">
      <button type="button" data-tour="${today[0] ? momentOf(today[0].passage) : "matin"}"><small>A voir aujourd'hui</small><br>${esc(slot)}</button>
      ${patient.phone ? `<a class="call" href="tel:${esc(phoneHref(patient.phone))}">Appeler le patient<br>${esc(patient.phone)}</a>` : `<button type="button" disabled>Pas de téléphone</button>`}
    </div>
    <div class="map">${map}<button type="button" class="map-card" data-gps="${esc(patient.id)}"><small>Domicile</small>${esc(patient.geoLabel || patient.address)}</button></div>
    <div class="row-title"><h2>Soins à réaliser</h2><button type="button" id="edit-patient">Ajouter un soin</button></div>
    ${patient.passages.map((passage, index) => `<div class="line"><span>Soin ${index + 1} – ${esc(careLabel(passage))}</span><button type="button" data-drop-pass="${index}">Suppr.</button></div>`).join("")}
    <h2 style="margin-top:16px">Prochain rdv avec le patient</h2>
    ${upcoming.join("") || `<p class="empty">Coche les jours sur la fiche.</p>`}
    <div class="pair" style="margin-top:16px">
      <button type="button" id="open-vitals">Constantes</button>
      <button type="button" id="open-order">Ordonnance</button>
    </div>`;
}
function renderCa() {
  const stops = orderedStops().filter((stop) => statusOf(stop.key) !== "absent");
  const bill = money(orderedStops(), cursor);
  const rows = stops.map((stop) => {
    const price = bill.map.get(stop.key);
    return `<article class="tx"><button type="button" class="pen" data-open="${esc(stop.patient.id)}">✎</button><div><strong>${esc(personTitle(stop.patient))}</strong><p class="sub">${esc(whenText(stop))}</p></div><strong>${euro.format(price?.total || 0)}</strong></article>`;
  }).join("");
  els.app.innerHTML = `
    <div class="top"><button type="button" class="text" id="back">‹</button><h2 class="screen-title">Votre chiffre d'affaires de la journée :</h2><button type="button" class="round" id="print-ca" aria-label="Exporter">⇩</button></div>
    <div class="date-line"><span>${esc(shortDate(cursor))}</span></div>
    <p class="amount">${euro.format(bill.all)}</p>
    ${bill.rate ? `<p class="sub" style="text-align:center">Rétrocession ${bill.rate} % · pour toi ${euro.format(bill.all - bill.retro)}</p>` : ""}
    <div class="row-title"><h2>Dernière transaction</h2></div>
    ${rows || `<p class="empty">Les soins de la journée apparaîtront ici.</p>`}`;
}
function renderVitals() {
  const patient = patientById(focusId);
  if (!patient) { view = "home"; renderHome(); return; }
  const notes = (state.notes[patient.id] || []).slice().reverse();
  const note = notes[noteIndex] || null;
  const values = vitalDraft.key === `fiche:${patient.id}` ? vitalDraft.values : {};
  const tiles = VITALS.map(([name, label]) => `
    <label class="tile">${label}<input data-vital="${name}" data-key="fiche:${esc(patient.id)}" placeholder="+" value="${esc(values[name] || "")}"></label>`).join("");
  els.app.innerHTML = `
    ${backRow("Constantes & transmissions")}
    <h2>${esc(personTitle(patient))}</h2>
    <p class="sub">${patient.birth ? `Date de naissance : ${esc(shortDate(patient.birth))}` : ""}</p>
    <div class="tiles" style="margin-top:12px">${tiles}
      <label class="tile wide">ajouter une transmission écrite<textarea data-vital="text" data-key="fiche:${esc(patient.id)}" rows="2" placeholder="+">${esc(values.text || "")}</textarea></label>
    </div>
    <button type="button" class="primary full" id="save-vitals">Enregistrer la transmission</button>
    ${note ? `<article class="history-card card">
      <div class="row-title"><button type="button" id="note-prev">‹</button><div><strong>Dernière transmission</strong><p class="sub">${esc(new Date(note.at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</p></div><button type="button" id="note-next">›</button></div>
      <p>${esc(vitalLine(note))}${note.text ? `<br>${esc(note.text)}` : ""}</p>
      <div class="tools"><button type="button" id="note-edit" aria-label="Modifier">✎</button><button type="button" id="note-delete" aria-label="Supprimer">🗑</button></div>
    </article>` : ""}`;
}
function vitalLine(note) {
  return VITALS.map(([name, label]) => (note[name] ? `${label} : ${note[name]}` : "")).filter(Boolean).join("\n");
}
function renderOrder() {
  const patient = patientById(focusId);
  if (!patient) { view = "home"; renderHome(); return; }
  const previous = state.orders[patient.id] || [];
  const nurse = state.settings.nurse || "Infirmière";
  els.app.innerHTML = `
    ${backRow("Créer une ordonnance")}
    ${previous.length ? `<p class="sub" style="text-align:center">Ordonnances précédentes (${previous.length})</p>` : ""}
    <div class="pair">
      <article class="soft"><small>PATIENT</small><h3>${esc(personTitle(patient))}</h3><p class="sub">${patient.birth ? `Date de naissance : ${esc(shortDate(patient.birth))}` : ""}</p></article>
      <article class="nurse-card"><small>INFIRMIÈRE</small><h3>${esc(nurse)}</h3><p>N° RPPS : ${esc(state.settings.rpps || "—")}</p><button type="button" class="text" id="edit-me">modifier mes infos</button></article>
    </div>
    <label class="checkline"><input id="replacement" type="checkbox" ${cabinet().titulaire ? "checked" : ""}> Remplaçante</label>
    <div class="line"><span>Fait le ${esc(longDate(cursor))}</span></div>
    <label class="field">Prescription<textarea id="order-text" placeholder="Ce que tu prescris"></textarea></label>
    <label class="checkline"><input id="ald" type="checkbox"> En rapport avec l'ALD</label>
    <button type="button" class="primary full" id="preview-order">Aperçu de l'ordonnance (PDF)</button>`;
}
function renderFolder() {
  els.app.innerHTML = `
    ${backRow("Dossier")}
    <button type="button" class="primary" id="print-trans">Transmissions du jour</button>
    <button type="button" class="primary" id="go-settings" style="margin-top:10px;background:#f3c3d4;color:#6d2446">Réglages, cabinets, signature</button>
    <p class="sub" style="margin-top:14px">Cabinet en cours : ${esc(cabinet().name)}</p>`;
}
function render() {
  if (!unlocked) return;
  captureVitals();
  renderNav();
  if (view === "tour") renderTour();
  else if (view === "patients") renderPatients();
  else if (view === "patient") renderPatient();
  else if (view === "ca") renderCa();
  else if (view === "vitals") renderVitals();
  else if (view === "order") renderOrder();
  else if (view === "folder") renderFolder();
  else renderHome();
  bind();
}
function bind() {
  document.querySelector("#back")?.addEventListener("click", () => { view = "home"; render(); });
  document.querySelectorAll("#app [data-nav]").forEach((button) => button.addEventListener("click", () => {
    view = button.dataset.nav === "folder" ? "folder" : "home";
    render();
  }));
  document.querySelector("#prev-day")?.addEventListener("click", () => { cursor = dateKey(addDays(parseDate(cursor), -1)); render(); });
  document.querySelector("#next-day")?.addEventListener("click", () => { cursor = dateKey(addDays(parseDate(cursor), 1)); render(); });
  document.querySelectorAll("[data-tour]").forEach((button) => button.addEventListener("click", () => {
    tourMoment = button.dataset.tour === "soir" ? "soir" : "matin";
    view = "tour";
    render();
  }));
  document.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => {
    focusId = button.dataset.open;
    view = "patient";
    render();
  }));
  document.querySelectorAll("[data-gps]").forEach((button) => button.addEventListener("click", () => openGps(patientById(button.dataset.gps))));
  document.querySelectorAll("[data-done]").forEach((button) => button.addEventListener("click", () => mark(button.dataset.done, "done")));
  document.querySelectorAll("[data-absent]").forEach((button) => button.addEventListener("click", () => mark(button.dataset.absent, "absent")));
  document.querySelector("#organize")?.addEventListener("click", () => organize(tourMoment));
  document.querySelector("#add-pass")?.addEventListener("click", () => openAdd("pass"));
  document.querySelector("#switch-tour")?.addEventListener("click", openCabinets);
  document.querySelector("#more")?.addEventListener("click", () => openPatientForm(patientById(focusId)));
  document.querySelector("#edit-patient")?.addEventListener("click", () => openPatientForm(patientById(focusId)));
  document.querySelectorAll("[data-drop-pass]").forEach((button) => button.addEventListener("click", () => {
    const patient = patientById(focusId);
    if (!patient || patient.passages.length < 2) { flash("Garde au moins un soin"); return; }
    patient.passages.splice(Number(button.dataset.dropPass), 1);
    save();
    render();
  }));
  document.querySelector("#open-vitals")?.addEventListener("click", () => { noteIndex = 0; view = "vitals"; render(); });
  document.querySelector("#open-order")?.addEventListener("click", () => { view = "order"; render(); });
  document.querySelector("#print-ca")?.addEventListener("click", printCa);
  document.querySelector("#print-trans")?.addEventListener("click", printTrans);
  document.querySelector("#go-settings")?.addEventListener("click", openSettings);
  document.querySelector("#save-vitals")?.addEventListener("click", saveCurrentVitals);
  document.querySelector("#note-prev")?.addEventListener("click", () => { noteIndex = Math.max(0, noteIndex - 1); render(); });
  document.querySelector("#note-next")?.addEventListener("click", () => {
    const count = (state.notes[focusId] || []).length;
    noteIndex = Math.min(count - 1, noteIndex + 1);
    render();
  });
  document.querySelector("#note-delete")?.addEventListener("click", () => {
    const list = state.notes[focusId] || [];
    const ordered = list.slice().reverse();
    const target = ordered[noteIndex];
    if (!target) return;
    state.notes[focusId] = list.filter((note) => note.id !== target.id);
    noteIndex = 0;
    save();
    render();
  });
  document.querySelector("#note-edit")?.addEventListener("click", () => {
    const ordered = (state.notes[focusId] || []).slice().reverse();
    const target = ordered[noteIndex];
    if (!target) return;
    vitalDraft = { key: `fiche:${focusId}`, values: { ...target } };
    render();
  });
  document.querySelector("#edit-me")?.addEventListener("click", openSettings);
  document.querySelector("#preview-order")?.addEventListener("click", previewOrder);
}
function mark(key, status) {
  const record = dayRecord();
  record.status[key] = record.status[key] === status ? "" : status;
  if (!record.status[key]) delete record.status[key];
  save();
  render();
}
function captureVitals() {
  const fields = document.querySelectorAll("[data-vital]");
  if (!fields.length) return;
  const values = {};
  let key = "";
  fields.forEach((field) => { values[field.dataset.vital] = field.value; key = field.dataset.key || key; });
  if (Object.values(values).some((value) => String(value || "").trim())) vitalDraft = { key, values };
}
function saveCurrentVitals() {
  captureVitals();
  const patient = patientById(focusId);
  if (!patient) return;
  const values = vitalDraft.values || {};
  const fields = {};
  for (const [name] of VITALS) if (String(values[name] || "").trim()) fields[name] = String(values[name]).trim();
  const text = String(values.text || "").trim();
  if (!text && !Object.keys(fields).length) { flash("Écris une constante ou une transmission"); return; }
  const list = state.notes[patient.id] || [];
  list.push({ id: uid(), at: Date.now(), date: cursor, text, ...fields });
  state.notes[patient.id] = list.slice(-80);
  vitalDraft = { key: "", values: {} };
  noteIndex = 0;
  save();
  flash("C'est noté");
  render();
}
function notesOfDay() {
  const ids = new Set(state.patients.filter((patient) => patient.cabinetId === cabinet().id).map((patient) => patient.id));
  const rows = [];
  for (const [patientId, list] of Object.entries(state.notes || {})) {
    if (!ids.has(patientId)) continue;
    const patient = patientById(patientId);
    if (!patient) continue;
    for (const note of list) if (note.date === cursor) rows.push({ patient, note });
  }
  rows.sort((a, b) => a.note.at - b.note.at);
  return rows;
}
function printTrans() {
  const notes = notesOfDay();
  if (!notes.length) { flash("Aucune transmission pour ce jour"); return; }
  const blocks = notes.map(({ patient, note }) => {
    const age = ageOf(patient.birth);
    const born = patient.sex === "m" ? "Né" : "Née";
    return `<article class="sheet-person"><h2>${esc(patient.name.toUpperCase())}</h2><span>${patient.birth ? `${born} le : ${esc(shortDate(patient.birth))}${age != null ? ` (${age} ans)` : ""}` : ""}</span></article>
      <div class="note-block"><strong>Le ${esc(shortDate(note.date))} à ${esc(new Date(note.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }))}</strong><br>${esc(vitalLine(note)).replaceAll("\n", "<br>")}${note.text ? `<br>${esc(note.text)}` : ""}</div>`;
  }).join("");
  els.print.innerHTML = `<h1 style="text-align:center">Transmissions du ${esc(longDate(cursor))}</h1>${blocks}`;
  window.print();
}
function printCa() {
  const stops = orderedStops().filter((stop) => statusOf(stop.key) !== "absent");
  const bill = money(orderedStops(), cursor);
  const blocks = stops.map((stop) => {
    const price = bill.map.get(stop.key);
    const lines = (price?.lines || []).map((line) => `<p>${esc(line.label)} · ${esc(line.code)} · ${euro.format(line.amount)}</p>`).join("");
    return `<article class="note-block"><h2>${esc(stop.patient.name)}</h2>${lines}<p><strong>${euro.format(price?.total || 0)}</strong></p></article>`;
  }).join("");
  els.print.innerHTML = `<h1>Chiffre d'affaires du ${esc(longDate(cursor))}</h1>${blocks}<p><strong>Total ${euro.format(bill.all)}</strong></p>${bill.rate ? `<p>Rétrocession ${bill.rate} % : ${euro.format(bill.retro)} · pour toi ${euro.format(bill.all - bill.retro)}</p>` : ""}`;
  window.print();
}
function previewOrder() {
  const patient = patientById(focusId);
  if (!patient) return;
  const text = document.querySelector("#order-text")?.value.trim() || "";
  if (!text) { flash("Écris la prescription"); return; }
  const order = {
    id: uid(), at: Date.now(), date: cursor, text,
    ald: document.querySelector("#ald")?.checked || false,
    replacement: document.querySelector("#replacement")?.checked || false,
  };
  state.orders[patient.id] = [...(state.orders[patient.id] || []), order].slice(-30);
  save();
  const nurse = state.settings.nurse || "Infirmière";
  els.print.innerHTML = `
    <p style="text-align:right">${esc(longDate(order.date))}</p>
    <h1>Ordonnance</h1>
    <p><strong>${esc(patient.name)}</strong>${patient.birth ? `<br>Né(e) le ${esc(shortDate(patient.birth))}` : ""}<br>${esc(patient.address)}</p>
    ${order.ald ? `<p><strong>Ordonnance en rapport avec l'ALD</strong></p>` : ""}
    <p class="note-block" style="white-space:pre-wrap">${esc(text)}</p>
    ${order.replacement && cabinet().titulaire ? `<p class="struck">${esc(cabinet().titulaire)}</p><p>En remplacement</p>` : ""}
    ${state.settings.signature ? `<img alt="Signature" src="${state.settings.signature}" style="width:200px">` : ""}
    <p><strong>${esc(nurse)}</strong>${state.settings.rpps ? `<br>RPPS ${esc(state.settings.rpps)}` : ""}</p>`;
  window.print();
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
async function organize(moment) {
  if (busy) return;
  const stops = orderedStops(cursor, moment).filter((stop) => !statusOf(stop.key));
  if (!stops.length) { flash("Aucun passage à organiser"); return; }
  const cab = cabinet();
  if (!cab.address.trim()) { flash("Indique l'adresse de départ dans les réglages"); openSettings(); return; }
  busy = true;
  render();
  try {
    if (cab.lat == null) {
      const geo = (await suggest(cab.address))[0];
      if (!geo) { flash("Adresse de départ introuvable"); return; }
      cab.lat = geo.lat; cab.lon = geo.lon; cab.label = geo.label;
    }
    for (const stop of stops) {
      if (stop.patient.lat != null) continue;
      const geo = (await suggest(stop.patient.address))[0];
      if (!geo) continue;
      stop.patient.lat = geo.lat; stop.patient.lon = geo.lon; stop.patient.geoLabel = geo.label;
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
      departMin: moment === "soir" ? 13 * 60 : 6 * 60,
    });
    const queue = planned.order.map((index) => located[index].key);
    const locatedKeys = new Set(located.map((stop) => stop.key));
    const next = [];
    for (const stop of orderedStops()) next.push(locatedKeys.has(stop.key) ? queue.shift() : stop.key);
    const record = dayRecord();
    record.order = next.filter(Boolean);
    planned.steps.forEach((step) => { record.eta[located[step.stop].key] = { start: step.start }; });
    const first = planned.steps[0];
    record.leave = first ? first.start - first.travel : null;
    save();
    flash("Tournée organisée");
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
    return data.durations.map((row, rowIndex) => row.map((seconds, colIndex) => {
      if (rowIndex === colIndex) return 0;
      if (seconds == null) return travelMinutesFallback(points[rowIndex], points[colIndex]);
      return Math.max(1, Math.round(seconds / 60));
    }));
  } catch {
    return points.map((from, row) => points.map((to, col) => (row === col ? 0 : travelMinutesFallback(from, to))));
  }
}
function openSheet(html, bindSheet) {
  els.sheet.innerHTML = html;
  bindSheet();
  if (!els.sheet.open) els.sheet.showModal();
}
function closeSheet() { els.sheet.close(); }
function openAdd(kind) {
  const people = state.patients.filter((patient) => patient.cabinetId === cabinet().id);
  openSheet(`<div class="pad-form">
    <div class="top"><h2>${kind === "pass" ? "Ajouter un passage" : "Ajouter"}</h2><button type="button" class="text" data-close>Fermer</button></div>
    <button type="button" class="primary" id="create-patient">Nouveau patient</button>
    ${people.map((patient) => `<button type="button" class="line" data-pick="${esc(patient.id)}">${esc(patient.name)}</button>`).join("")}
  </div>`, () => {
    document.querySelector("[data-close]").addEventListener("click", closeSheet);
    document.querySelector("#create-patient").addEventListener("click", () => openPatientForm(null));
    document.querySelectorAll("[data-pick]").forEach((button) => button.addEventListener("click", () => {
      const patient = patientById(button.dataset.pick);
      if (!patient) return;
      if (patient.passages.length >= 3) { flash("Trois passages maximum"); return; }
      patient.passages.push({ slot: tourMoment === "soir" ? "18-20" : "8-10", moment: tourMoment, care: "", acts: [], mau: true, mie: false, mci: false });
      const day = parseDate(cursor).getDay();
      if (!patient.days.includes(day)) patient.days.push(day);
      save();
      closeSheet();
      focusId = patient.id;
      openPatientForm(patient);
    }));
  });
}
function openCabinets() {
  openSheet(`<div class="pad-form">
    <div class="top"><h2>Changer de tournée</h2><button type="button" class="text" data-close>Fermer</button></div>
    ${state.cabinets.map((item) => `<button type="button" class="line" data-cab="${esc(item.id)}">${esc(item.name)}</button>`).join("")}
    <button type="button" class="primary" id="new-cab">Nouvelle tournée</button>
  </div>`, () => {
    document.querySelector("[data-close]").addEventListener("click", closeSheet);
    document.querySelectorAll("[data-cab]").forEach((button) => button.addEventListener("click", () => {
      state.settings.cabinetId = button.dataset.cab;
      save();
      closeSheet();
      render();
    }));
    document.querySelector("#new-cab").addEventListener("click", () => {
      const created = freshCabinet();
      created.name = `Tournée ${state.cabinets.length + 1}`;
      state.cabinets.push(created);
      state.settings.cabinetId = created.id;
      save();
      closeSheet();
      openSettings();
    });
  });
}
function openPatientForm(patient) {
  const current = patient || patientRecord({ cabinetId: cabinet().id, days: [parseDate(cursor).getDay()], passages: [{ slot: tourMoment === "soir" ? "18-20" : "8-10", moment: tourMoment, care: "", acts: [] }] });
  const passage = current.passages[0];
  openSheet(`<form id="patient-form">
    <div class="top"><h2>${patient ? "Fiche patient" : "Nouveau patient"}</h2><button type="button" class="text" data-close>Fermer</button></div>
    <div class="days" id="sex">${[["f", "Femme"], ["m", "Homme"]].map(([value, label]) => `<button type="button" data-sex="${value}" class="${current.sex === value ? "on" : ""}">${label}</button>`).join("")}</div>
    <label class="field">Nom<input name="name" required value="${esc(current.name)}"></label>
    <label class="field">Date de naissance<input name="birth" type="date" value="${esc(current.birth)}"></label>
    <label class="field">Téléphone<input name="phone" value="${esc(current.phone)}" inputmode="tel"></label>
    <label class="field">Adresse<input name="address" required value="${esc(current.address)}" autocomplete="off"></label>
    <ul class="suggest" hidden></ul>
    <label class="field">Médecin<input name="doctor" value="${esc(current.doctor)}"></label>
    <label class="field">Pharmacie<input name="pharmacy" value="${esc(current.pharmacy)}"></label>
    <label class="field">Accès<input name="note" value="${esc(current.note)}" placeholder="Digicode, étage"></label>
    <p class="sub">Jours de passage</p>
    <div class="days">${WEEK.map(([day, label]) => `<button type="button" data-day="${day}" class="${current.days.includes(day) ? "on" : ""}">${label}</button>`).join("")}</div>
    <label class="field">Soin<input name="care" value="${esc(passage.care || "")}" placeholder="Pansement, prise de sang…"></label>
    <label class="field">Créneau<select name="slot">${SLOTS.map((slot) => `<option value="${slot[0]}" ${passage.slot === slot[0] ? "selected" : ""}>${slot[1]}</option>`).join("")}</select></label>
    <div class="days" id="moment">
      <button type="button" data-moment="matin" class="${momentOf(passage) === "matin" ? "on" : ""}">Matin</button>
      <button type="button" data-moment="soir" class="${momentOf(passage) === "soir" ? "on" : ""}">Soir</button>
    </div>
    <div class="chips">${ACTS.slice(0, 10).map((act) => `<button type="button" data-act="${act.id}" class="${passage.acts.includes(act.id) ? "on" : ""}">${esc(act.label)}</button>`).join("")}</div>
    <label class="checkline"><input name="domicile" type="checkbox" ${current.domicile !== false ? "checked" : ""}> Au domicile</label>
    <button class="primary" type="submit">Enregistrer</button>
    ${patient ? `<button type="button" class="text" id="delete-patient">Supprimer le patient</button>` : ""}
  </form>`, () => bindPatientForm(current));
}
function bindPatientForm(patient) {
  const form = document.querySelector("#patient-form");
  form.querySelector("[data-close]").addEventListener("click", closeSheet);
  form.addEventListener("click", (event) => {
    const sex = event.target.closest("[data-sex]");
    if (sex) { form.querySelectorAll("[data-sex]").forEach((button) => button.classList.toggle("on", button === sex)); }
    const day = event.target.closest("[data-day]");
    if (day) day.classList.toggle("on");
    const moment = event.target.closest("[data-moment]");
    if (moment) form.querySelectorAll("[data-moment]").forEach((button) => button.classList.toggle("on", button === moment));
    const act = event.target.closest("[data-act]");
    if (act) act.classList.toggle("on");
  });
  form.querySelector("[name=address]").addEventListener("input", onAddress);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const address = String(data.get("address") || "").trim();
    if (!name || !address) return;
    const care = String(data.get("care") || "").trim();
    let acts = [...form.querySelectorAll("[data-act].on")].map((button) => button.dataset.act);
    if (!acts.length && care) { const guessed = guessAct(care); if (guessed) acts = [guessed]; }
    const passage = { ...patient.passages[0], care, acts, slot: String(data.get("slot")), moment: form.querySelector("[data-moment].on")?.dataset.moment || "matin" };
    const next = patientRecord({
      ...patient, name, address, phone: String(data.get("phone") || "").trim(),
      birth: String(data.get("birth") || ""), doctor: String(data.get("doctor") || "").trim(),
      pharmacy: String(data.get("pharmacy") || "").trim(), note: String(data.get("note") || "").trim(),
      sex: form.querySelector("[data-sex].on")?.dataset.sex || "",
      domicile: data.get("domicile") === "on",
      days: [...form.querySelectorAll("[data-day].on")].map((button) => Number(button.dataset.day)),
      passages: [passage, ...patient.passages.slice(1)],
    });
    if (next.address !== patient.address) { next.lat = null; next.lon = null; next.geoLabel = ""; }
    const index = state.patients.findIndex((item) => item.id === patient.id);
    if (index >= 0) state.patients[index] = next;
    else state.patients.push(next);
    save();
    closeSheet();
    focusId = next.id;
    view = "patient";
    render();
  });
  form.querySelector("#delete-patient")?.addEventListener("click", () => {
    state.patients = state.patients.filter((item) => item.id !== patient.id);
    save();
    closeSheet();
    view = "patients";
    render();
  });
}
async function onAddress(event) {
  const query = event.target.value.trim();
  const list = document.querySelector(".suggest");
  const seq = ++suggestSeq;
  if (!list || query.length < 3) { if (list) list.hidden = true; return; }
  try {
    const rows = await suggest(query);
    if (seq !== suggestSeq) return;
    list.innerHTML = rows.map((row, index) => `<li><button type="button" data-suggest="${index}">${esc(row.label)}</button></li>`).join("");
    list.hidden = !rows.length;
    list.querySelectorAll("[data-suggest]").forEach((button) => button.addEventListener("click", () => {
      document.querySelector("[name=address]").value = rows[Number(button.dataset.suggest)].label;
      list.hidden = true;
    }));
  } catch { list.hidden = true; }
}
function openSettings() {
  const cab = cabinet();
  openSheet(`<form id="settings-form">
    <div class="top"><h2>Réglages</h2><button type="button" class="text" data-close>Fermer</button></div>
    <label class="field">Ton nom<input name="nurse" value="${esc(state.settings.nurse)}" placeholder="Prénom Nom"></label>
    <label class="field">Ville<input name="city" value="${esc(state.settings.city)}" placeholder="Paris"></label>
    <label class="field">RPPS<input name="rpps" value="${esc(state.settings.rpps)}"></label>
    <label class="field">Adresse de départ<input name="caddress" value="${esc(cab.address)}" autocomplete="off"></label>
    <ul class="suggest" hidden></ul>
    <label class="field">Nom de la tournée<input name="cname" value="${esc(cab.name)}"></label>
    <label class="field">Titulaire si tu remplaces<input name="titulaire" value="${esc(cab.titulaire)}"></label>
    <label class="field">Rétrocession %<input name="rate" type="number" min="0" max="100" value="${Number(cab.rate) || 0}"></label>
    <label class="field">GPS<select name="gps"><option value="google" ${state.settings.gps !== "waze" ? "selected" : ""}>Google Maps</option><option value="waze" ${state.settings.gps === "waze" ? "selected" : ""}>Waze</option></select></label>
    <label class="field">Code<input name="pin" inputmode="numeric" maxlength="4" value="${esc(state.settings.pin)}"></label>
    <p class="sub">Signature</p>
    <canvas id="sign" width="320" height="110"></canvas>
    <button type="button" class="text" id="clear-sign">Effacer</button>
    <button class="primary" type="submit">Enregistrer</button>
  </form>`, bindSettings);
}
function bindSettings() {
  const form = document.querySelector("#settings-form");
  const canvas = document.querySelector("#sign");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (state.settings.signature) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = state.settings.signature;
  }
  ctx.strokeStyle = "#6d2446";
  ctx.lineWidth = 2;
  let drawing = false;
  let touched = false;
  let cleared = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * (canvas.width / rect.width), (event.clientY - rect.top) * (canvas.height / rect.height)];
  };
  canvas.onpointerdown = (event) => {
    touched = true; cleared = false; drawing = true;
    const [x, y] = point(event);
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  canvas.onpointermove = (event) => { if (!drawing) return; const [x, y] = point(event); ctx.lineTo(x, y); ctx.stroke(); };
  canvas.onpointerup = () => { drawing = false; };
  form.querySelector("#clear-sign").addEventListener("click", () => { cleared = true; touched = true; state.settings.signature = ""; ctx.fillRect(0, 0, canvas.width, canvas.height); });
  form.querySelector("[data-close]").addEventListener("click", closeSheet);
  form.querySelector("[name=caddress]").addEventListener("input", onAddress);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const pin = String(data.get("pin") || "").replace(/\D/g, "").slice(0, 4);
    state.settings.nurse = String(data.get("nurse") || "").trim();
    state.settings.city = String(data.get("city") || "").trim();
    state.settings.rpps = String(data.get("rpps") || "").trim();
    state.settings.gps = String(data.get("gps") || "google");
    state.settings.pin = pin.length === 4 ? pin : "";
    const cab = cabinet();
    const address = String(data.get("caddress") || "").trim();
    if (address !== cab.address) { cab.lat = null; cab.lon = null; }
    cab.address = address;
    cab.name = String(data.get("cname") || "Tournée 1").trim() || "Tournée 1";
    cab.titulaire = String(data.get("titulaire") || "").trim();
    cab.rate = Math.min(100, Math.max(0, Number(data.get("rate")) || 0));
    if (cleared) state.settings.signature = "";
    else if (touched) state.settings.signature = canvas.toDataURL("image/png");
    save();
    closeSheet();
    render();
  });
}
function setupLock() {
  const pad = document.querySelector("#pad");
  pad.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((key) => key === "" ? "<span></span>" : `<button type="button" data-key="${key}">${key}</button>`).join("");
  let typed = "";
  const dots = document.querySelector("#pin-dots");
  const paint = () => { dots.textContent = `${"●".repeat(typed.length)}${"○".repeat(4 - typed.length)}`; };
  paint();
  pad.addEventListener("click", (event) => {
    const key = event.target.dataset?.key;
    if (!key) return;
    if (key === "⌫") typed = typed.slice(0, -1);
    else if (typed.length < 4) typed += key;
    paint();
    if (typed.length !== 4) return;
    if (typed === String(state.settings.pin || "")) {
      unlocked = true;
      document.body.classList.remove("locked");
      els.lock.hidden = true;
      render();
    } else {
      typed = "";
      paint();
      flash("Code incorrect");
    }
  });
}
document.querySelectorAll("#nav [data-nav]").forEach((button) => button.addEventListener("click", () => {
  const name = button.dataset.nav;
  if (name === "add") { openAdd("new"); return; }
  view = name === "ca" ? "ca" : name === "folder" ? "folder" : name === "patients" ? "patients" : "home";
  render();
}));
setupLock();
if (unlocked) render();
else { document.body.classList.add("locked"); els.lock.hidden = false; }
