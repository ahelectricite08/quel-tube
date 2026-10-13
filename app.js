import {
  CADRES,
  COLORS,
  DRAW_ORDER,
  plan,
  searchTests,
  parsePrescription,
  colorCounts,
  countLabel,
  pluralColor,
  fragileLabel,
  summaryText,
  cadresFor,
  getTest,
  formatFrenchDate,
  norm,
} from "./logic.js";

const HISTORY_KEY = "quel-tube-historique-v1";

const els = {
  result: document.querySelector("#result"),
  search: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  chips: document.querySelector("#chips"),
  catalog: document.querySelector("#catalog"),
  unknown: document.querySelector("#unknown"),
  dock: document.querySelector("#dock"),
  paste: document.querySelector("#paste"),
  tabs: document.querySelector("#visit-tabs"),
  date: document.querySelector("#visit-date"),
  name: document.querySelector("#patient-name"),
  when: document.querySelector("#when-read"),
  status: document.querySelector("#ocr-status"),
  history: document.querySelector("#history"),
  historySearch: document.querySelector("#history-search"),
};

let state = blankState();
let workerPromise = null;

document.querySelector("#take-photo").addEventListener("click", () => {
  document.querySelector("#camera-input").click();
});
document.querySelector("#pick-photo").addEventListener("click", () => {
  document.querySelector("#gallery-input").click();
});
document.querySelector("#camera-input").addEventListener("change", onFile);
document.querySelector("#gallery-input").addEventListener("change", onFile);
document.querySelector("#read-paste").addEventListener("click", () => {
  applyParsed(parsePrescription(els.paste.value), { mergeByName: true });
});
document.querySelector("#new-patient").addEventListener("click", () => {
  state = blankState();
  els.paste.value = "";
  els.search.value = "";
  render();
  els.name.focus();
});

els.date.addEventListener("change", () => {
  const visit = activeVisit();
  visit.date = els.date.value;
  visit.whenText = "";
  savePatient();
  render();
});
els.name.addEventListener("input", () => {
  state.name = els.name.value;
});
els.name.addEventListener("change", () => {
  state.name = els.name.value;
  savePatient();
  render();
});
els.search.addEventListener("input", () => renderSuggestions());
els.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = searchTests(els.search.value)[0];
    if (first) toggleTest(first.test.id, true);
  }
});
els.historySearch.addEventListener("input", () => renderHistory());

buildCatalog();
render();

function blankState() {
  return {
    patientId: null,
    name: "",
    visits: [{ date: "", whenText: "", ids: [] }],
    active: 0,
    unknowns: [],
    progress: "",
  };
}

function activeVisit() {
  return state.visits[state.active] || state.visits[0];
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && item.id && item.name)
      .map((item) => ({
        id: item.id,
        name: item.name,
        updatedAt: item.updatedAt || 0,
        visits: (item.visits || [])
          .map((visit) => ({
            date: visit.date || "",
            whenText: visit.whenText || "",
            ids: (visit.ids || []).filter((id) => getTest(id)),
          }))
          .filter((visit) => visit.date || visit.ids.length),
      }))
      .filter((item) => item.visits.length || item.name);
  } catch {
    return [];
  }
}

function savePatient(options = {}) {
  const name = state.name.trim();
  if (name.length < 2) return;
  const useful = state.visits.some((visit) => visit.date || visit.ids.length);
  if (!useful) return;
  const history = loadHistory();
  let record = history.find((item) => item.id === state.patientId);
  if (!record && options.mergeByName) {
    record = history.find((item) => norm(item.name) === norm(name));
    if (record) state.patientId = record.id;
  }
  if (!record) {
    state.patientId = state.patientId || crypto.randomUUID();
    record = { id: state.patientId, name, visits: [], updatedAt: Date.now() };
    history.unshift(record);
  }
  if (options.mergeByName && record.visits.length) {
    const merged = record.visits.map((visit) => ({ ...visit, ids: [...visit.ids] }));
    state.visits.forEach((visit) => {
      const index = visit.date ? merged.findIndex((item) => item.date === visit.date) : -1;
      const next = { date: visit.date, whenText: visit.whenText, ids: [...visit.ids] };
      if (index >= 0) merged[index] = next;
      else merged.push(next);
    });
    state.visits = merged.sort(byDate);
    state.active = Math.min(state.active, state.visits.length - 1);
  }
  record.name = name;
  record.updatedAt = Date.now();
  record.visits = state.visits.map((visit) => ({
    date: visit.date || "",
    whenText: visit.whenText || "",
    ids: [...visit.ids],
  }));
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    flash("Mémoire du téléphone pleine");
  }
}

function byDate(a, b) {
  if (a.date && b.date) return a.date.localeCompare(b.date);
  if (a.date) return -1;
  if (b.date) return 1;
  return 0;
}

