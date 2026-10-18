/** Barème métropole publié par l'Assurance Maladie au 28 janvier 2024.
 * L'AMI reste à 3,15 € jusqu'à la hausse prévue en novembre 2026.
 * Coefficients lus dans la NGAP titre XVI (version du 21 juin 2026).
 */
export const BAREME = "Barème métropole du 28 janvier 2024. Coefficients NGAP au 21 juin 2026. Ce n'est pas une télétransmission : contrôle le montant sur ta feuille de soins.";

const LETTER = { AMI: 3.15, AIS: 2.65, BSA: 13, BSB: 18.2, BSC: 28.7 };
const IFD = 2.75;
const IK = { plaine: 0.35, montagne: 0.5 };
const IK_FREE = { plaine: 2, montagne: 1 };
const DIMANCHE = 8.5;
const MAU = 1.35;
const MIE = 3.15;
const MCI = 5;

export const ACTS = [
  { id: "inj-sc", label: "Injection sous-cutanée", letter: "AMI", coef: 1, minutes: 10, withAis: "half" },
  { id: "inj-im", label: "Injection intramusculaire", letter: "AMI", coef: 1, minutes: 10, withAis: "half" },
  { id: "inj-id", label: "Injection intradermique", letter: "AMI", coef: 1, minutes: 10, withAis: "half" },
  { id: "insuline", label: "Insuline sous-cutanée", letter: "AMI", coef: 1, minutes: 10, withAis: "half" },
  { id: "diabete", label: "Surveillance diabète insulino-traité", letter: "AMI", coef: 1, minutes: 15, withAis: "half" },
  { id: "pds", label: "Prise de sang", letter: "AMI", coef: 1.5, minutes: 15, full: true },
  { id: "iv", label: "Injection intraveineuse directe", letter: "AMI", coef: 2, minutes: 15 },
  { id: "pansement", label: "Pansement de plaie simple", letter: "AMI", coef: 2.02, minutes: 20 },
  { id: "fils", label: "Ablation de fils, 10 ou moins", letter: "AMI", coef: 2, minutes: 15 },
  { id: "lourd", label: "Pansement lourd et complexe", letter: "AMI", coef: 4, minutes: 30, withAis: "full" },
  { id: "analg", label: "Analgésie avant pansement", letter: "AMI", coef: 1.1, minutes: 15, full: true },
  { id: "perf-courte", label: "Perfusion courte, 1 h ou moins", letter: "AMI", coef: 9, minutes: 60, withAis: "full" },
  { id: "perf-longue", label: "Perfusion longue avec surveillance", letter: "AMI", coef: 14, minutes: 30, withAis: "full" },
  { id: "perf-retrait", label: "Retrait de perfusion", letter: "AMI", coef: 5, minutes: 20 },
  { id: "perf-orga", label: "Organisation surveillance de perfusion", letter: "AMI", coef: 4, minutes: 15, noTravel: true },
  { id: "seance", label: "Séance de soins infirmiers", letter: "AIS", coef: 3, minutes: 30 },
  { id: "bsa", label: "Forfait dépendance léger", letter: "BSA", coef: 1, minutes: 30 },
  { id: "bsb", label: "Forfait dépendance intermédiaire", letter: "BSB", coef: 1, minutes: 40 },
  { id: "bsc", label: "Forfait dépendance lourd", letter: "BSC", coef: 1, minutes: 50 },
];

export function actById(id) {
  return ACTS.find((act) => act.id === id) || null;
}

export function actMinutes(ids) {
  const minutes = (ids || []).map((id) => actById(id)?.minutes || 0).reduce((sum, value) => sum + value, 0);
  return Math.min(180, Math.max(10, minutes || 20));
}

function cents(value) {
  return Math.round(value * 100 + 1e-8) / 100;
}

function codeOf(act, rate) {
  const coef = String(act.coef).replace(".", ",");
  const rateLabel = rate === 1 ? "" : rate === 0.5 ? " × 50 %" : " × 0";
  return `${act.letter} ${coef}${rateLabel}`;
}

export function nightExtra(hour) {
  if (hour == null) return null;
  if (hour >= 23 || hour < 5) return { label: "Majoration de nuit 23h–5h", code: "Nuit", amount: 18.3 };
  if ((hour >= 20 && hour < 23) || (hour >= 5 && hour < 8)) return { label: "Majoration de nuit", code: "Nuit", amount: 9.15 };
  return null;
}

export function quote(actIds, options = {}) {
  const acts = (actIds || []).map(actById).filter(Boolean);
  if (!acts.length) return { lines: [], total: 0 };
  const ais = acts.some((act) => act.letter === "AIS");
  const lines = [];
  const ranked = [];
  for (const act of acts) {
    if (act.full) {
      lines.push({ label: act.label, code: codeOf(act, 1), amount: cents(act.coef * LETTER[act.letter]) });
      continue;
    }
    if (ais && act.withAis === "full") {
      lines.push({ label: act.label, code: codeOf(act, 1), amount: cents(act.coef * LETTER[act.letter]) });
      continue;
    }
    if (ais && act.withAis === "half") {
      lines.push({ label: act.label, code: codeOf(act, 0.5), amount: cents(act.coef * 0.5 * LETTER[act.letter]) });
      continue;
    }
    ranked.push(act);
  }
  ranked.sort((a, b) => b.coef * LETTER[b.letter] - a.coef * LETTER[a.letter]);
  ranked.forEach((act, index) => {
    const rate = index === 0 ? 1 : index === 1 ? 0.5 : 0;
    lines.push({ label: act.label, code: codeOf(act, rate), amount: cents(act.coef * rate * LETTER[act.letter]) });
  });

  const stuck = acts.length > 0 && acts.every((act) => act.noTravel);
  if (!stuck && options.domicile !== false && options.ifd) {
    lines.push({ label: "Indemnité de déplacement", code: "IFD", amount: IFD });
  }
  const zone = options.zone === "montagne" ? "montagne" : "plaine";
  const km = Number(options.km) || 0;
  if (!stuck && options.horsAgglo && km > IK_FREE[zone]) {
    const billed = (km - IK_FREE[zone]) * 2;
    lines.push({ label: `Indemnité kilométrique, ${String(billed).replace(".", ",")} km`, code: "IK", amount: cents(billed * IK[zone]) });
  }
  if (!stuck && options.sunday) lines.push({ label: "Majoration dimanche", code: "Dimanche", amount: DIMANCHE });
  if (!stuck) {
    const night = nightExtra(options.hour);
    if (night) lines.push(night);
  }
  const amiCount = acts.filter((act) => act.letter === "AMI" || act.letter === "AIS").length;
  if (!stuck && options.mau && amiCount === 1) lines.push({ label: "Majoration acte unique", code: "MAU", amount: MAU });
  if (options.mie) lines.push({ label: "Majoration enfant de moins de 7 ans", code: "MIE", amount: MIE });
  if (options.mci) lines.push({ label: "Majoration de coordination", code: "MCI", amount: MCI });

  const total = cents(lines.reduce((sum, line) => sum + line.amount, 0));
  return { lines, total };
}
