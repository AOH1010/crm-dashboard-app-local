import React from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import CrmAgentWidget from "./CrmAgentWidget";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeId: string;
  onNavigate: (id: string) => void;
  showAgentWidget?: boolean;
}

export default function DashboardLayout({
  children,
  activeId,
  onNavigate,
  showAgentWidget = true
}: DashboardLayoutProps) {
  return (
    <div className="min-h-screen overflow-x-clip bg-[#F9F9FB]">
      <Sidebar activeId={activeId} onNavigate={onNavigate} />
      <div className="ml-64 flex flex-col min-h-screen">
        <TopBar />
        <main className="mt-16 flex-1 p-8">
          {children}
        </main>
      </div>
      {showAgentWidget ? <CrmAgentWidget viewId={activeId} /> : null}
    </div>
  );
}
