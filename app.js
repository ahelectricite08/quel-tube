import {
  CADRES,
  COLORS,
  DRAW_ORDER,
  PRESET_HEMATO,
  yellowCadreCount,
  plan,
  searchTests,
  readOrdonnance,
  colorCounts,
  countLabel,
  pluralColor,
  fragileLabel,
  summaryText,
  cadresFor,
  getTest,
} from "./logic.js";

const STORAGE_KEY = "quel-tube-v1";

const els = {
  result: document.querySelector("#result"),
  search: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  chips: document.querySelector("#chips"),
  catalog: document.querySelector("#catalog"),
  unknown: document.querySelector("#unknown"),
  dock: document.querySelector("#dock"),
  paste: document.querySelector("#paste"),
  activeLabel: document.querySelector("#active-label"),
  tabs: document.querySelector("#tabs"),
};

let state = loadState();

document.querySelector("#preset-both").addEventListener("click", () => loadPreset("both"));
document.querySelector("#preset-before").addEventListener("click", () => loadPreset(0));
document.querySelector("#preset-after").addEventListener("click", () => loadPreset(1));
document.querySelector("#clear-all").addEventListener("click", clearAll);
document.querySelector("#read-paste").addEventListener("click", readPaste);
els.search.addEventListener("input", () => renderSuggestions());
els.search.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const first = searchTests(els.search.value)[0];
    if (first) toggleTest(first.test.id, true);
  }
  if (event.key === "Escape") {
    els.search.value = "";
    renderSuggestions();
  }
});

buildCatalog();
render();

function loadState() {
  const empty = {
    moments: [{ title: "Ce prélèvement", note: "", ids: [] }],
    active: 0,
    unknowns: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved.moments) || !saved.moments.length) return empty;
    saved.moments.forEach((moment) => {
      moment.ids = (moment.ids || []).filter((id) => getTest(id));
      moment.title = moment.title || "Ce prélèvement";
      moment.note = moment.note || "";
    });
    saved.active = Math.min(saved.active || 0, saved.moments.length - 1);
    saved.unknowns = [];
    return saved;
  } catch {
    return empty;
  }
}

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ moments: state.moments, active: state.active })
    );
  } catch {
    /* la page reste utilisable sans mémoire locale */
  }
}

function activeMoment() {
  return state.moments[state.active];
}

function loadPreset(which) {
  const moments = PRESET_HEMATO.map((moment) => ({
    title: moment.title,
    note: moment.note,
    ids: [...moment.ids],
  }));
  state.moments = which === "both" ? moments : [moments[which]];
  state.active = 0;
  state.unknowns = [];
  els.paste.value = "";
  save();
  render();
  document.querySelector("#result").scrollIntoView({ block: "start" });
}

function clearAll() {
  state = {
    moments: [{ title: "Ce prélèvement", note: "", ids: [] }],
    active: 0,
    unknowns: [],
  };
  els.paste.value = "";
  save();
  render();
}

function readPaste() {
  const moments = readOrdonnance(els.paste.value);
  if (!moments.some((moment) => moment.ids.length)) {
    state.unknowns = moments.flatMap((moment) => moment.unknown);
    renderUnknown();
    flash("Aucune analyse reconnue dans ce texte");
    return;
  }
  state.moments = moments.map((moment) => ({
    title: moment.title,
    note: moment.note,
    ids: moment.ids,
  }));
  state.active = 0;
  state.unknowns = moments.flatMap((moment) => moment.unknown);
  save();
  render();
  document.querySelector("#result").scrollIntoView({ block: "start" });
}

function toggleTest(id, forceAdd = false) {
  const moment = activeMoment();
  const has = moment.ids.includes(id);
  if (forceAdd && has) {
    els.search.value = "";
    renderSuggestions();
    return;
  }
  moment.ids = has ? moment.ids.filter((item) => item !== id) : [...moment.ids, id];
  if (forceAdd) els.search.value = "";
  save();
  render();
}

function removeTest(momentIndex, id) {
  state.active = momentIndex;
  const moment = state.moments[momentIndex];
  moment.ids = moment.ids.filter((item) => item !== id);
  save();
  render();
}

