/**
 * Heuristic "LabOS initial fit" for LabClaw skills — which are safest to surface first
 * when we only integrate: catalog, SKILL read, and LLM-grounded chat (no arbitrary code execution).
 *
 * Tiers:
 *   1 — Best first: strong overlap with Mentra capture / vision / protocols / writing; low implied infra blast radius.
 *   2 — Good next: general stats, viz, lighter literature skills.
 *   3 — Defer for dedicated compute / OpenClaw: heavy omics, docking, ToolUniverse runners, cloud HPC patterns.
 */

export interface LabclawSkillEntryLike {
  ref: string;
  domain: string;
  title: string;
}

export interface LabosSkillFit {
  /** 1 = prioritize in LabOS UI first */
  tier: 1 | 2 | 3;
  /** 100 = safest for doc+LLM-only integration */
  safetyScore: number;
  /** 100 = strongest overlap with current LabOS product surface */
  valueScore: number;
  /** Short reasons for humans / tooltips */
  reasons: string[];
  /** tier === 1 */
  recommended: boolean;
}

const RISK_HEAVY =
  /tooluniverse|opentrons|docker|kubernetes|\bk8s\b|terraform|\baws\b|\bgcp\b|\bazure\b|\bssh\b|slurm|nextflow|snakemake|singularity|apptainer|spark\.|dask|ray\b/i;
const RISK_OMICS_EXEC =
  /scanpy|seurat|cellxgene|pysam|deeptools|bam\b|vcf\b|fastq|gatk|bcftools|salmon|star\b|hisat|cellranger/i;
const RISK_MOL_SIM = /rdkit|diffdock|gromacs|amber\b|openmm|autodock|rosetta|schrodinger/i;

const VALUE_VISION = /vision|xr|egocentric|hand|pose|segment|depth|imu|wearable|glasses/i;
/** Catalog refs are repo-relative (`skills/labos/...`), not always `/skills/...`. */
const VALUE_LABOS_PATH = /skills\/labos\//i;
const VALUE_PROTOCOL_DOCS =
  /protocol|workspace|kitchen|checklist|safety|qc\b|quality|reproducib|eln\b|lims|benchling|protocols\.io/i;
const VALUE_LIT_LIGHT =
  /pubmed|citation|scientific-writing|literature|patent|grant|arxiv|doi/i;
const VALUE_STATS_VIZ = /statistics|matplotlib|seaborn|plotly|visualization|scikit-learn/i;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function scoreLabclawSkillForLabOS(entry: LabclawSkillEntryLike): LabosSkillFit {
  const ref = entry.ref;
  const blob = `${ref}\n${entry.title}\n${entry.domain}`;
  const r = ref.replace(/\\/g, "/").toLowerCase();
  const d = entry.domain.toLowerCase();

  let risk = 0;
  const reasons: string[] = [];

  if (RISK_HEAVY.test(blob)) {
    risk += 3;
    reasons.push("Infra / runtime or remote execution patterns — keep in OpenClaw or a sandbox.");
  }
  if (RISK_OMICS_EXEC.test(blob)) {
    risk += 3;
    reasons.push("Heavy omics / alignment stack — needs scientific Python environment.");
  }
  if (RISK_MOL_SIM.test(blob)) {
    risk += 2;
    reasons.push("Molecular simulation / docking — specialized compute.");
  }
  if (/tooluniverse/i.test(ref)) {
    risk += 1;
    reasons.push("ToolUniverse skill — expects tool runtime, not markdown-only.");
  }

  risk = clamp(risk, 0, 10);

  let value = 0;
  if (d === "vision" || VALUE_VISION.test(blob)) {
    value += 4;
    reasons.push("Aligns with LabOS AI Vision / egocentric capture.");
  }
  if (VALUE_LABOS_PATH.test(ref)) {
    value += 4;
    reasons.push("Under skills/labos — explicit LabOS automation pack.");
  }
  if (VALUE_PROTOCOL_DOCS.test(blob)) {
    value += 2;
    reasons.push("Protocol / lab ops / safety wording — pairs with Kitchen & run artifacts.");
  }
  if ((d === "literature" || VALUE_LIT_LIGHT.test(blob)) && risk <= 4) {
    value += 2;
    reasons.push("Literature / writing — complements grounded search patterns (watch API keys).");
  }
  if (d === "general" && VALUE_STATS_VIZ.test(blob) && risk <= 3) {
    value += 2;
    reasons.push("Stats / viz / QC — useful for experiment reporting next to LabOS data.");
  }
  if (d === "visualization" && risk <= 2) {
    value += 2;
    reasons.push("Visualization — publication figures adjacent to exported LabOS datasets.");
  }
  if (d === "vision") {
    value += 2;
    reasons.push("Vision domain — small curated set aligned with XR / egocentric stack.");
  }

  value = clamp(value, 0, 10);

  const safetyScore = Math.round(100 - risk * 9);
  const valueScore = Math.round(value * 10);

  let tier: 1 | 2 | 3 = 3;
  if (risk <= 2 && value >= 6) tier = 1;
  else if (risk <= 2 && value >= 4 && (d === "vision" || VALUE_LABOS_PATH.test(ref))) tier = 1;
  else if (risk <= 4 && value >= 4) tier = 2;
  else if (risk <= 4 && value >= 2) tier = 2;

  const recommended = tier === 1;

  return {
    tier,
    safetyScore,
    valueScore,
    reasons: [...new Set(reasons)].slice(0, 5),
    recommended,
  };
}

/** Sort: recommended first, then tier (1 before 3), then value, then safety */
export function compareLabclawSkillFit(
  a: LabclawSkillEntryLike & { labosFit: LabosSkillFit },
  b: LabclawSkillEntryLike & { labosFit: LabosSkillFit },
): number {
  if (a.labosFit.recommended !== b.labosFit.recommended) return a.labosFit.recommended ? -1 : 1;
  if (a.labosFit.tier !== b.labosFit.tier) return a.labosFit.tier - b.labosFit.tier;
  if (a.labosFit.valueScore !== b.labosFit.valueScore) return b.labosFit.valueScore - a.labosFit.valueScore;
  if (a.labosFit.safetyScore !== b.labosFit.safetyScore) return b.labosFit.safetyScore - a.labosFit.safetyScore;
  return a.ref.localeCompare(b.ref);
}
