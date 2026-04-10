import React from "react";
import {
  BarChart3,
  Briefcase,
  Factory,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  Layers,
  LogOut,
  Package,
  Settings,
  TrendingUp,
  Truck,
  Users
} from "lucide-react";
import { cn } from "@/src/lib/utils";

export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  group?: string;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "BAN HANG" },
  { id: "conversion", label: "Conversion", icon: TrendingUp, group: "BAN HANG" },
  { id: "leads", label: "Leads", icon: Users, group: "BAN HANG" },
  { id: "team", label: "Team", icon: Briefcase, group: "BAN HANG" },
  { id: "renew", label: "Renew", icon: BarChart3, group: "BAN HANG" },
  { id: "user-map", label: "User Map", icon: Truck, group: "VAN HANH" },
  { id: "active-map", label: "Active Map", icon: Package, group: "VAN HANH" },
  { id: "cohort-active", label: "Cohort Active User", icon: Layers, group: "VAN HANH" },
  { id: "chat-lab", label: "Chat Lab", icon: FlaskConical, group: "TOOLS" }
];

interface SidebarProps {
  activeId: string;
  onNavigate: (id: string) => void;
}

export default function Sidebar({ activeId, onNavigate }: SidebarProps) {
  const groups = Array.from(new Set(navItems.map((item) => item.group)));

  return (
    <aside className="custom-scrollbar fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-y-auto bg-[#1C1D21] py-6">
      <div className="mb-10 flex items-center gap-3 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#B8FF68]">
          <Factory className="h-6 w-6 text-[#1C1D21]" />
        </div>
        <div>
          <h1 className="font-headline text-xl font-bold tracking-tight text-white">JEGA CRM</h1>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Precision BI</p>
        </div>
      </div>

      <nav className="flex-1 space-y-8 px-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="font-headline mb-4 px-4 text-[11px] font-bold uppercase tracking-wider text-gray-500">
              {group}
            </p>
            <div className="space-y-1">
              {navItems
                .filter((item) => item.group === group)
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-full px-4 py-2.5 transition-all",
                      activeId === item.id
                        ? "bg-[#B8FF68] font-bold text-[#1C1D21] shadow-lg shadow-[#B8FF68]/10"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", activeId === item.id ? "fill-current" : "")} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-1 px-4 pt-6">
        <button type="button" className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
          <Settings className="h-5 w-5" />
          <span className="text-sm font-medium">Settings</span>
        </button>
        <button type="button" className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
          <HelpCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Support</span>
        </button>
        <button type="button" className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-red-400 transition-colors hover:bg-red-400/5 hover:text-red-300">
          <LogOut className="h-5 w-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
