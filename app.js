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
  name: document.querySelector("#patient-name"),
  ordonnance: document.querySelector("#ordonnance-label"),
  saveBox: document.querySelector("#save-box"),
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
  applyParsed(parsePrescription(els.paste.value));
});
document.querySelector("#new-patient").addEventListener("click", () => {
  state = blankState();
  els.paste.value = "";
  els.search.value = "";
  render();
});
document.querySelector("#save-history").addEventListener("click", () => {
  state.name = els.name.value.trim();
  state.ordonnance = els.ordonnance.value.trim();
  if (state.name.length < 2 || state.ordonnance.length < 2) {
    flash("Écris le nom et l'ordonnance");
    return;
  }
  savePatient();
  flash("Enregistré dans l'historique");
  render();
});
els.name.addEventListener("input", () => {
  state.name = els.name.value;
});
els.ordonnance.addEventListener("input", () => {
  state.ordonnance = els.ordonnance.value;
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
    ordonnance: "",
    parts: [],
    active: 0,
    progress: "",
  };
}

function activePart() {
  return state.parts[state.active] || state.parts[0] || { title: "", detail: "", ids: [] };
}

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && item.id && item.name)
      .map((item) => {
        const source = item.parts || item.visits || [];
        return {
          id: item.id,
          name: item.name,
          ordonnance: item.ordonnance || "",
          updatedAt: item.updatedAt || 0,
          parts: source
            .map((part) => ({
              title: part.title || part.whenText || "Un seul prélèvement",
              detail: part.detail || "",
              ids: (part.ids || []).filter((id) => getTest(id)),
            }))
            .filter((part) => part.ids.length),
        };
      })
      .filter((item) => item.parts.length);
  } catch {
    return [];
  }
}

function savePatient() {
  const name = state.name.trim();
  const ordonnance = state.ordonnance.trim();
  if (name.length < 2 || ordonnance.length < 2) return;
  if (!state.parts.some((part) => part.ids.length)) return;
  const history = loadHistory();
  let record = history.find((item) => item.id === state.patientId);
  if (!record) {
    state.patientId = state.patientId || crypto.randomUUID();
    record = { id: state.patientId, name, ordonnance, parts: [], updatedAt: Date.now() };
    history.unshift(record);
  }
  record.name = name;
  record.ordonnance = ordonnance;
  record.updatedAt = Date.now();
  record.parts = state.parts.map((part) => ({
    title: part.title,
    detail: part.detail || "",
    ids: [...part.ids],
  }));
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    flash("Mémoire du téléphone pleine");
  }
}

function applyParsed(parsed) {
  state.patientId = crypto.randomUUID();
  state.name = "";
  state.ordonnance = "";
  state.parts = (parsed.parts || []).map((part) => ({
    title: part.title,
    detail: part.detail || "",
    ids: [...(part.ids || [])],
  }));
  state.active = 0;
  const several = state.parts.length > 1;
  state.progress = several
    ? `${state.parts.length} moments : ${state.parts.map((part) => part.title).join(", ")}.`
    : state.parts[0] && state.parts[0].title !== "Un seul prélèvement"
      ? state.parts[0].title
      : "Un seul prélèvement.";
  render();
  document.querySelector("#result").scrollIntoView({ block: "start" });
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
    const text = result && result.data ? result.data.text : "";
    if (!String(text || "").trim()) {
      state.progress = "La photo est trop floue ou trop sombre. Reprends-la bien à plat, ou colle le texte.";
      renderStatus();
      return;
    }
    applyParsed(parsePrescription(text));
  } catch {
    workerPromise = null;
    state.progress = "La photo n'a pas pu être lue. Recharge la page avec internet, puis réessaie. Tu peux aussi coller le texte.";
    renderStatus();
  }
}

function getWorker() {
  if (!workerPromise) {
    workerPromise = Promise.resolve()
      .then(() => {
        const api = window.Tesseract;
        if (!api || typeof api.createWorker !== "function") {
          throw new Error("lecteur absent");
        }
        return api.createWorker("fra", 1, {
          workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
          logger(message) {
            if (!els.status) return;
            if (message.status === "recognizing text") {
              els.status.textContent = `Lecture de l'ordonnance… ${Math.round((message.progress || 0) * 100)} %`;
            } else {
              els.status.textContent = "Préparation de la lecture…";
            }
          },
        });
      })
      .catch((error) => {
        workerPromise = null;
        throw error;
      });
  }
  return workerPromise;
}

async function prepareImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas;
  } catch {
    return file;
  }
}

function toggleTest(id, forceAdd = false) {
  const part = activePart();
  if (!state.parts.length) {
    state.parts = [{ title: "Un seul prélèvement", detail: "", ids: [] }];
    state.active = 0;
  }
  const target = state.parts[state.active];
  const has = target.ids.includes(id);
  if (forceAdd && has) {
    els.search.value = "";
    renderSuggestions();
    return;
  }
  target.ids = has ? target.ids.filter((item) => item !== id) : [...target.ids, id];
  if (forceAdd) els.search.value = "";
  render();
}

function openPatient(id) {
  const record = loadHistory().find((item) => item.id === id);
  if (!record) return;
  state.patientId = record.id;
  state.name = record.name;
  state.ordonnance = record.ordonnance || "";
  state.parts = record.parts.map((part) => ({ ...part, ids: [...part.ids] }));
  state.active = 0;
  state.progress = "";
  render();
  document.querySelector("#result").scrollIntoView({ block: "start" });
}

function deletePatient(id) {
  const history = loadHistory().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  if (state.patientId === id) state = blankState();
  render();
}

function render() {
  syncIdentity();
  renderResult();
  renderChips();
  renderSuggestions();
  renderHistory();
  syncChecks();
  renderDock();
  renderStatus();
}

