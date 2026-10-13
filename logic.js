/**
 * Guide des bouchons — Laboratoire bio ard'aisne
 * Document PRPRLFC02 version 7.0 « Choix des tubes (bouchons) »
 *
 * Règle du guide : un tube par cadre.
 * Les analyses d'un même cadre partagent un tube.
 * Deux cadres de la même couleur = deux tubes.
 * Exemple du guide : (NFS + HbA1c) + (Groupe) = 2 tubes violets.
 */

export const COLORS = {
  bleu: { label: "Bleu", cap: "#1d8fd0", body: "#d7f0ff", ink: "#0c3f5c" },
  jaune: { label: "Jaune", cap: "#e2ae12", body: "#fff1c2", ink: "#4a3704" },
  rouge: { label: "Rouge", cap: "#d23b3b", body: "#ffd8d4", ink: "#6d1212" },
  vert: { label: "Vert", cap: "#1e9a55", body: "#d7f5e4", ink: "#0d4a28" },
  violet: { label: "Violet", cap: "#a347b0", body: "#f6e2f6", ink: "#4e1758" },
  gris: { label: "Gris", cap: "#8a8f94", body: "#ececec", ink: "#2c3134" },
};

export const DRAW_ORDER = ["bleu", "jaune", "rouge", "vert", "violet", "gris"];

function t(id, label, aliases = [], flags = {}) {
  return { id, label, aliases, ...flags };
}