function buildCatalog() {
  const byColor = new Map(DRAW_ORDER.map((color) => [color, []]));
  CADRES.forEach((cadre) => byColor.get(cadre.color).push(cadre));
  els.catalog.innerHTML = DRAW_ORDER.map((color) => {
    const cadres = byColor.get(color);
    const total = cadres.reduce((sum, cadre) => sum + cadre.tests.length, 0);
    return `
      <section class="color-block">
        <h3><i class="dot ${color}"></i>${esc(COLORS[color].label)} · ${total} analyses</h3>
        ${cadres
          .map(
            (cadre) => `
          <details class="cadre">
            <summary>
              <span>${esc(cadre.title)}</span>
              <small>${cadre.tests.length}</small>
            </summary>
            <div class="body">
              ${cadre.tests
                .map(
                  (test) => `
                <label class="check">
                  <input type="checkbox" data-id="${esc(test.id)}">
                  <span>${esc(test.label)}${flagLine(test)}</span>
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
    const moment = activeMoment();
    const id = input.dataset.id;
    const has = moment.ids.includes(id);
    if (input.checked && !has) moment.ids = [...moment.ids, id];
    if (!input.checked && has) moment.ids = moment.ids.filter((item) => item !== id);
    save();
    render();
  });
}

function render() {
  renderResult();
  renderTabs();
  renderChips();
  renderSuggestions();
  renderUnknown();
  renderActiveLabel();
  syncChecks();
  renderDock();
}

function renderTabs() {
  if (state.moments.length < 2) {
    els.tabs.hidden = true;
    els.tabs.innerHTML = "";
    return;
  }
  els.tabs.hidden = false;
  els.tabs.innerHTML = state.moments
    .map((moment, index) => {
      const n = plan(moment.ids).length;
      const on = index === state.active ? " on" : "";
      return `<button type="button" class="ghost${on}" data-tab="${index}">${esc(moment.title)} · ${n}</button>`;
    })
    .join("");
  els.tabs.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.active = Number(button.dataset.tab);
      save();
      render();
    });
  });
}

function renderActiveLabel() {
  if (state.moments.length < 2) {
    els.activeLabel.textContent = "";
    return;
  }
  els.activeLabel.textContent = `Les ajouts vont dans : ${activeMoment().title}`;
}

function renderChips() {
  const moment = activeMoment();
  if (!moment.ids.length) {
    els.chips.innerHTML = "";
    return;
  }
  els.chips.innerHTML = moment.ids
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
  const selected = new Set(activeMoment().ids);
  els.suggestions.innerHTML = rows
    .map(({ test }) => {
      const homes = cadresFor(test.id);
      const where =
        homes.length > 1
          ? `${COLORS[homes[0].color].label} · ${homes.map((cadre) => cadre.title).join(" ou ")}`
          : `${COLORS[homes[0].color].label} · ${homes[0].title}`;
      const on = selected.has(test.id);
      return `<button type="button" class="suggest${on ? " on" : ""}" data-add="${esc(test.id)}" role="option">
        <span>${esc(test.label)}</span>
        <small>${esc(where)}</small>
      </button>`;
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
  els.unknown.innerHTML = `<p>Pas trouvé sur le guide, à vérifier à la main :</p><ul>${state.unknowns
    .map((item) => `<li>${esc(item)}</li>`)
    .join("")}</ul>`;
}

function renderResult() {
  const filled = state.moments.filter((moment) => moment.ids.length);
  if (!filled.length) {
    const jaunes = yellowCadreCount();
    els.result.innerHTML = `
      <div class="empty">
        <p class="kicker">En attente de l'ordonnance</p>
        <h2>Le nombre de tubes s'affiche ici.</h2>
        <div class="example">
          <p><strong>Le jaune compte ${jaunes} cadres.</strong> Un cadre, même avec beaucoup d'analyses, c'est 1 tube.</p>
          <p>Créatinine, CRP, calcium, ASAT et ALAT sont le même cadre : <strong>1 tube jaune</strong>.</p>
          <p>Créatinine et troponine sont deux cadres : <strong>2 tubes jaunes</strong>.</p>
          <p>Les ${jaunes} cadres jaunes en même temps : <strong>${jaunes} tubes jaunes</strong>.</p>
        </div>
      </div>
      ${warningsHtml()}`;
    return;
  }

  const several = state.moments.length > 1;
  els.result.innerHTML = `
    ${several ? `<p class="split-warning">Deux prélèvements. Pas le même jour, pas les mêmes tubes d'un coup.</p>` : ""}
    ${state.moments.map((moment, index) => renderMoment(moment, index)).join("")}
    ${warningsHtml()}
    <div class="actions">
      <button type="button" class="solid" id="copy">Copier le résumé</button>
      <button type="button" class="ghost" id="print">Imprimer</button>
    </div>`;

  document.querySelector("#copy").addEventListener("click", copySummary);
  document.querySelector("#print").addEventListener("click", () => window.print());
  els.result.querySelectorAll("[data-drop]").forEach((button) => {
    button.addEventListener("click", () => {
      const [momentIndex, id] = button.dataset.drop.split("|");
      removeTest(Number(momentIndex), id);
    });
  });
}

function renderMoment(moment, index) {
  const tubes = plan(moment.ids);
  if (!tubes.length) {
    return `<article class="moment"><p class="kicker">${esc(moment.title)}</p><p>Aucune analyse dans ce moment.</p></article>`;
  }
  const counts = colorCounts(tubes);
  const repeated = counts.filter((item) => item.n > 1);
  return `
    <article class="moment">
      <p class="kicker">${esc(moment.title)}</p>
      ${moment.note ? `<p class="moment-note">${esc(moment.note)}</p>` : ""}
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
      <p class="order-line">Ordre du guide : ${tubes
        .map((tube) => esc(COLORS[tube.cadre.color].label))
        .join(" → ")}</p>
      ${
        repeated.length
          ? `<p class="split-warning">${repeated
              .map(
                (item) =>
                  `${item.n} tubes ${esc(pluralColor(item.label))} séparés. Un cadre par tube. Ne pas mélanger le sang.`
              )
              .join(" ")}</p>`
          : ""
      }
      <div class="tubes">
        ${tubes.map((tube, step) => renderTube(tube, step, index)).join("")}
      </div>
    </article>`;
}

function renderTube(tube, step, momentIndex) {
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
                `<li>${esc(test.label)}<button type="button" data-drop="${momentIndex}|${esc(test.id)}" aria-label="Retirer ${esc(test.label)}">×</button></li>`
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

function warningsHtml() {
  return `
    <div class="warnings">
      <strong>Avant de partir</strong>
      <p>Ne jamais transférer le sang d'un tube à l'autre.</p>
      <p>Ne pas masquer le niveau de sang avec l'étiquette.</p>
      <p>Analyse urgente ou fragile : la transmettre rapidement au laboratoire.</p>
      <p class="source">Guide bio ard'aisne, fiche PRPRLFC02 version 7.0. Si le sang part dans un autre laboratoire, suis le guide de ce laboratoire.</p>
    </div>`;
}

function renderDock() {
  const filled = state.moments.filter((moment) => moment.ids.length);
  if (!filled.length) {
    els.dock.hidden = true;
    els.dock.innerHTML = "";
    return;
  }
  els.dock.hidden = false;
  if (filled.length > 1) {
    const bits = filled
      .map((moment) => `${plan(moment.ids).length} · ${moment.title}`)
      .join("  ·  ");
    els.dock.innerHTML = `<div><strong>${filled.length} moments</strong><span>${esc(bits)}</span></div><button type="button" class="linkish" id="dock-jump">Voir</button>`;
  } else {
    const tubes = plan(filled[0].ids);
    const brief = colorCounts(tubes)
      .map((item) => countLabel(item.n, item.label))
      .join(" · ");
    els.dock.innerHTML = `<div><strong>${tubes.length} ${tubes.length > 1 ? "tubes" : "tube"}</strong><span>${esc(brief)}</span></div><button type="button" class="linkish" id="dock-jump">Voir</button>`;
  }
  document.querySelector("#dock-jump").addEventListener("click", () => {
    document.querySelector("#result").scrollIntoView({ block: "start" });
  });
}

function syncChecks() {
  const selected = new Set(activeMoment().ids);
  els.catalog.querySelectorAll("input[data-id]").forEach((input) => {
    input.checked = selected.has(input.dataset.id);
  });
}

function flagLine(test) {
  const bits = [];
  if (test.urgent) bits.push("urgente");
  if (test.fragile) bits.push("fragile");
  return bits.length ? `<em>${bits.join(" · ")}</em>` : "";
}

async function copySummary() {
  const text = summaryText(state.moments);
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