function applyParsed(parsed, options = {}) {
  state.patientId = crypto.randomUUID();
  state.name = parsed.name || "";
  state.visits = (parsed.visits.length ? parsed.visits : [{ date: "", whenText: "", ids: [] }]).map((visit) => ({
    date: visit.date || "",
    whenText: visit.whenText || "",
    ids: [...(visit.ids || [])],
  }));
  state.active = 0;
  state.unknowns = [...new Set(parsed.visits.flatMap((visit) => visit.unknown || []))];
  state.progress = state.name ? "Ordonnance lue." : "Nom non lu. Écris-le sous la date.";
  savePatient({ mergeByName: options.mergeByName });
  render();
  if (!state.name) els.name.focus();
  else document.querySelector("#result").scrollIntoView({ block: "start" });
}

async function onFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file) return;
  state.progress = "Préparation de la photo…";
  renderStatus();
  try {
    const image = await prepareImage(file);
    const worker = await getWorker();
    const result = await worker.recognize(image);
    applyParsed(parsePrescription(result.data.text), { mergeByName: true });
  } catch {
    workerPromise = null;
    state.progress = "Photo non lue. Internet est utile la première fois. Tu peux coller le texte, ou remplir la date et le nom à la main.";
    renderStatus();
  }
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = import("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js").then(
      ({ createWorker }) =>
        createWorker("fra", 1, {
          logger(message) {
            if (!els.status) return;
            if (message.status === "recognizing text") {
              els.status.textContent = `Lecture de l'ordonnance… ${Math.round((message.progress || 0) * 100)} %`;
            } else {
              els.status.textContent = "Préparation de la lecture…";
            }
          },
        })
    );
  }
  return workerPromise;
}

async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.3 + pixels[i + 1] * 0.59 + pixels[i + 2] * 0.11;
    const contrasted = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
    pixels[i] = contrasted;
    pixels[i + 1] = contrasted;
    pixels[i + 2] = contrasted;
  }
  ctx.putImageData(image, 0, 0);
  bitmap.close();
  return canvas;
}

function toggleTest(id, forceAdd = false) {
  const visit = activeVisit();
  const has = visit.ids.includes(id);
  if (forceAdd && has) {
    els.search.value = "";
    renderSuggestions();
    return;
  }
  visit.ids = has ? visit.ids.filter((item) => item !== id) : [...visit.ids, id];
  if (forceAdd) els.search.value = "";
  savePatient();
  render();
}

function openPatient(id, visitIndex) {
  const record = loadHistory().find((item) => item.id === id);
  if (!record) return;
  state.patientId = record.id;
  state.name = record.name;
  state.visits = record.visits.length
    ? record.visits.map((visit) => ({ ...visit, ids: [...visit.ids] }))
    : [{ date: "", whenText: "", ids: [] }];
  state.active = Math.min(visitIndex, state.visits.length - 1);
  state.unknowns = [];
  state.progress = "";
  render();
  els.date.scrollIntoView({ block: "start" });
}

function deletePatient(id) {
  const history = loadHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  if (state.patientId === id) state = blankState();
  render();
}

function render() {
  syncIdentity();
  renderTabs();
  renderWhen();
  renderResult();
  renderChips();
  renderSuggestions();
  renderUnknown();
  renderHistory();
  syncChecks();
  renderDock();
  renderStatus();
}

function syncIdentity() {
  const visit = activeVisit();
  if (document.activeElement !== els.date) els.date.value = visit.date || "";
  if (document.activeElement !== els.name) els.name.value = state.name;
}

function renderWhen() {
  const visit = activeVisit();
  els.when.textContent = visit.whenText ? `Date lue : ${visit.whenText}` : "";
}

function renderStatus() {
  els.status.textContent = state.progress || "";
}

function renderTabs() {
  if (state.visits.length < 2) {
    els.tabs.hidden = true;
    els.tabs.innerHTML = "";
    return;
  }
  els.tabs.hidden = false;
  els.tabs.innerHTML = state.visits
    .map((visit, index) => {
      const on = index === state.active ? " on" : "";
      const label = formatFrenchDate(visit.date) || `Date ${index + 1}`;
      return `<button type="button" class="ghost${on}" data-tab="${index}">${esc(label)} · ${plan(visit.ids).length}</button>`;
    })
    .join("");
  els.tabs.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.active = Number(button.dataset.tab);
      savePatient();
      render();
    });
  });
}