export const CADRES = [
  {
    id: "bleu-hemostase",
    color: "bleu",
    order: 10,
    title: "Hémostase",
    hint: "Un seul tube bleu pour tout ce cadre.",
    tests: [
      t("ddimeres", "D-dimères", ["d-dimeres", "ddimeres", "d dimeres", "dimeres", "d-dimer"], { urgent: true }),
      t("tp", "TP (INR)", ["tp", "inr", "taux de prothrombine", "taux de prothrombine inr"], { urgent: true }),
      t("fibrinogene", "Fibrinogène", ["fibrinogene"], { urgent: true }),
      t("tca", "TCA", ["tca", "tck"], { fragile: true }),
      t("antixa", "Anti-Xa", ["anti-xa", "anti xa", "antixa", "activite anti-xa", "activite anti xa"], { fragile: true }),
      t("heparinemie", "Héparinémie", ["heparinemie"], { fragile: true }),
    ],
  },
  {
    id: "jaune-biochimie",
    color: "jaune",
    order: 20,
    title: "Biochimie",
    hint: "Tout ce cadre tient dans un seul tube jaune.",
    tests: [
      t("acide-urique", "Acide urique", ["acide urique", "uricemie"]),
      t("albumine", "Albumine", ["albumine", "albuminemie"]),
      t("alcoolemie", "Alcoolémie", ["alcoolemie", "ethanol", "ethanolémie", "ethanolemie"]),
      t("amylase", "Amylase", ["amylase", "amylasemie"]),
      t("apoa", "Apo A", ["apo a", "apoa", "apolipoproteine a"]),
      t("bilirubine", "Bilirubine", ["bilirubine", "bili", "bilirubine totale"]),
      t("calcium", "Calcium (calcémie)", ["calcium", "calcemie"]),
      t("cholesterol", "Cholestérol total", ["cholesterol total", "cholesterol"]),
      t("cpk", "CPK", ["cpk", "ck"]),
      t("creatinine", "Créatinine", ["creatinine", "creatininemie", "creat"]),
      t("crp", "CRP", ["crp", "proteine c reactive", "proteine c reactive"]),
      t("fer", "Fer et saturation", ["fer et saturation", "fer serique", "fer sérique", "coefficient de saturation", "saturation de la transferrine", "fer"]),
      t("ferritine", "Ferritine", ["ferritine"]),
      t("ggt", "GGT", ["ggt", "g gt", "gamma gt", "gamma-gt", "gammaglutamyl", "gamma glutamyl transferase"]),
      t("hdl", "HDL", ["hdl", "cholesterol hdl", "hdl cholesterol"]),
      t("ionogramme", "Ionogramme", ["ionogramme", "ionogramme sanguin", "iono", "natrémie", "natremie", "sodium", "chlore", "chlorure"], { fragile: true, fragileNote: "potassium" }),
      t("lipase", "Lipase", ["lipase", "lipasemie"]),
      t("magnesium", "Magnésium", ["magnesium", "magnesemie"]),
      t("pal", "PAL", ["pal", "phosphatases alcalines", "phosphatase alcaline"]),
      t("asat", "ASAT", ["asat", "sgot", "tgo", "got", "transaminases", "transaminase"]),
      t("alat", "ALAT", ["alat", "sgpt", "tgp", "gpt", "transaminases", "transaminase"]),
      t("transferrine", "Transferrine", ["transferrine"]),
      t("triglycerides", "Triglycérides", ["triglycerides", "triglyceride"]),
      t("uree", "Urée", ["uree", "azotemie"]),
      t("potassium", "Potassium", ["potassium", "kaliemie", "kaliémie"], { fragile: true }),
      t("ldh", "LDH", ["ldh", "lactate deshydrogenase", "lactico deshydrogenase"], { fragile: true }),
      t("phosphore", "Phosphore", ["phosphore", "phosphoremie", "phosphorémie"], { fragile: true }),
    ],
  },
  {
    id: "jaune-dosages",
    color: "jaune",
    order: 21,
    title: "Dosages particuliers",
    hint: "Deuxième tube jaune, à part de la biochimie.",
    tests: [
      t("aslo", "ASLO", ["aslo", "antistreptolysines"]),
      t("b2", "B2 microglobuline", ["b2 microglobuline", "beta 2 microglobuline", "bêta-2 microglobuline"]),
      t("digoxine", "Digoxine", ["digoxine", "digoxinemie"]),
      t("lithium", "Lithium", ["lithium", "lithiemie"]),
      t("facteur-rhumatoide", "Facteur rhumatoïde", ["facteur rhumatoide", "facteur rhumatoïde"]),
      t("haptoglobine", "Haptoglobine", ["haptoglobine"]),
      t("iga", "IgA", ["iga", "immunoglobuline a"]),
      t("igg", "IgG", ["igg", "immunoglobuline g"]),
      t("igm", "IgM", ["igm", "immunoglobuline m"]),
      t("orosomucoide", "Orosomucoïde", ["orosomucoide"]),
      t("paracetamol", "Paracétamol", ["paracetamol", "paracetamolemie"]),
      t("prealbumine", "Préalbumine", ["prealbumine", "pre albumine"]),
    ],
  },
  {
    id: "jaune-cardio",
    color: "jaune",
    order: 22,
    title: "Troponine, NT-proBNP, procalcitonine",
    hint: "Tube jaune à part. Analyses urgentes.",
    tests: [
      t("procalcitonine", "Procalcitonine", ["procalcitonine", "pct"], { urgent: true }),
      t("ntprobnp", "NT-proBNP", ["nt-probnp", "nt probnp", "ntpro bnp", "ntprobnp", "probnp", "nt pro bnp", "n t probnp"], { urgent: true }),
      t("troponine", "Troponine", ["troponine", "troponine i", "troponine ic", "tni", "hs tni", "troponine us", "troponine ultrasensible"], { urgent: true }),
    ],
  },
  {
    id: "jaune-medicaments",
    color: "jaune",
    order: 23,
    title: "Médicaments (benzo, tricycliques, phénobarbital)",
    hint: "Tube jaune à part.",
    tests: [
      t("benzodiazepines", "Benzodiazépines", ["benzodiazepines", "benzodiazepine", "benzo"]),
      t("tricycliques", "Antidépresseurs tricycliques", ["antidepresseurs tricycliques", "tricycliques", "antidepresseur tricyclique"]),
      t("phenobarbital", "Phénobarbital", ["phenobarbital", "gardenal"]),
    ],
  },
  {
    id: "jaune-epp",
    color: "jaune",
    order: 24,
    title: "Électrophorèse des protéines",
    hint: "Tube jaune à part.",
    tests: [
      t("epp", "Électrophorèse des protéines", ["electrophorese des proteines", "electrophorese", "epp", "electrophorese des protides"]),
      t("iepp", "Immuno-électrophorèse", ["immuno-electrophorese", "immuno electrophorese", "immunoelectrophorese", "iepp", "immunofixation"]),
    ],
  },
  {
    id: "jaune-hormones",
    color: "jaune",
    order: 25,
    title: "Hormones et marqueurs",
    hint: "Un seul tube jaune pour tout ce cadre.",
    tests: [
      t("hcg", "HCG", ["hcg", "beta hcg", "bhcg", "b hcg", "beta-hcg"]),
      t("estradiol", "Estradiol", ["estradiol", "oestradiol"]),
      t("fsh", "FSH", ["fsh"]),
      t("lh", "LH", ["lh"]),
      t("progesterone", "Progestérone", ["progesterone"]),
      t("prolactine", "Prolactine", ["prolactine", "prolactinemie"]),
      t("testosterone", "Testostérone", ["testosterone", "testosteronemie"]),
      t("ace", "ACE", ["ace", "antigene carcino embryonnaire", "antigene carcinoembryonnaire"]),
      t("afp", "AFP", ["afp", "alpha foetoproteine", "alpha-foetoproteine"]),
      t("ca153", "CA 15-3", ["ca 15-3", "ca 15 3", "ca153", "ca 153"]),
      t("ca125", "CA 125", ["ca 125", "ca125"]),
      t("ca199", "CA 19-9", ["ca 19-9", "ca 19 9", "ca199", "ca 199"]),
      t("pth", "PTH", ["pth", "parathormone"]),
      t("psa", "PSA", ["psa", "psa total"]),
      t("psa-libre", "PSA libre", ["psa libre", "psa l"], { fragile: true }),
      t("ft3", "FT3", ["ft3", "t3 libre", "t3l"]),
      t("ft4", "FT4", ["ft4", "t4 libre", "t4l"]),
      t("tsh", "TSH", ["tsh", "thyreostimuline"]),
      t("cortisol", "Cortisol", ["cortisol", "cortisolemie"]),
      t("folates", "Folates (B9)", ["folates", "folate", "b9", "vitamine b9", "acide folique"]),
      t("b12", "Vitamine B12", ["vitamine b12", "b12", "vit b12", "cobalamine"]),
      t("vitd", "Vitamine D", ["vitamine d", "vit d", "25 oh", "25-oh vitamine d"]),
      t("aan", "Ac anti-nucléaires", ["ac anti nucleaires", "ac anti-nucleaires", "anticorps anti nucleaires", "aan", "ac antinucleaires"]),
      t("anticcp", "Ac anti-CCP", ["ac anti ccp", "anti ccp", "ac anti-ccp", "anticorps anti ccp"]),
      t("antithyroidiens", "Ac anti-thyroïdiens", ["ac anti thyroidiens", "anti tpo", "anticorps anti thyroidiens", "anti thyroglobuline", "ac anti-thyroidiens"]),
      t("transglutaminase", "Ac anti-transglutaminase", ["ac anti transglutaminase", "anti transglutaminase", "attg", "igg anti transglutaminase"]),
      t("phospholipides", "Ac anti-phospholipides", ["ac anti phospholipides", "anti phospholipides", "anticardiolipine", "anticorps anti phospholipides"]),
    ],
  },
  {
    id: "jaune-serologies",
    color: "jaune",
    order: 26,
    title: "Sérologies",
    hint: "Un seul tube jaune pour ces sérologies.",
    tests: [
      t("syphilis", "Syphilis", ["syphilis", "tpha", "vdrl", "tpha vdrl"]),
      t("cmv", "CMV", ["cmv", "cytomegalovirus", "cytomegalovirus"]),
      t("ebv", "EBV", ["ebv", "epstein barr", "epstein-barr"]),
      t("hep-a", "Hépatite A", ["hepatite a", "vha", "hav"]),
      t("hep-b", "Hépatite B", ["hepatite b", "vhb", "hbv", "ag hbs", "anti hbs", "hbs"]),
      t("hep-c", "Hépatite C", ["hepatite c", "vhc", "hcv"]),
      t("vih", "VIH", ["vih", "hiv", "serologie vih", "serologie hiv"]),
      t("lyme", "Lyme", ["lyme", "borreliose", "borrelia"]),
      t("rubeole", "Rubéole", ["rubeole"]),
      t("toxo", "Toxoplasmose", ["toxoplasmose", "toxo"]),
    ],
  },
  {
    id: "jaune-autres-sero",
    color: "jaune",
    order: 27,
    title: "Autres sérologies",
    hint: "Tube jaune à part des sérologies classiques. Covid compris.",
    tests: [
      t("autres-sero", "Autres sérologies (Covid…)", ["autres serologies", "autres serologies virales", "covid", "covid 19", "covid19", "serologie covid", "sars cov 2", "sars-cov-2"]),
    ],
  },
  {
    id: "jaune-ige",
    color: "jaune",
    order: 28,
    title: "IgE et Phadiatop",
    hint: "Tube jaune à part.",
    tests: [
      t("ige", "IgE", ["ige", "ige totales", "immunoglobuline e"]),
      t("phadiatop", "Phadiatop", ["phadiatop"]),
    ],
  },
  {
    id: "jaune-cdt",
    color: "jaune",
    order: 29,
    title: "CDT",
    hint: "Ligne à part sur le guide : son propre tube jaune.",
    tests: [
      t("cdt", "CDT", ["cdt", "transferrine desialylee", "carbohydrate deficient transferrin"]),
    ],
  },
  {
    id: "rouge-ht21",
    color: "rouge",
    order: 30,
    title: "HT 21",
    hint: "Envoi Cerba. Tube rouge à part.",
    tests: [
      t("ht21", "HT 21 (envoi Cerba)", ["ht 21", "ht21"]),
    ],
  },
  {
    id: "rouge-medocs",
    color: "rouge",
    order: 31,
    title: "Médicaments envoyés à Cerba",
    hint: "Envoi Cerba. Tube rouge à part du HT 21.",
    tests: [
      t("clap", "CLAP", ["clap"]),
      t("clat", "CLAT", ["clat"]),
      t("autres-medocs", "Autres dosages de médicaments", ["autres dosages de medicaments", "dosage de medicament cerba"]),
    ],
  },
  {
    id: "vert-speciaux",
    color: "vert",
    order: 40,
    title: "Magnésium érythrocytaire et méthémoglobine",
    hint: "Ce n'est pas le magnésium de la biochimie, qui est jaune.",
    tests: [
      t("mg-ery", "Magnésium érythrocytaire", ["magnesium erythrocytaire", "magnesium intra erythrocytaire", "magnesium globulaire", "magnesium erythro"]),
      t("methemoglobine", "Méthémoglobine", ["methemoglobine", "methb"]),
    ],
  },
  {
    id: "violet-nfs",
    color: "violet",
    order: 50,
    title: "NFS",
    hint: "NFS, plaquettes, réticulocytes, VS et HbA1c : un seul tube violet.",
    tests: [
      t("nfs", "NFS", ["nfs", "numeration", "hemogramme", "formule sanguine", "numeration formule sanguine", "fns", "nf"]),
      t("plaquettes", "Plaquettes", ["plaquettes", "plaquette", "numeration plaquettaire"]),
      t("reticulocytes", "Réticulocytes", ["reticulocytes", "reticulocyte", "retic"]),
      t("vs", "VS", ["vs", "vitesse de sedimentation"]),
      t("hba1c", "HbA1c", ["hba1c", "hb a1c", "hemoglobine glyquee", "hemoglobine glycosylee", "a1c", "hba1 c"]),
    ],
  },
  {
    id: "violet-insuline",
    color: "violet",
    order: 51,
    title: "Insuline",
    hint: "Tube violet à part de la NFS.",
    tests: [
      t("insuline", "Insuline", ["insuline", "insulinemie"]),
    ],
  },
  {
    id: "violet-groupe",
    color: "violet",
    order: 52,
    title: "Groupe, RAI, Coombs",
    hint: "Tube violet à part de la NFS. Le guide compte 2 violets pour NFS + groupe.",
    tests: [
      t("coombs", "Coombs direct", ["coombs direct", "coombs", "test de coombs"]),
      t("groupe", "Groupe sanguin", ["groupe sanguin", "groupage", "groupe", "gs"]),
      t("rai", "RAI", ["rai", "agglutinines irregulieres", "recherche d agglutinines"]),
    ],
  },
  {
    id: "gris-glycemie",
    color: "gris",
    order: 60,
    title: "Glycémie",
    hint: "Tube gris, pas le tube jaune de biochimie.",
    tests: [
      t("glycemie", "Glycémie", ["glycemie", "glycemie a jeun", "glucose"]),
    ],
  },
];

