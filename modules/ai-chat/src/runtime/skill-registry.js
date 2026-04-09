import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sellerMonthRevenueSkill } from "../skills/seller-month-revenue.js";
import { topSellersPeriodSkill } from "../skills/top-sellers-period.js";
import { kpiOverviewSkill } from "../skills/kpi-overview.js";
import { comparePeriodsSkill } from "../skills/compare-periods.js";
import { renewDueSummarySkill } from "../skills/renew-due-summary.js";
import { operationsStatusSummarySkill } from "../skills/operations-status-summary.js";
import { conversionSourceSummarySkill } from "../skills/conversion-source-summary.js";
import { teamPerformanceSummarySkill } from "../skills/team-performance-summary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..", "..");
const skillsDir = path.join(moduleRoot, "skills");

const handlers = new Map([
  [sellerMonthRevenueSkill.id, sellerMonthRevenueSkill],
  [topSellersPeriodSkill.id, topSellersPeriodSkill],
  [kpiOverviewSkill.id, kpiOverviewSkill],
  [comparePeriodsSkill.id, comparePeriodsSkill],
  [renewDueSummarySkill.id, renewDueSummarySkill],
  [operationsStatusSummarySkill.id, operationsStatusSummarySkill],
  [conversionSourceSummarySkill.id, conversionSourceSummarySkill],
  [teamPerformanceSummarySkill.id, teamPerformanceSummarySkill]
]);

function loadSkillManifest(skillId) {
  return JSON.parse(
    fs.readFileSync(path.join(skillsDir, skillId, "skill.json"), "utf8")
  );
}

export class SkillRegistry {
  constructor() {
    this.skills = [...handlers.entries()]
      .map(([skillId, handler]) => ({
        ...loadSkillManifest(skillId),
        handler
      }))
      .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0));
  }

  findMatch(context) {
    const matchedSkills = this.skills.filter((skill) => skill.handler.canHandle(context, skill));
    if (matchedSkills.length === 0) {
      return null;
    }
    if (context.questionAnalysis?.isMultiIntent && matchedSkills.length > 1) {
      return null;
    }
    return matchedSkills[0];
  }

  list() {
    return this.skills;
  }
}