function renderResult() {
  const visit = activeVisit();
  const tubes = plan(visit.ids);
  if (!tubes.length) {
    els.result.innerHTML = `
      <div class="empty">
        <p class="kicker">Tubes</p>
        <h2>Ils s'affichent sous la date et le nom.</h2>
        <p class="moment-note">Un cadre du guide = un tube. Plusieurs analyses du même cadre restent dans le même tube.</p>
      </div>`;
    return;
  }
  const counts = colorCounts(tubes);
  const repeated = counts.filter((item) => item.n > 1);
  els.result.innerHTML = `
    <article class="moment">
      <p class="kicker">Tubes pour ${esc(formatFrenchDate(visit.date) || "cette date")}</p>
      ${state.name ? `<p class="moment-note">${esc(state.name)}</p>` : ""}
      <div class="count-row">
        <p class="count">${tubes.length}<span>${tubes.length > 1 ? "tubes" : "tube"}</span></p>
        <div class="counts">
          ${counts
            .map(
              (item) =>
                `<span class="count-pill" style="background:${COLORS[item.color].body};color:${COLORS[item.color].ink}">${esc(countLabel(item.n, item.label))}</span>`
            )
            .join("")}
        </div>
      </div>
      <p class="order-line">Ordre du guide : ${tubes.map((tube) => esc(COLORS[tube.cadre.color].label)).join(" → ")}</p>
      ${
        repeated.length
          ? `<p class="split-warning">${repeated
              .map((item) => `${item.n} tubes ${esc(pluralColor(item.label))} séparés. Un cadre par tube. Ne pas mélanger le sang.`)
              .join(" ")}</p>`
          : ""
      }
      <div class="tubes">${tubes.map((tube, step) => renderTube(tube, step)).join("")}</div>
    </article>
    <div class="warnings">
      <strong>À retenir</strong>
      <p>Ne jamais transférer le sang d'un tube à l'autre.</p>
      <p>Ne pas masquer le niveau de sang avec l'étiquette.</p>
      <p>Analyse urgente ou fragile : la transmettre rapidement au laboratoire.</p>
      <p class="source">Guide bio ard'aisne, fiche PRPRLFC02 version 7.0.</p>
    </div>
    <div class="actions">
      <button type="button" class="solid" id="copy">Copier le résumé</button>
      <button type="button" class="ghost" id="print">Imprimer</button>
    </div>`;
  document.querySelector("#copy").addEventListener("click", copySummary);
  document.querySelector("#print").addEventListener("click", () => window.print());
  els.result.querySelectorAll("[data-drop]").forEach((button) => {
    button.addEventListener("click", () => toggleTest(button.dataset.drop));
  });
}

function renderTube(tube, step) {
  const color = COLORS[tube.cadre.color];
  const urgents = tube.tests.filter((test) => test.urgent);
  const fragiles = tube.tests.filter((test) => test.fragile);
  return `
    <article class="tube">
      <div class="drawing" aria-hidden="true">
        <div class="cap" style="background:${color.cap}"></div>
        <div class="vial" style="background:linear-gradient(#fff, ${color.body})"></div>
      </div>
      <div>
        <p class="step" style="color:${color.ink}">${step + 1} · ${esc(color.label)}</p>
        <h3>1 tube ${esc(color.label.toLowerCase())}</h3>
        <p class="cadre-name">${esc(tube.cadre.title)}</p>
        <ul class="analyses">
          ${tube.tests
            .map(
              (test) =>
                `<li>${esc(test.label)}<button type="button" data-drop="${esc(test.id)}" aria-label="Retirer ${esc(test.label)}">×</button></li>`
            )
            .join("")}
        </ul>
        <div class="badges">
          ${urgents.length ? `<span class="badge urgent">Urgent · ${esc(urgents.map((test) => test.label).join(", "))}</span>` : ""}
          ${fragiles.length ? `<span class="badge fragile">Fragile · ${esc(fragiles.map(fragileLabel).join(", "))}</span>` : ""}
        </div>
        ${tube.cadre.hint ? `<p class="tube-hint">${esc(tube.cadre.hint)}</p>` : ""}
      </div>
    </article>`;
}

function renderChips() {
  const visit = activeVisit();
  els.chips.innerHTML = visit.ids
    .map((id) => {
      const test = getTest(id);
      const cadre = cadresFor(id)[0];
      if (!test || !cadre) return "";
      return `<span class="chip"><i class="dot ${cadre.color}"></i>${esc(test.label)}<button type="button" data-remove="${esc(id)}" aria-label="Retirer ${esc(test.label)}">×</button></span>`;
    })
    .join("");
  els.chips.querySelectorAll("[data-remove]").forEach((button) => {
    button.addEventListener("click", () => toggleTest(button.dataset.remove));
  });
}

function renderSuggestions() {
  const rows = searchTests(els.search.value);
  if (!rows.length) {
    els.suggestions.innerHTML = "";
    return;
  }
  const selected = new Set(activeVisit().ids);
  els.suggestions.innerHTML = rows
    .map(({ test }) => {
      const homes = cadresFor(test.id);
      const where = `${COLORS[homes[0].color].label} · ${homes[0].title}`;
      const on = selected.has(test.id) ? " on" : "";
      return `<button type="button" class="suggest${on}" data-add="${esc(test.id)}"><span>${esc(test.label)}</span><small>${esc(where)}</small></button>`;
    })
    .join("");
  els.suggestions.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => toggleTest(button.dataset.add, true));
  });
}

