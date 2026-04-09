import React from "react";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Users, 
  ShoppingCart, 
  Truck, 
  Package, 
  BarChart3, 
  History, 
  Settings, 
  HelpCircle, 
  LogOut,
  Layers,
  Factory,
  Briefcase
} from "lucide-react";
import { cn } from "@/src/lib/utils";

export type NavItem = {
  id: string;
  label: string;
  icon: React.ElementType;
  group?: string;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "BÁN HÀNG" },
  { id: "conversion", label: "Conversion", icon: TrendingUp, group: "BÁN HÀNG" },
  { id: "leads", label: "Leads", icon: Users, group: "BÁN HÀNG" },
  { id: "team", label: "Team", icon: Briefcase, group: "BÁN HÀNG" },
  { id: "renew", label: "Renew", icon: BarChart3, group: "BÁN HÀNG" },
  { id: "user-map", label: "User Map", icon: Truck, group: "VẬN HÀNH" },
  { id: "active-map", label: "Active Map", icon: Package, group: "VẬN HÀNH" },
  { id: "cohort-active", label: "Corhort Active User", icon: Layers, group: "VẬN HÀNH" },
];

interface SidebarProps {
  activeId: string;
  onNavigate: (id: string) => void;
}

export default function Sidebar({ activeId, onNavigate }: SidebarProps) {
  const groups = Array.from(new Set(navItems.map(item => item.group)));

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[#1C1D21] flex flex-col py-6 z-50 overflow-y-auto custom-scrollbar">
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#B8FF68] rounded-lg flex items-center justify-center">
          <Factory className="text-[#1C1D21] w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight font-headline">JEGA CRM</h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Precision BI</p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-8">
        {groups.map(group => (
          <div key={group}>
            <p className="px-4 text-[11px] font-bold text-gray-500 mb-4 tracking-wider uppercase font-headline">
              {group}
            </p>
            <div className="space-y-1">
              {navItems
                .filter(item => item.group === group)
                .map(item => (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 transition-all rounded-full group",
                      activeId === item.id
                        ? "bg-[#B8FF68] text-[#1C1D21] font-bold shadow-lg shadow-[#B8FF68]/10"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5", activeId === item.id ? "fill-current" : "")} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-4 mt-auto pt-6 space-y-1">
        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
          <Settings className="w-5 h-5" />
          <span className="text-sm font-medium">Settings</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
          <HelpCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Support</span>
        </button>
        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-red-400 hover:text-red-300 transition-colors rounded-full hover:bg-red-400/5">
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
