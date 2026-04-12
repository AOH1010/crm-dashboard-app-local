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
    <header className="fixed top-0 right-0 left-64 h-16 bg-background/80 backdrop-blur-xl flex justify-between items-center px-8 w-[calc(100%-16rem)] z-40 border-b border-border shadow-sm">
      <div className="flex items-center gap-3 bg-muted/50 hover:bg-muted/80 transition-colors px-3 py-1.5 rounded-md w-96 border border-border/50 focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
        <Search className="text-muted-foreground w-[18px] h-[18px]" />
        <input 
          className="bg-transparent border-none w-full text-sm font-sans placeholder-muted-foreground outline-none text-foreground" 
          placeholder="Search customer data, leads..." 
          type="text"
        />
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative">
          <SyncAdminPanel />
        </div>
        <button
          type="button"
          onClick={() => void handleLoadLiveData()}
          disabled={isRefreshing}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold shadow-sm transition-all hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <RefreshCcw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-primary" : ""}`} />
            {isRefreshing ? "Syncing..." : "Sync Live"}
          </span>
        </button>
        {refreshError ? (
          <div className="max-w-48 text-[10px] font-bold text-destructive truncate" title={refreshError}>
            Sync Fail
          </div>
        ) : null}
        
        <div className="h-6 w-[1px] bg-border mx-1"></div>

        <button className="relative text-muted-foreground hover:bg-accent hover:text-accent-foreground p-2 rounded-full transition-all">
          <Bell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full border border-background"></span>
        </button>
        <button className="text-muted-foreground hover:bg-accent hover:text-accent-foreground p-2 rounded-full transition-all flex items-center justify-center">
          <HelpCircle className="w-[18px] h-[18px]" />
        </button>
        
        <div className="flex items-center gap-3 pl-2">
          <div className="flex flex-col items-end justify-center">
            <span className="text-sm font-semibold leading-none">Admin User</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-1 tracking-wide uppercase">Premium</span>
          </div>
          <div className="relative">
            <img 
              alt="Avatar" 
              className="w-9 h-9 rounded-full object-cover ring-2 ring-background border border-border cursor-pointer shadow-sm" 
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxygwNR_BCUiwvyvoKvWzIfR-S0oyEFf2TS_3FyD0yMcA1c3M3w-ayaHsWJ8HdzVYV0uh4hfmof_T_XQZ4RL9TaVMmOlHmt8octwtAwyk9PMFM-a1PS6DTtT8KRaKPS0OxZ3GDLWTYJip01CQ90yM7SgwvGbCIr2HvJpSPhlXOkFxahAN-lBABn6WSqFWbcH9F4sz5GcoPMfnIIEGQ7NPpICPTgCQlWFie_d6ludt4pY5HAdvgsSvqEGnJCXl6yR45q-R3W8DDnt3r"
              referrerPolicy="no-referrer"
            />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background"></span>
          </div>
        </div>
      </div>
    </header>
  );
}