function syncIdentity() {
  if (document.activeElement !== els.name) els.name.value = state.name;
  if (document.activeElement !== els.ordonnance) els.ordonnance.value = state.ordonnance;
  const hasTubes = state.parts.some((part) => part.ids.length);
  els.saveBox.hidden = !hasTubes;
}

function renderStatus() {
  els.status.textContent = state.progress || "";
}

function renderResult() {
  const visible = state.parts.filter((part) => part.ids.length);
  if (!visible.length) {
    els.result.innerHTML = `
      <div class="empty">
        <p class="kicker">Tubes</p>
        <h2>Ils s'affichent ici, après la photo.</h2>
        <p class="moment-note">S'il y a un avant et un après, tu verras les deux. Sinon, un seul prélèvement.</p>
      </div>`;
    return;
  }
  els.result.innerHTML = `
    ${visible
      .map((part) => {
        const index = state.parts.indexOf(part);
        return renderPart(part, index);
      })
      .join("")}
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
  els.result.querySelectorAll("[data-select-part]").forEach((button) => {
    button.addEventListener("click", () => {
      state.active = Number(button.dataset.selectPart);
      render();
    });
  });
  els.result.querySelectorAll("[data-drop]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const [partIndex, id] = button.dataset.drop.split("|");
      state.active = Number(partIndex);
      toggleTest(id);
    });
  });
}

function renderPart(part, index) {
  const tubes = plan(part.ids);
  const counts = colorCounts(tubes);
  const repeated = counts.filter((item) => item.n > 1);
  const on = index === state.active && state.parts.length > 1 ? " part-on" : "";
  return `
    <article class="moment${on}">
      <button type="button" class="part-title" data-select-part="${index}">${esc(part.title)}</button>
      ${part.detail ? `<p class="moment-note">${esc(part.detail)}</p>` : ""}
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
      <p class="order-line">Ordre : ${tubes.map((tube) => esc(COLORS[tube.cadre.color].label)).join(" → ")}</p>
      ${
        repeated.length
          ? `<p class="split-warning">${repeated
              .map((item) => `${item.n} tubes ${esc(pluralColor(item.label))} séparés. Un cadre par tube. Ne pas mélanger le sang.`)
              .join(" ")}</p>`
          : ""
      }
      <div class="tubes">${tubes.map((tube, step) => renderTube(tube, step, index)).join("")}</div>
    </article>`;
}

function renderTube(tube, step, partIndex) {
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
                `<li>${esc(test.label)}<button type="button" data-drop="${partIndex}|${esc(test.id)}" aria-label="Retirer ${esc(test.label)}">×</button></li>`
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
  const part = activePart();
  const label = document.querySelector("label[for=search]");
  if (label) {
    label.textContent = state.parts.length > 1 ? `Ajouter une analyse dans ${part.title}` : "Ajouter une analyse";
  }
  els.chips.innerHTML = (part.ids || [])
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
  const selected = new Set(activePart().ids || []);
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

function renderHistory() {
  const query = norm(els.historySearch.value);
  const patients = loadHistory()
    .filter((item) => !query || norm(`${item.name} ${item.ordonnance}`).includes(query))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (!patients.length) {
    els.history.innerHTML = `<p class="history-note">${query ? "Rien avec ce nom." : "Rien dans l'historique."}</p>`;
    return;
  }
  els.history.innerHTML = patients
    .map((patient) => {
      const lines = patient.parts
        .map((part) => {
          const count = plan(part.ids).length;
          return `${esc(part.title)} · ${count} ${count > 1 ? "tubes" : "tube"}`;
        })
        .join("<br>");
      const on = state.patientId === patient.id ? " on" : "";
      return `
        <article class="history-card">
          <div class="history-top">
            <strong>${esc(patient.name)}</strong>
            <button type="button" class="text-btn" data-delete="${esc(patient.id)}">Supprimer</button>
          </div>
          <button type="button" class="visit-btn${on}" data-open="${esc(patient.id)}">
            ${esc(patient.ordonnance || "Ordonnance")}<br>${lines}
          </button>
        </article>`;
    })
    .join("");
  els.history.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => openPatient(button.dataset.open));
  });
  els.history.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deletePatient(button.dataset.delete));
  });
}

function renderDock() {
  const total = state.parts.reduce((sum, part) => sum + plan(part.ids).length, 0);
  if (!total) {
    els.dock.hidden = true;
    return;
  }
  els.dock.hidden = false;
  const brief = state.parts
    .filter((part) => part.ids.length)
    .map((part) => `${part.title} ${plan(part.ids).length}`)
    .join(" · ");
  els.dock.innerHTML = `<div><strong>${total} ${total > 1 ? "tubes" : "tube"}</strong><span>${esc(brief)}</span></div><button type="button" class="linkish" id="dock-jump">Voir</button>`;
  document.querySelector("#dock-jump").addEventListener("click", () => {
    document.querySelector("#result").scrollIntoView({ block: "start" });
  });
}

function syncChecks() {
  const selected = new Set(activePart().ids || []);
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
    if (!state.parts.length) {
      state.parts = [{ title: "Un seul prélèvement", detail: "", ids: [] }];
      state.active = 0;
    }
    const part = state.parts[state.active];
    const has = part.ids.includes(input.dataset.id);
    if (input.checked && !has) part.ids = [...part.ids, input.dataset.id];
    if (!input.checked && has) part.ids = part.ids.filter((id) => id !== input.dataset.id);
    render();
  });
}

async function copySummary() {
  const moments = state.parts
    .filter((part) => part.ids.length)
    .map((part) => ({
      title: part.title,
      note: [state.name, state.ordonnance, part.detail].filter(Boolean).join(" · "),
      ids: part.ids,
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
