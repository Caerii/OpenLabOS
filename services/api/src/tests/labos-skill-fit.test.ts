/**
 * LabClaw → LabOS fit heuristics (tier / sort).
 */
import assert from "node:assert/strict";
import { compareLabclawSkillFit, scoreLabclawSkillForLabOS } from "../labclaw/labos-skill-fit.js";

function testVisionSkillTier1() {
  const f = scoreLabclawSkillForLabOS({
    ref: "skills/vision/hand-pose/SKILL.md",
    domain: "vision",
    title: "Egocentric hand tracking",
  });
  assert.equal(f.tier, 1);
  assert.equal(f.recommended, true);
  assert.ok(f.safetyScore >= 80);
}

function testLabosPathTier1() {
  const f = scoreLabclawSkillForLabOS({
    ref: "skills/labos/kitchen-sync/SKILL.md",
    domain: "general",
    title: "Kitchen workspace hooks",
  });
  assert.equal(f.tier, 1);
  assert.equal(f.recommended, true);
}

function testOmicsExecutionTier3() {
  const f = scoreLabclawSkillForLabOS({
    ref: "skills/bio/scanpy-analysis/SKILL.md",
    domain: "bio",
    title: "Single-cell analysis with scanpy",
  });
  assert.equal(f.tier, 3);
  assert.equal(f.recommended, false);
}

function testToolUniverseDeferred() {
  const f = scoreLabclawSkillForLabOS({
    ref: "skills/tooluniverse/runner/SKILL.md",
    domain: "general",
    title: "Tool orchestration",
  });
  assert.ok(f.tier >= 2);
  assert.equal(f.recommended, false);
}

function testComparePutsRecommendedFirst() {
  const a = {
    ref: "skills/vision/a/SKILL.md",
    domain: "vision" as const,
    title: "A",
    labosFit: scoreLabclawSkillForLabOS({
      ref: "skills/vision/a/SKILL.md",
      domain: "vision",
      title: "A",
    }),
  };
  const b = {
    ref: "skills/bio/scanpy/SKILL.md",
    domain: "bio" as const,
    title: "scanpy",
    labosFit: scoreLabclawSkillForLabOS({
      ref: "skills/bio/scanpy/SKILL.md",
      domain: "bio",
      title: "scanpy",
    }),
  };
  assert.equal(compareLabclawSkillFit(a, b), -1);
  assert.equal(compareLabclawSkillFit(b, a), 1);
}

function main() {
  testVisionSkillTier1();
  testLabosPathTier1();
  testOmicsExecutionTier3();
  testToolUniverseDeferred();
  testComparePutsRecommendedFirst();
  console.log("[labos-skill-fit] all checks passed");
}

main();