function renderUnknown() {
  if (!state.unknowns.length) {
    els.unknown.innerHTML = "";
    return;
  }
  els.unknown.innerHTML = `<p>Pas trouvé sur le guide :</p><ul>${state.unknowns
    .map((item) => `<li>${esc(item)}</li>`)
    .join("")}</ul>`;
}

function renderHistory() {
  const query = norm(els.historySearch.value);
  const patients = loadHistory()
    .filter((item) => !query || norm(item.name).includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!patients.length) {
    els.history.innerHTML = `<p class="history-note">${query ? "Aucun patient avec ce nom." : "Aucun patient pour l'instant."}</p>`;
    return;
  }
  els.history.innerHTML = patients
    .map((patient) => {
      const visits = [...patient.visits].sort(byDate);
      return `
        <article class="history-card">
          <div class="history-top">
            <strong>${esc(patient.name)}</strong>
            <button type="button" class="text-btn" data-delete="${esc(patient.id)}">Supprimer</button>
          </div>
          ${visits
            .map((visit, index) => {
              const original = patient.visits.indexOf(visits[index]);
              const date = formatFrenchDate(visit.date) || "Date à préciser";
              const count = plan(visit.ids).length;
              const on = state.patientId === patient.id && state.active === original ? " on" : "";
              return `<button type="button" class="visit-btn${on}" data-open="${esc(patient.id)}" data-visit="${original}">${esc(date)} · ${count} ${count > 1 ? "tubes" : "tube"}</button>`;
            })
            .join("")}
        </article>`;
    })
    .join("");
  els.history.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openPatient(button.dataset.open, Number(button.dataset.visit)));
  });
  els.history.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deletePatient(button.dataset.delete));
  });
}

function renderDock() {
  const visit = activeVisit();
  const tubes = plan(visit.ids);
  if (!tubes.length && !state.name) {
    els.dock.hidden = true;
    return;
  }
  els.dock.hidden = false;
  const brief = [state.name || "Sans nom", formatFrenchDate(visit.date) || "date à préciser"].join(" · ");
  els.dock.innerHTML = `<div><strong>${tubes.length} ${tubes.length > 1 ? "tubes" : "tube"}</strong><span>${esc(brief)}</span></div><button type="button" class="linkish" id="dock-jump">Voir</button>`;
  document.querySelector("#dock-jump").addEventListener("click", () => {
    document.querySelector("#result").scrollIntoView({ block: "start" });
  });
}

function syncChecks() {
  const selected = new Set(activeVisit().ids);
  els.catalog.querySelectorAll("input[data-id]").forEach((input) => {
    input.checked = selected.has(input.dataset.id);
  });
}

function buildCatalog() {
  const byColor = new Map(DRAW_ORDER.map((color) => [color, []]));
  CADRES.forEach((cadre) => byColor.get(cadre.color).push(cadre));
  els.catalog.innerHTML = DRAW_ORDER.map((color) => {
    const cadres = byColor.get(color);
    return `
      <section class="color-block">
        <h3><i class="dot ${color}"></i>${esc(COLORS[color].label)}</h3>
        ${cadres
          .map(
            (cadre) => `
          <details class="cadre">
            <summary><span>${esc(cadre.title)}</span><small>${cadre.tests.length}</small></summary>
            <div class="body">
              ${cadre.tests
                .map(
                  (test) => `
                <label class="check">
                  <input type="checkbox" data-id="${esc(test.id)}">
                  <span>${esc(test.label)}</span>
                </label>`
                )
                .join("")}
            </div>
          </details>`
          )
          .join("")}
      </section>`;
  }).join("");
  els.catalog.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-id]");
    if (!input) return;
    const visit = activeVisit();
    const has = visit.ids.includes(input.dataset.id);
    if (input.checked && !has) visit.ids = [...visit.ids, input.dataset.id];
    if (!input.checked && has) visit.ids = visit.ids.filter((id) => id !== input.dataset.id);
    savePatient();
    render();
  });
}

async function copySummary() {
  const moments = state.visits
    .filter((visit) => visit.ids.length)
    .map((visit) => ({
      title: state.name || "Patient",
      note: formatFrenchDate(visit.date) || visit.whenText || "Date à préciser",
      ids: visit.ids,
    }));
  const text = summaryText(moments);
  try {
    await navigator.clipboard.writeText(text);
    flash("Résumé copié");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    flash("Résumé copié");
  }
}

function flash(message) {
  const node = document.createElement("div");
  node.className = "flash";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1800);
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
