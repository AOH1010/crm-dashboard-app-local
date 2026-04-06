import React, { useState } from "react";
import { Search, Bell, HelpCircle, RefreshCcw } from "lucide-react";
import SyncAdminPanel from "./SyncAdminPanel";
import { emitLoadLiveData } from "../lib/liveDataEvents";
import { refreshCoreViewCaches } from "../lib/liveDataRefresh";

export default function TopBar() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleLoadLiveData = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    emitLoadLiveData();
    try {
      await refreshCoreViewCaches();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Khong the load du lieu moi.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="fixed top-0 right-0 left-64 h-16 bg-background/95 backdrop-blur-md flex justify-between items-center px-8 w-[calc(100%-16rem)] z-40 border-b border-outline-variant/30">
      <div className="flex items-center gap-4 bg-surface-container-low px-4 py-2 rounded-lg w-96">
        <Search className="text-slate-400 w-4 h-4" />
        <input 
          className="bg-transparent border-none focus:ring-0 text-sm w-full font-body placeholder-slate-400 outline-none" 
          placeholder="Tìm kiếm dữ liệu khách hàng..." 
          type="text"
        />
      </div>
      
      <div className="flex items-center gap-4">
        <div className="relative">
          <SyncAdminPanel />
        </div>
        <button
          type="button"
          onClick={() => void handleLoadLiveData()}
          disabled={isRefreshing}
          className="rounded-xl border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-xs font-bold text-on-surface shadow-sm transition hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex items-center gap-2">
            <RefreshCcw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Loading..." : "Load live data"}
          </span>
        </button>
        {refreshError ? (
          <div className="max-w-52 text-[11px] font-bold text-red-600" title={refreshError}>
            Load loi
          </div>
        ) : null}
        <button className="relative text-slate-500 hover:bg-slate-100 p-2 rounded-lg transition-all">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border-2 border-background"></span>
        </button>
        <button className="text-slate-500 hover:bg-slate-100 p-2 rounded-lg transition-all">
          <HelpCircle className="w-5 h-5" />
        </button>
        <div className="h-8 w-[1px] bg-slate-200"></div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-on-surface">Admin User</span>
            <span className="text-[10px] text-slate-500">Premium Plan</span>
          </div>
          <img 
            alt="User Profile Avatar" 
            className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20" 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxygwNR_BCUiwvyvoKvWzIfR-S0oyEFf2TS_3FyD0yMcA1c3M3w-ayaHsWJ8HdzVYV0uh4hfmof_T_XQZ4RL9TaVMmOlHmt8octwtAwyk9PMFM-a1PS6DTtT8KRaKPS0OxZ3GDLWTYJip01CQ90yM7SgwvGbCIr2HvJpSPhlXOkFxahAN-lBABn6WSqFWbcH9F4sz5GcoPMfnIIEGQ7NPpICPTgCQlWFie_d6ludt4pY5HAdvgsSvqEGnJCXl6yR45q-R3W8DDnt3r"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
    </header>
  );
}