const biochimie = CADRES.find((cadre) => cadre.id === "jaune-biochimie");
const dosages = CADRES.find((cadre) => cadre.id === "jaune-dosages");
const alcoolemie = biochimie.tests.find((test) => test.id === "alcoolemie");
if (!dosages.tests.some((test) => test.id === "alcoolemie")) {
  dosages.tests.unshift(alcoolemie);
}

const ALIAS_TO_IDS = new Map();

for (const cadre of CADRES) {
  for (const test of cadre.tests) {
    const phrases = new Set([norm(test.label), ...test.aliases.map(norm)].filter((a) => a.length >= 2));
    test.phrases = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of test.phrases) {
      const prev = ALIAS_TO_IDS.get(phrase) || [];
      if (!prev.includes(test.id)) prev.push(test.id);
      ALIAS_TO_IDS.set(phrase, prev);
    }
  }
}

const ALIAS_LIST = [...ALIAS_TO_IDS.entries()]
  .map(([phrase, ids]) => ({ phrase, ids }))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const TEST_BY_ID = new Map();
const CADRE_BY_TEST = new Map();
for (const cadre of CADRES) {
  for (const test of cadre.tests) {
    TEST_BY_ID.set(test.id, test);
    if (!CADRE_BY_TEST.has(test.id)) CADRE_BY_TEST.set(test.id, []);
    CADRE_BY_TEST.get(test.id).push(cadre);
  }
}

