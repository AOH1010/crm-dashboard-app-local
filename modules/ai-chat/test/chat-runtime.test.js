import test from "node:test";
import assert from "node:assert/strict";
import { chatWithCrmAgent } from "../src/runtime/chat-runtime.js";
import { SkillRegistry } from "../src/runtime/skill-registry.js";
import { SQLiteConnector } from "../src/connectors/sqlite-connector.js";
import { analyzeQuestionComplexity } from "../src/tooling/question-analysis.js";
import { foldText } from "../src/tooling/common.js";

const connector = new SQLiteConnector();
const sellerName = connector.getSellerNames().find((name) => name.includes("Hoang Van Huy")) || connector.getSellerNames()[0];
const latestMonth = connector.getLatestMonthKey();
const latestMonthNumber = Number.parseInt(latestMonth.slice(5, 7), 10);
const latestYear = Number.parseInt(latestMonth.slice(0, 4), 10);

test("seller revenue route uses deterministic skill", async () => {
  const payload = await chatWithCrmAgent({
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
  assert.match(payload.reply, new RegExp(sellerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("long seller prompt still routes to deterministic seller skill", async () => {
  const payload = await chatWithCrmAgent({
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
});

test("seller revenue skill handles no-data period gracefully", async () => {
  const payload = await chatWithCrmAgent({
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
  const payload = await chatWithCrmAgent({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "Tom tat KPI chinh trong view nay"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "kpi-overview");
  assert.match(payload.reply, /Tong doanh thu/i);
});

test("compare route uses compare skill", async () => {
  const payload = await chatWithCrmAgent({
    viewId: "dashboard",
    messages: [{
      role: "user",
      content: "So sanh thang nay voi ky truoc"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "compare-periods");
  assert.match(payload.reply, /\| Chi so \|/);
});

test("renew summary uses renew skill", async () => {
  const payload = await chatWithCrmAgent({
    viewId: "renew",
    messages: [{
      role: "user",
      content: "Tong hop renew ky nay"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "renew-due-summary");
  assert.match(payload.reply, /Tong hop renew/i);
});

test("operations summary uses operations skill", async () => {
  const payload = await chatWithCrmAgent({
    viewId: "user-map",
    messages: [{
      role: "user",
      content: "Bao nhieu account dang active va bao nhieu ghost?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "operations-status-summary");
  assert.match(payload.reply, /Tong hop operations/i);
});

test("conversion source summary uses deterministic skill", async () => {
  const payload = await chatWithCrmAgent({
    viewId: "conversion",
    messages: [{
      role: "user",
      content: "Nhom nguon nao co conversion cao nhat?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "conversion-source-summary");
  assert.match(payload.reply, /Nhom nguon co conversion cao nhat/i);
});

test("team performance summary uses deterministic skill", async () => {
  const payload = await chatWithCrmAgent({
    viewId: "team",
    messages: [{
      role: "user",
      content: "Team nao dang dan dau doanh thu?"
    }]
  });

  assert.equal(payload.route, "skill");
  assert.equal(payload.skill_id, "team-performance-summary");
  assert.match(payload.reply, /Team dan dau doanh thu/i);
});

test("multi-intent long prompt avoids forcing a deterministic skill", () => {
  const registry = new SkillRegistry();
  const latestQuestion = "Toi dang review doanh thu. Team nao dang dan dau doanh thu va nhom nguon nao co conversion cao nhat?";
  const questionAnalysis = analyzeQuestionComplexity(latestQuestion);
  const matchedSkill = registry.findMatch({
    latestQuestion,
    foldedQuestion: foldText(latestQuestion),
    routingQuestion: questionAnalysis.routingQuestion,
    routingFoldedQuestion: foldText(questionAnalysis.routingQuestion),
    questionAnalysis,
    connector: {
      detectSellerName() {
        return null;
      }
    }
  });

  assert.equal(questionAnalysis.isMultiIntent, true);
  assert.equal(matchedSkill, null);
});
