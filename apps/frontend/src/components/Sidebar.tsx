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
    <aside className="custom-scrollbar fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-y-auto bg-sidebar border-r border-sidebar-border py-6 shadow-xl shadow-black/5">
      <div className="mb-10 flex items-center gap-3 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary shadow-sm">
          <Factory className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="font-headline text-lg font-bold tracking-tight text-sidebar-foreground">JEGA CRM</h1>
          <p className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50">Precision BI</p>
        </div>
      </div>

      <nav className="flex-1 space-y-8 px-4">
        {groups.map((group) => (
          <div key={group}>
            <p className="font-headline mb-3 px-4 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/50">
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
                      "group flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
                      activeId === item.id
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className={cn("h-[18px] w-[18px]", activeId === item.id ? "fill-current/20" : "")} />
                    <span>{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-1 px-4 pt-6 pb-2">
        <div className="h-[1px] w-full bg-sidebar-border mb-4"></div>
        <button type="button" className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <Settings className="h-[18px] w-[18px]" />
          <span>Settings</span>
        </button>
        <button type="button" className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <HelpCircle className="h-[18px] w-[18px]" />
          <span>Support</span>
        </button>
        <button type="button" className="flex w-full items-center gap-3 rounded-md px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="h-[18px] w-[18px]" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