export function norm(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function yellowCadreCount() {
  return CADRES.filter((c) => c.color === "jaune").length;
}

export function getTest(id) {
  return TEST_BY_ID.get(id) || null;
}

export function getCadre(id) {
  return CADRES.find((c) => c.id === id) || null;
}

export function allTests() {
  return CADRES.flatMap((cadre) => cadre.tests.map((test) => ({ test, cadre })));
}

/**
 * Couvre les analyses cochées avec le moins de cadres possible.
 * Une analyse citée dans deux cadres (alcoolémie) n'ajoute pas un tube inutile.
 */
export function plan(ids) {
  const remaining = new Set([...ids].filter((id) => TEST_BY_ID.has(id)));
  const chosen = [];

  while (remaining.size) {
    let best = null;
    let bestCover = [];
    for (const cadre of CADRES) {
      const cover = cadre.tests.filter((test) => remaining.has(test.id));
      if (!cover.length) continue;
      const better =
        !best ||
        cover.length > bestCover.length ||
        (cover.length === bestCover.length && cadre.order < best.order);
      if (better) {
        best = cadre;
        bestCover = cover;
      }
    }
    if (!best) break;
    chosen.push({
      cadre: best,
      tests: best.tests.filter((test) => bestCover.some((item) => item.id === test.id)),
    });
    for (const test of bestCover) remaining.delete(test.id);
  }

  chosen.sort((a, b) => a.cadre.order - b.cadre.order);
  return chosen;
}

export function cadresFor(testId) {
  return CADRE_BY_TEST.get(testId) || [];
}

export function matchIds(text) {
  const padded = ` ${norm(text)} `;
  const occupied = new Array(padded.length).fill(false);
  const found = new Set();

  for (const { phrase, ids } of ALIAS_LIST) {
    const needle = ` ${phrase} `;
    let from = 0;
    while (from < padded.length) {
      const at = padded.indexOf(needle, from);
      if (at < 0) break;
      const innerStart = at + 1;
      const innerEnd = at + needle.length - 1;
      let overlaps = false;
      for (let i = innerStart; i < innerEnd; i += 1) {
        if (occupied[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = innerStart; i < innerEnd; i += 1) occupied[i] = true;
        ids.forEach((id) => found.add(id));
      }
      from = innerEnd;
    }
  }

  return [...found];
}

const IGNORE_SEGMENT =
  /hospital|domicile|resultat|merci|prescription|sexe|poids|taille|age\b|mail|courriel|medecin|prescripteur|patient|batiment|adresse|naissance|securis|boite|attention|substitu|page|finsess|rpp|ipp|ordonnance|prelev|heure|chaque|faire|rendez/;

const MONTHS = {
  janvier: 1,
  janv: 1,
  fevrier: 2,
  fev: 2,
  mars: 3,
  avril: 4,
  avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  juil: 7,
  aout: 8,
  septembre: 9,
  sept: 9,
  octobre: 10,
  oct: 10,
  novembre: 11,
  nov: 11,
  decembre: 12,
  dec: 12,
};

function isoDate(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  let y = Number(year);
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y)) return "";
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function stripBirth(line) {
  return String(line)
    .replace(/\bn[ée]e?\s+le\s+\d{1,2}\s*[\/.\-\s]\s*\d{1,2}\s*[\/.\-\s]\s*\d{2,4}/gi, " ")
    .replace(/date de naissance[^\n]{0,24}/gi, " ");
}

export function formatFrenchDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function findDatesInLine(line) {
  const source = norm(stripBirth(line));
  if (/\bnaissance\b|\bddn\b|\bne\b|\bnee\b/.test(source)) return [];
  const digitGroups = source.match(/\d+/g) || [];
  const found = [];
  const numeric = /\b(\d{1,2})(?:\s*[\/.\-]\s*|\s+)(\d{1,2})(?:\s*[\/.\-]\s*|\s+)(\d{4}|\d{2})\b/g;
  let match = numeric.exec(source);
  while (match) {
    if (!(match[3].length === 2 && digitGroups.length > 3)) {
      const iso = isoDate(match[1], match[2], match[3]);
      const year = iso ? Number(iso.slice(0, 4)) : 0;
      if (iso && year >= 2018) found.push({ iso, text: match[0].replace(/\s+/g, " ") });
    }
    match = numeric.exec(source);
  }
  const monthRe = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})\\s+(\\d{4})\\b`, "g");
  match = monthRe.exec(source);
  while (match) {
    const iso = isoDate(match[1], MONTHS[match[2]], match[3]);
    if (iso && Number(iso.slice(0, 4)) >= 2018) found.push({ iso, text: match[0] });
    match = monthRe.exec(source);
  }
  return found;
}

function dateRole(line) {
  const n = norm(line);
  if (/\bfaire\b|\bprelev|\brdv\b|\brendez|\bmatin\b/.test(n)) return "draw";
  const rest = n
    .replace(/\d+/g, " ")
    .replace(/\b(le|la|date|du|au|a|en)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rest.length <= 4) return "draw";
  if (/\b(reims|paris|lyon|chu|hopital|edite|fait)\b/.test(n)) return "letter";
  return "other";
}

const NAME_STOP =
  /rue|avenue|boulevard|chemin|impasse|place|cedex|docteur|prescripteur|laboratoire|service|batiment|ordonnance|clinique|centre|hospital|hemato|universit/;

function cleanName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-–]+/, "")
    .trim();
}

function looksLikeName(value) {
  const cleaned = cleanName(value);
  if (!cleaned || cleaned.length > 48 || /\d/.test(cleaned)) return false;
  const n = norm(cleaned);
  if (!n || NAME_STOP.test(n)) return false;
  const words = n.split(" ").filter((word) => word.length > 1);
  if (words.length < 2 || words.length > 5) return false;
  if (matchIds(cleaned).length) return false;
  return true;
}

function extractName(lines) {
  let skip = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (skip) {
      skip -= 1;
      continue;
    }
    const n = norm(lines[i]);
    if (/\bprescripteur\b|\bdocteur\b|^dr\b/.test(n)) {
      skip = 3;
      continue;
    }
    const labeled = lines[i].match(/^(?:patient|nom du patient|nom et pr[eé]nom|nom)\s*[:\-]\s*(.+)$/i);
    if (labeled && looksLikeName(labeled[1])) return cleanName(labeled[1]);
    if (/identification du patient/.test(n)) {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
        if (looksLikeName(lines[j])) return cleanName(lines[j]);
      }
    }
  }
  for (const line of lines) {
    const n = norm(line);
    if (/\bprescripteur\b|\bdocteur\b|^dr\b/.test(n)) continue;
    if (looksLikeName(line) && /[A-ZÀ-Ý]{2,}/.test(line)) return cleanName(line);
  }
  return "";
}

export function unknownSegments(text) {
  const parts = String(text || "")
    .split(/[\n,;]+/)
    .map((part) => part.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);

  const unknown = [];
  for (const part of parts) {
    const normalized = norm(part);
    if (!/[a-z]/.test(normalized)) continue;
    if (normalized.length < 2 || normalized.length > 60) continue;
    if (IGNORE_SEGMENT.test(normalized)) continue;
    if (matchIds(part).length) continue;
    unknown.push(part);
  }
  return [...new Set(unknown)].slice(0, 12);
}

export function parsePrescription(text) {
  const rawLines = String(text || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const name = extractName(rawLines);
  const dated = [];
  rawLines.forEach((line, index) => {
    const dates = findDatesInLine(line);
    if (!dates.length) return;
    dated.push({ index, iso: dates[0].iso, text: dates[0].text, role: dateRole(line) });
  });

  let chosen = dated.filter((item) => item.role === "draw");
  if (!chosen.length) chosen = dated.filter((item) => item.role === "other");
  if (!chosen.length) chosen = dated.filter((item) => item.role === "letter");

  const pack = (chunk) => ({
    ids: matchIds(chunk),
    unknown: unknownSegments(chunk).filter((item) => {
      const n = norm(item);
      if (!n || looksLikeName(item) || n === norm(name)) return false;
      if (/\bne le\b|\bnee le\b|\bnaissance\b|\bddn\b/.test(n)) return false;
      if (findDatesInLine(item).length && !matchIds(item).length) return false;
      return true;
    }),
  });

  if (!chosen.length) {
    const whole = pack(rawLines.join("\n"));
    return { name, visits: [{ date: "", whenText: "", ...whole }] };
  }

  const visits = chosen.map((mark, index) => {
    const end = index + 1 < chosen.length ? chosen[index + 1].index : rawLines.length;
    const chunkLines = rawLines.slice(mark.index, end);
    if (index === 0) {
      rawLines.slice(0, mark.index).forEach((line) => {
        if (matchIds(line).length) chunkLines.unshift(line);
      });
    }
    return { date: mark.iso, whenText: mark.text, ...pack(chunkLines.join("\n")) };
  });

  return { name, visits };
}

function matchesQuery(blob, query) {
  let from = 0;
  while (from < blob.length) {
    const at = blob.indexOf(query, from);
    if (at < 0) return false;
    if (at === 0 || blob[at - 1] === " ") return true;
    from = at + 1;
  }
  return false;
}

export function searchTests(query) {
  const q = norm(query);
  if (q.length < 2) return [];
  const seen = new Set();
  const rows = allTests().filter(({ test, cadre }) => {
    if (seen.has(test.id)) return false;
    const blob = norm(`${test.label} ${test.phrases.join(" ")}`);
    if (!matchesQuery(blob, q)) return false;
    seen.add(test.id);
    return true;
  });
  rows.sort((a, b) => {
    const as = norm(a.test.label).startsWith(q) ? 0 : 1;
    const bs = norm(b.test.label).startsWith(q) ? 0 : 1;
    if (as !== bs) return as - bs;
    return a.cadre.order - b.cadre.order || a.test.label.localeCompare(b.test.label, "fr");
  });
  return rows.slice(0, 8);
}

export function countLabel(n, label) {
  const word = n > 1 ? pluralColor(label) : label.toLowerCase();
  return `${n} ${word}`;
}

export function pluralColor(label) {
  const lower = label.toLowerCase();
  if (lower === "gris") return "gris";
  return `${lower}s`;
}

export function colorCounts(tubes) {
  const counts = [];
  for (const color of DRAW_ORDER) {
    const n = tubes.filter((tube) => tube.cadre.color === color).length;
    if (n) counts.push({ color, n, label: COLORS[color].label });
  }
  return counts;
}

export function fragileLabel(test) {
  if (!test.fragile) return "";
  return test.fragileNote ? `${test.label} (${test.fragileNote})` : test.label;
}

export function summaryText(moments) {
  const blocks = moments
    .filter((moment) => moment.ids.length)
    .map((moment) => {
      const tubes = plan(moment.ids);
      const counts = colorCounts(tubes)
        .map((item) => countLabel(item.n, item.label))
        .join(", ");
      const lines = [
        moment.title.toUpperCase(),
        moment.note,
        `${tubes.length} ${tubes.length > 1 ? "tubes" : "tube"}${counts ? ` · ${counts}` : ""}`,
        "Ordre du guide : " + tubes.map((tube) => COLORS[tube.cadre.color].label).join(" → "),
        "",
      ];
      tubes.forEach((tube, index) => {
        const color = COLORS[tube.cadre.color].label.toUpperCase();
        lines.push(`${index + 1}. ${color} · ${tube.cadre.title}`);
        lines.push(`   ${tube.tests.map((test) => test.label).join(", ")}`);
        const urgents = tube.tests.filter((test) => test.urgent).map((test) => test.label);
        const fragiles = tube.tests.filter((test) => test.fragile).map(fragileLabel);
        if (urgents.length) lines.push(`   Urgent : ${urgents.join(", ")}`);
        if (fragiles.length) lines.push(`   Fragile : ${fragiles.join(", ")}`);
      });
      const same = colorCounts(tubes).filter((item) => item.n > 1);
      if (same.length) {
        lines.push("");
        lines.push(
          same
            .map((item) => `${item.n} tubes ${pluralColor(item.label)} séparés : un cadre par tube, ne pas mélanger.`)
            .join(" ")
        );
      }
      return lines.filter((line) => line !== undefined).join("\n");
    });

  blocks.push(
    "Ne jamais transférer le sang d'un tube à l'autre.\nNe pas masquer le niveau de sang avec l'étiquette."
  );
  return blocks.join("\n\n");
}
