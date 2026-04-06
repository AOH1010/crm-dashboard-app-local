import React from "react";
import { 
  TrendingUp, 
  Search, 
  Filter, 
  History,
  Activity,
  Layers,
  ChevronRight,
  UserCheck,
  TrendingDown,
  Monitor
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const kpiData = [
  { label: "TỶ LỆ ACTIVE TRUNG BÌNH T0 - T3", value: "42.8%", change: "+2.4%", desc: "Dựa trên dữ liệu 12 tháng gần nhất", icon: TrendingUp },
  { label: "TỈ LỆ ACTIVE TRUNG BÌNH T3 - T6", value: "31.5%", change: "Mid-term Stable", desc: "Tỉ lệ ổn định ở mức khả quan", icon: Activity },
  { label: "TỈ LỆ ACTIVE TRUNG BÌNH T6 - T12", value: "19.2%", change: null, desc: "Duy trì lòng trung thành dài hạn", icon: History },
];

const cohortMonths = ["Jan 2023", "Feb 2023", "Mar 2023", "Apr 2023", "May 2023", "Jun 2023", "Jul 2023", "Aug 2023", "Sep 2023", "Oct 2023", "Nov 2023", "Dec 2023"];
const timeLabels = ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

const generateCohortRow = (idx: number) => {
  const values: (number | null)[] = [];
  for (let i = 0; i < 13; i++) {
    if (i === 0) values.push(100);
    else if (i > 12 - idx) values.push(null);
    else {
      // Degrading values
      const base = 50 - (i * 3) + (idx * 0.5);
      values.push(Math.max(5, Math.floor(base)));
    }
  }
  return values;
};

export default function CohortActiveUserView() {
  return (
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-[length:var(--font-size-h-page)] font-bold text-[#1C1D21] tracking-tight font-headline select-none">Cohort Active User</h2>
          <p className="text-gray-500 font-medium tracking-tight">Phân tích hành vi & duy trì (Retention) theo nhóm thời gian gia nhập.</p>
        </div>
        <div className="flex items-center gap-4 font-body">
          <div className="relative group shadow-ambient">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              className="bg-white border-none rounded-xl pl-10 pr-6 py-2.5 text-sm w-72 focus:ring-2 focus:ring-[#B8FF68] transition-all outline-none" 
              placeholder="Tìm kiếm dữ liệu thuần..." 
              type="text"
            />
          </div>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-xl border border-gray-100 text-xs font-black uppercase tracking-widest text-[#1C1D21] hover:bg-gray-50 transition-colors shadow-sm active:scale-95">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            Industry Filter
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {kpiData.map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-2xl shadow-ambient border border-gray-100 relative overflow-hidden group hover:scale-[1.02] transition-transform">
            <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
              <kpi.icon className="w-16 h-16 text-[#1C1D21]" strokeWidth={1} />
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 font-headline leading-none">{kpi.label}</p>
            <div className="flex items-baseline gap-3">
              <h3 className="text-4xl font-black text-[#1C1D21] tabular-nums tracking-tighter">{kpi.value}</h3>
              {kpi.change && (
                <span className={cn(
                  "text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest",
                  kpi.change.includes("+") ? "bg-[#B8FF68]/20 text-[#3c6600]" : "text-gray-400"
                )}>
                  {kpi.change}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-6 font-bold uppercase tracking-widest flex items-center gap-1.5 border-t border-gray-50 pt-4">
              <Monitor className="w-3 h-3" />
              {kpi.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Cohort Heatmap */}
      <div className="bg-white p-8 rounded-[32px] shadow-ambient border border-gray-100 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 gap-6">
          <div className="space-y-1">
            <h3 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] tracking-tight font-headline">Ma Trận Cohort Retention</h3>
            <p className="text-sm text-gray-400 font-medium">Lớp khách hàng truy cập trở lại tính từ tháng đăng ký.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-2 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight text-[#1C1D21]">
              <span className="w-3 h-3 rounded bg-[#B8FF68]"></span> High Retention
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-tight text-[#1C1D21]">
              <span className="w-3 h-3 rounded bg-gray-200"></span> Low Retention
            </div>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar pb-4">
          <table className="w-full border-separate border-spacing-1 min-w-[1000px]">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                <th className="text-left py-4 px-6 bg-gray-50/50 rounded-xl sticky left-0 z-10 backdrop-blur-md">Tháng Kích Hoạt</th>
                {timeLabels.map((t) => (
                  <th key={t} className="py-4 text-center w-16">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[11px] font-black text-center font-body">
              {cohortMonths.map((month, mIdx) => {
                const values = generateCohortRow(mIdx);
                return (
                  <tr key={month} className="group">
                    <td className="text-left px-6 py-4 bg-gray-50/50 font-black text-[#1C1D21] rounded-xl sticky left-0 z-10 backdrop-blur-md transition-colors group-hover:bg-[#1C1D21] group-hover:text-white select-none whitespace-nowrap">
                      {month}
                    </td>
                    {values.map((val, vIdx) => (
                      <td key={vIdx} className="p-0.5">
                        {val === null ? (
                          <div className="h-12 rounded-xl bg-gray-50/30" />
                        ) : (
                          <div 
                            className={cn(
                              "h-12 rounded-xl flex items-center justify-center transition-all duration-300 hover:scale-[1.15] hover:z-20 cursor-default shadow-glow-sm",
                              val === 100 ? "text-[#1C1D21]" : "text-gray-700"
                            )}
                            style={{ 
                              backgroundColor: `rgba(184, 255, 104, ${val / 100})`,
                              border: val === 100 ? "2px solid #1C1D21" : "none",
                              opacity: val < 10 ? 0.4 : 1
                            }}
                          >
                            {val}%
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-center opacity-40">
        <p className="text-[9px] font-black uppercase tracking-[0.4em] select-none text-[#1C1D21]">Precision Design System applied via Jega Analytics Engine</p>
      </div>
    </div>
  );
}
