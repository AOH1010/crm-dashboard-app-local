import test from "node:test";
import assert from "node:assert/strict";
import { chatWithCrmAgent } from "../src/runtime/chat-runtime.js";
import { SkillRegistry } from "../src/runtime/skill-registry.js";
import { SQLiteConnector } from "../src/connectors/sqlite-connector.js";
import { foldText } from "../src/tooling/common.js";

const connector = new SQLiteConnector();
const sellerName = connector.getSellerNames().find((name) => name.includes("Hoang Van Huy")) || connector.getSellerNames()[0];
const latestMonth = connector.getLatestMonthKey();
const latestMonthNumber = Number.parseInt(latestMonth.slice(5, 7), 10);
const latestYear = Number.parseInt(latestMonth.slice(0, 4), 10);

function chatWithDeterministicRouting(params) {
  return chatWithCrmAgent({
    ...params,
    useIntentClassifier: false,
    useSkillFormatter: false
  });
}

test("seller revenue route uses deterministic skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: `Doanh thu cua ${sellerName} thang ${latestMonthNumber}/${latestYear} la bao nhieu?`
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "seller-month-revenue");
  assert.equal(typeof payload.trace_id, "string");
  assert.equal(typeof payload.prompt_version, "string");
  assert.equal(payload.intent?.primary_intent, "seller_revenue_month");
  assert.match(payload.reply, new RegExp(sellerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("long seller prompt still routes to deterministic seller skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: [
        "Toi dang xem dashboard va can mot tam nhin nhanh cho buoi hop.",
        "Hay dong vai tro analyst noi bo, doc boi canh tren view nay va giu cau tra loi ngan gon.",
        `Phan quan trong nhat: cho toi biet doanh thu cua ${sellerName} thang ${latestMonthNumber}/${latestYear} la bao nhieu.`
      ].join(" ")
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "seller-month-revenue");
  assert.equal(payload.intent?.primary_intent, "seller_revenue_month");
});

test("seller revenue skill handles no-data period gracefully", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: `Doanh thu cua ${sellerName} thang 1/2030 la bao nhieu?`
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "seller-month-revenue");
  assert.match(payload.reply, /Khong tim thay doanh so/i);
});

test("dashboard overview uses kpi skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "Tom tat KPI chinh trong view nay"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "kpi-overview");
  assert.equal(payload.intent?.primary_intent, "kpi_overview");
  assert.match(payload.reply, /Tong doanh thu/i);
});

test("dashboard 'tinh hinh chung' defaults to kpi overview instead of clarify", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "Tinh hinh chung the nao roi?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "kpi-overview");
  assert.equal(payload.intent?.primary_intent, "kpi_overview");
});

test("compare route uses compare skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "So sanh thang nay voi ky truoc"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "compare-periods");
  assert.equal(payload.intent?.primary_intent, "period_comparison");
  assert.match(payload.reply, /\| Chi so \|/);
});

test("explicit month comparison uses the months asked by the user", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "So sanh doanh thu thang 3 voi thang 2 nam 2026"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "compare-periods");
  assert.match(payload.reply, /2026-03-01 den 2026-03-31/i);
  assert.match(payload.reply, /2026-02-01 den 2026-02-28/i);
});

test("renew summary uses renew skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "renew",
    messages: [{
      role: "user",
      content: "Tong hop renew ky nay"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "renew-due-summary");
  assert.equal(payload.intent?.primary_intent, "renew_summary");
  assert.match(payload.reply, /Tong hop renew/i);
});

test("renew current month question defaults to the system current month", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "renew",
    messages: [{
      role: "user",
      content: "Thang nay co bao nhieu account sap den han?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "renew-due-summary");
  assert.match(payload.reply, /04\/2026/i);
});

test("operations summary uses operations skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "user-map",
    messages: [{
      role: "user",
      content: "Bao nhieu account dang active va bao nhieu ghost?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "operations-status-summary");
  assert.equal(payload.intent?.primary_intent, "operations_summary");
  assert.match(payload.reply, /Tong hop operations/i);
});

test("conversion source summary uses deterministic skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "conversion",
    messages: [{
      role: "user",
      content: "Nhom nguon nao co conversion cao nhat?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "conversion-source-summary");
  assert.equal(payload.intent?.primary_intent, "conversion_source_summary");
  assert.match(payload.reply, /Nhom nguon co conversion cao nhat/i);
});

test("team performance summary uses deterministic skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "team",
    messages: [{
      role: "user",
      content: "Team nao dang dan dau doanh thu?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "team-performance-summary");
  assert.equal(payload.intent?.primary_intent, "team_revenue_summary");
  assert.match(payload.reply, /Team dan dau doanh thu/i);
});

test("natural top seller query routes to top sellers skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "Ai dang dan dau doanh thu thang nay?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "top-sellers-period");
  assert.equal(payload.intent?.primary_intent, "top_sellers_period");
});

test("renew overview in renew view does not drift into dashboard kpi intent", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "renew",
    messages: [{
      role: "user",
      content: "Cho toi tong quan view nay"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "renew-due-summary");
  assert.equal(payload.intent?.primary_intent, "renew_summary");
});

test("multi-intent long prompt asks for clarification instead of forcing a deterministic skill", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "Toi dang review doanh thu. Team nao dang dan dau doanh thu va nhom nguon nao co conversion cao nhat?"
    }]
  });

  assert.equal(payload.route, "clarify_required");
  assert.equal(payload.skill_id, null);
  assert.ok((payload.clarification_question || payload.reply || "").length > 0);
});

test("follow-up prompt can reuse recent turns for intent detection", async () => {
  const payload = await chatWithDeterministicRouting({
    viewId: "team",
    messages: [
      {
        role: "user",
        content: "Doanh thu team thang 3 nhu the nao?"
      },
      {
        role: "assistant",
        content: "Toi dang xem doanh thu team trong thang 3."
      },
      {
        role: "user",
        content: "Con thang 4?"
      }
    ]
  });

  assert.equal(payload.intent?.primary_intent, "team_revenue_summary");
  assert.notEqual(payload.route, "llm_fallback");
});

test("SkillRegistry can map classifier intent directly to a skill", () => {
  const registry = new SkillRegistry();
  const match = registry.findMatch({
    intentSource: "classifier",
    intent: {
      primary_intent: "team_revenue_summary"
    }
  });

  assert.equal(match.skill?.id, "team-performance-summary");
  assert.deepEqual(match.matchedSkillCandidates, ["team-performance-summary"]);
});

test("legacy SkillRegistry path still keeps ambiguity-safe behavior", () => {
  const registry = new SkillRegistry();
  const latestQuestion = "Toi dang review doanh thu. Team nao dang dan dau doanh thu va nhom nguon nao co conversion cao nhat?";
  const match = registry.findMatch({
    intentSource: "legacy_rules",
    latestQuestion,
    foldedQuestion: foldText(latestQuestion),
    routingQuestion: latestQuestion,
    routingFoldedQuestion: foldText(latestQuestion),
    questionAnalysis: {
      isMultiIntent: true
    },
    connector: {
      detectSellerName() {
        return null;
      }
    }
  });

  assert.equal(match.skill, null);
  assert.ok(match.matchedSkillCandidates.length >= 2);
});
