import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sellerMonthRevenueSkillV3 } from "../skills/seller-month-revenue-v3.js";
import { topSellersPeriodSkill } from "../skills/top-sellers-period.js";
import { kpiOverviewSkill } from "../skills/kpi-overview.js";
import { comparePeriodsSkill } from "../skills/compare-periods.js";
import { renewDueSummarySkill } from "../skills/renew-due-summary.js";
import { operationsStatusSummarySkill } from "../skills/operations-status-summary.js";
import { conversionSourceSummarySkill } from "../skills/conversion-source-summary.js";
import { teamPerformanceSummarySkill } from "../skills/team-performance-summary.js";
import { revenueTrendAnalysisSkill } from "../skills/revenue-trend-analysis.js";
import { customerRevenueRankingSkillV2 } from "../skills/customer-revenue-ranking-v2.js";
import { recentOrdersListSkill } from "../skills/recent-orders-list.js";
import { leadGeographySkill } from "../skills/lead-geography.js";
import { sourceRevenueDrilldownSkillV2 } from "../skills/source-revenue-drilldown-v2.js";
import { ordersFilteredListSkill } from "../skills/orders-filtered-list.js";
import { inactiveSellersSummarySkill } from "../skills/inactive-sellers-summary.js";
import { revenueForecastSkill } from "../skills/revenue-forecast.js";
import { ROUTABLE_SKILL_INTENTS } from "./intent-catalog.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const moduleRoot = path.resolve(__dirname, "..", "..");
const skillsDir = path.join(moduleRoot, "skills");

const handlers = new Map([
  [sellerMonthRevenueSkillV3.id, sellerMonthRevenueSkillV3],
  [topSellersPeriodSkill.id, topSellersPeriodSkill],
  [kpiOverviewSkill.id, kpiOverviewSkill],
  [comparePeriodsSkill.id, comparePeriodsSkill],
  [renewDueSummarySkill.id, renewDueSummarySkill],
  [operationsStatusSummarySkill.id, operationsStatusSummarySkill],
  [conversionSourceSummarySkill.id, conversionSourceSummarySkill],
  [teamPerformanceSummarySkill.id, teamPerformanceSummarySkill],
  [revenueTrendAnalysisSkill.id, revenueTrendAnalysisSkill],
  [customerRevenueRankingSkillV2.id, customerRevenueRankingSkillV2],
  [recentOrdersListSkill.id, recentOrdersListSkill],
  [leadGeographySkill.id, leadGeographySkill],
  [sourceRevenueDrilldownSkillV2.id, sourceRevenueDrilldownSkillV2],
  [ordersFilteredListSkill.id, ordersFilteredListSkill],
  [inactiveSellersSummarySkill.id, inactiveSellersSummarySkill],
  [revenueForecastSkill.id, revenueForecastSkill]
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

  findLegacyCandidates(context) {
    return this.skills.filter((skill) => skill.handler.canHandle(context, skill));
  }

  findSkillForIntent(intent) {
    const skillId = ROUTABLE_SKILL_INTENTS[intent?.primary_intent];
    if (!skillId) {
      return null;
    }
    return this.skills.find((skill) => skill.id === skillId) || null;
  }

  findMatch(context) {
    const intentMappedSkill = this.findSkillForIntent(context.intent);
    if (context.intentSource === "legacy_rules" && intentMappedSkill && !context.intent?.ambiguity_flag) {
      return {
        skill: intentMappedSkill,
        matchedSkillCandidates: [intentMappedSkill.id],
        routeReason: "legacy_intent_skill_mapping"
      };
    }

    if (context.intentSource !== "legacy_rules") {
      return {
        skill: intentMappedSkill,
        matchedSkillCandidates: intentMappedSkill ? [intentMappedSkill.id] : [],
        routeReason: intentMappedSkill ? "intent_skill_mapping" : "no_skill_for_intent"
      };
    }

    const matchedSkills = this.findLegacyCandidates(context);
    if (matchedSkills.length === 0) {
      return {
        skill: null,
        matchedSkillCandidates: [],
        routeReason: "legacy_no_match"
      };
    }
    if (context.questionAnalysis?.isMultiIntent && matchedSkills.length > 1) {
      return {
        skill: null,
        compoundSkills: matchedSkills,
        matchedSkillCandidates: matchedSkills.map((skill) => skill.id),
        routeReason: "legacy_multi_intent_conflict"
      };
    }
    return {
      skill: matchedSkills[0],
      matchedSkillCandidates: matchedSkills.map((skill) => skill.id),
      routeReason: "legacy_priority_match"
    };
  }

  list() {
    return this.skills;
  }
}
