import React from "react";
import { 
  TrendingUp, 
  Search, 
  Filter, 
  Download,
  ArrowRight,
  History,
  MoreVertical,
  Bell,
  Settings
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const kpiData = [
  { label: "TỔNG KHÁCH HÀNG", value: "2,840", change: "+12%", percentage: 70, color: "bg-primary" },
  { label: "ACTIVE RATE", value: "64.2%", change: "+4.1%", percentage: 64, color: "bg-[#B8FF68]" },
];

const tableData = [
  { id: "#88291", name: "Trần Công Danh", initial: "TC", industry: "Bán lẻ", product: "SaaS Pro Plan", date: "12/05/2023", score: 85, lastActive: "3 ngày trước", status: "Best", color: "bg-primary/10 text-primary" },
  { id: "#88302", name: "Lê Hoàng Nam", initial: "LH", industry: "Sản xuất", product: "Enterprise Suite", date: "28/06/2023", score: 52, lastActive: "2 tuần trước", status: "Value", color: "bg-secondary-container text-secondary" },
  { id: "#88315", name: "Phạm Thị Thu", initial: "PT", industry: "Logistics", product: "Starter Pack", date: "15/07/2023", score: 12, lastActive: "1 tháng trước", status: "Ghost", color: "bg-error-container/10 text-error" },
  { id: "#88320", name: "Minh Vương", initial: "MV", industry: "Freelance", product: "Free Tier", date: "01/08/2023", score: 25, lastActive: "5 ngày trước", status: "Noise", color: "bg-surface-container text-gray-500" },
];

export default function ActiveMapView() {
  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-[length:var(--font-size-h-page)] font-bold text-[#1C1D21] tracking-tight font-headline">Thâm Niên & Mức Active</h2>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              className="bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#B8FF68] w-64 transition-all outline-none" 
              placeholder="Tìm kiếm khách hàng..." 
              type="text"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-500">
              <Bell className="w-4 h-4" />
            </button>
            <button className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-gray-500">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-ambient border border-gray-50">
        <div className="flex items-center p-1 bg-gray-50 rounded-xl border border-gray-100">
          {["0-3 tháng", "3-6 tháng", "6-9 tháng", "9-12 tháng", ">12 tháng"].map((tab, idx) => (
            <button 
              key={tab}
              className={cn(
                "px-5 py-2 text-sm font-bold transition-all rounded-lg",
                idx === 1 ? "bg-white text-[#1C1D21] shadow-sm scale-[1.02]" : "text-gray-400 hover:text-[#1C1D21]"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-body">
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition-all">
            <Filter className="w-4 h-4" />
            Bộ lọc nâng cao
          </button>
          <button className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1C1D21] text-[#B8FF68] font-bold text-sm hover:opacity-90 transition-all shadow-lg shadow-black/10">
            <Download className="w-4 h-4" />
            Xuất dữ liệu
          </button>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {kpiData.map((kpi, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-ambient border border-gray-50 flex flex-col justify-between group">
            <div>
              <p className="text-[10px] font-black text-gray-400 tracking-widest uppercase mb-2 font-headline">{kpi.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-[#1C1D21]">{kpi.value}</span>
                <span className="text-xs font-bold text-[#3c6600]">{kpi.change}</span>
              </div>
            </div>
            <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={cn("h-full transition-all duration-1000 group-hover:opacity-80", kpi.color)} 
                style={{ width: `${kpi.percentage}%` }}
              ></div>
            </div>
          </div>
        ))}

        <div className="md:col-span-2 bg-gradient-to-br from-[#1C1D21] to-[#2D2F31] p-6 rounded-2xl shadow-xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
          <div className="flex justify-between items-start mb-4 relative">
            <div>
              <p className="text-[10px] font-black text-[#B8FF68]/60 tracking-widest uppercase mb-1 font-headline">DỰ BÁO CHURN</p>
              <h3 className="text-xl font-bold text-white tracking-tight">Rủi ro rời bỏ (Ghost)</h3>
            </div>
            <span className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full text-[10px] font-black">URGENT</span>
          </div>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">Có 124 khách hàng trong nhóm '3-6 tháng' đang giảm dần tương tác trong 14 ngày qua.</p>
          <button className="text-[#B8FF68] text-xs font-bold flex items-center gap-1 hover:translate-x-1 transition-transform">
            Xem chi tiết danh sách <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white rounded-2xl shadow-ambient border border-gray-100 overflow-hidden font-body">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-8 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase">Tên khách hàng</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase">Ngành</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase">Sản phẩm</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase">Ngày mua</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase text-center">Điểm hoạt động</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase">Lần Active cuối</th>
                <th className="px-8 py-5 text-[10px] font-black text-gray-500 tracking-widest uppercase text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tableData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center font-bold text-gray-500 text-xs group-hover:bg-[#B8FF68]/20 group-hover:text-[#3c6600] transition-colors">{row.initial}</div>
                      <div>
                        <p className="text-sm font-bold text-[#1C1D21]">{row.name}</p>
                        <p className="text-[10px] text-gray-400 font-semibold tracking-wider">ID: {row.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-600">{row.industry}</td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-600">{row.product}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-400">{row.date}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all duration-1000",
                            row.score > 80 ? "bg-primary" : row.score > 40 ? "bg-secondary" : "bg-error"
                          )} 
                          style={{ width: `${row.score}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-gray-400">{row.score}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-500">{row.lastActive}</td>
                  <td className="px-8 py-4 text-right">
                    <span className={cn("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-current bg-opacity-10", row.color)}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-8 py-4 bg-gray-50/30 flex items-center justify-between border-t border-gray-100">
          <p className="text-xs font-bold text-gray-400">Hiển thị 1 - 4 trên tổng số 1,248 khách hàng</p>
          <div className="flex items-center gap-2">
            {[1, 2, 3, "...", 125].map((page, idx) => (
              <button 
                key={idx}
                className={cn(
                  "w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black transition-all",
                  page === 1 ? "bg-[#1C1D21] text-white shadow-lg" : "text-gray-400 hover:bg-white hover:text-[#1C1D21]"
                )}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Footer Meta */}
      <div className="flex justify-center pt-4 opacity-30">
        <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Powered by Jega Intelligent Analytics Engine v2.4.0</p>
      </div>
    </div>
  );
}
