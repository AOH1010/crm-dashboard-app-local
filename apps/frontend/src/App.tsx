/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import DashboardLayout from "./components/DashboardLayout";
import DashboardView from "./views/DashboardView";
import LeadsView from "./views/LeadsView";
import UserMapView from "./views/UserMapView";
import RenewView from "./views/RenewView";
import ConversionView from "./views/ConversionView";
import ActiveMapView from "./views/ActiveMapView";
import CohortActiveUserView from "./views/CohortActiveUserView";
import TeamView from "./views/TeamView";
import ChatLabView from "./views/ChatLabView";

function FallbackView({
  viewId,
  onNavigate,
}: {
  viewId: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
        <span className="text-4xl">--</span>
      </div>
      <h2 className="text-2xl font-bold text-[#1C1D21]">Screen In Progress</h2>
      <p className="mt-2 max-w-md text-gray-500">
        Feature <strong>{viewId.toUpperCase()}</strong> is still being finalized. Please return later.
      </p>
      <button
        type="button"
        onClick={() => onNavigate("dashboard")}
        className="mt-6 rounded-xl bg-[#B8FF68] px-6 py-2 text-sm font-bold text-[#1C1D21] shadow-lg shadow-[#B8FF68]/20 transition-all hover:scale-[1.02]"
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState("dashboard");
  const [visitedIds, setVisitedIds] = useState<string[]>(["dashboard"]);

  useEffect(() => {
    setVisitedIds((current) => (current.includes(activeId) ? current : [...current, activeId]));
  }, [activeId]);

  const renderView = (viewId: string) => {
    switch (viewId) {
      case "dashboard":
        return <DashboardView onNavigate={setActiveId} />;
      case "leads":
        return <LeadsView />;
      case "renew":
        return <RenewView />;
      case "user-map":
        return <UserMapView />;
      case "conversion":
        return <ConversionView />;
      case "active-map":
        return <ActiveMapView />;
      case "cohort-active":
        return <CohortActiveUserView />;
      case "team":
        return <TeamView />;
      case "chat-lab":
        return <ChatLabView />;
      default:
        return <FallbackView viewId={viewId} onNavigate={setActiveId} />;
    }
  };

  return (
    <DashboardLayout activeId={activeId} onNavigate={setActiveId} showAgentWidget={activeId !== "chat-lab"}>
      {visitedIds.map((viewId) => (
        <div key={viewId} className={viewId === activeId ? "block" : "hidden"}>
          {renderView(viewId)}
        </div>
      ))}
    </DashboardLayout>
  );
}
