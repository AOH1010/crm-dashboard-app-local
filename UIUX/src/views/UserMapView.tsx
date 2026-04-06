import React from "react";
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Label,
  ReferenceArea,
  ReferenceLine
} from "recharts";
import { 
  TrendingUp, 
  Search, 
  Bell, 
  Settings, 
  Download,
  RefreshCcw,
  AlertTriangle,
  ChevronRight
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const scatterData = [
  // Best (High Freq, High Rec)
  { x: 85, y: 90, z: 200, name: 'VIP Customer A', type: 'Best' },
  { x: 92, y: 85, z: 150, name: 'VIP Customer B', type: 'Best' },
  { x: 78, y: 82, z: 180, name: 'VIP Customer C', type: 'Best' },
  // Value (High Freq, Low Rec)
  { x: 80, y: 30, z: 120, name: 'Regular D', type: 'Value' },
  { x: 88, y: 25, z: 100, name: 'Regular E', type: 'Value' },
  { x: 75, y: 35, z: 90, name: 'Regular F', type: 'Value' },
  // Ghost (Low Freq, High Rec)
  { x: 25, y: 88, z: 70, name: 'Lost G', type: 'Ghost' },
  { x: 30, y: 75, z: 60, name: 'Lost H', type: 'Ghost' },
  { x: 20, y: 92, z: 80, name: 'Lost I', type: 'Ghost' },
  // Noise (Low Freq, Low Rec)
  { x: 15, y: 20, z: 40, name: 'Cold J', type: 'Noise' },
  { x: 22, y: 15, z: 50, name: 'Cold K', type: 'Noise' },
  { x: 10, y: 25, z: 30, name: 'Cold L', type: 'Noise' },
];

const kpiData = [
  { label: "Active hiện tại", value: "12,482", change: "+5.2%", percentage: 72, color: "bg-primary", status: "positive" },
  { label: "Inactive", value: "3,105", change: "-2.1%", percentage: 18, color: "bg-red-500", status: "negative" },
  { label: "Tỷ lệ Active", value: "80.1%", change: null, percentage: 80, color: "bg-primary", type: "circle" },
];

export default function UserMapView() {
  return (
    <div className="space-y-8 animate-in fade-in duration-1000 font-body">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-6 px-2">
        <div className="space-y-1">
          <h2 className="text-[length:var(--font-size-h-page)] font-bold text-[#1C1D21] font-headline tracking-tight select-none">Phân Loại KH (RFM)</h2>
          <p className="text-sm text-gray-500 font-medium tracking-tight">Phân tích hành vi mua hàng dựa trên Recency, Frequency & Monetary.</p>
        </div>
        <div className="flex gap-4 font-black text-[10px] uppercase tracking-widest">
          <button className="px-6 py-3 bg-white text-[#1C1D21] rounded-xl shadow-ambient border border-gray-100 hover:bg-gray-50 transition-all flex items-center gap-2 group">
            <Download className="w-4 h-4 text-gray-400 group-hover:text-black transition-colors" />
            Xuất báo cáo
          </button>
          <button className="px-6 py-3 bg-[#1C1D21] text-[#B8FF68] rounded-xl shadow-lg hover:shadow-black/20 hover:scale-[1.02] transition-all flex items-center gap-2">
            <RefreshCcw className="w-4 h-4" />
            Cập nhật data
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {kpiData.map((kpi, idx) => (
          <div key={idx} className="bg-white p-8 rounded-[32px] shadow-ambient border border-gray-100 flex flex-col justify-between group hover:translate-y-[-2px] transition-all">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 font-headline">{kpi.label}</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-4xl font-black text-[#1C1D21] tabular-nums tracking-tighter">{kpi.value}</h3>
                  {kpi.change && (
                    <span className={cn(
                      "text-[10px] font-black px-2 py-0.5 rounded-lg",
                      kpi.status === "positive" ? "bg-[#B8FF68]/20 text-[#3c6600]" : "bg-red-50 text-red-500"
                    )}>
                      {kpi.change}
                    </span>
                  )}
                </div>
              </div>
              {kpi.type === "circle" && (
                <div className="relative w-12 h-12">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="24" cy="24" r="20" className="text-gray-100" strokeWidth="4" fill="transparent" stroke="currentColor" />
                    <circle cx="24" cy="24" r="20" className="text-[#B8FF68]" strokeWidth="4" fill="transparent" strokeDasharray={125.6} strokeDashoffset={125.6 * (1 - 0.8)} stroke="currentColor" />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tabular-nums">80%</span>
                </div>
              )}
            </div>
            {kpi.percentage && (
              <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner border border-gray-100">
                <div className={cn("h-full transition-all duration-1000", kpi.color)} style={{ width: `${kpi.percentage}%` }}></div>
              </div>
            )}
          </div>
        ))}
        
        <div className="bg-[#1C1D21] p-8 rounded-[32px] shadow-ambient border border-white/5 group relative overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-[#B8FF68]/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-1000"></div>
          <div className="flex justify-between items-start mb-2 relative">
            <p className="text-[10px] font-black text-[#B8FF68]/60 uppercase tracking-widest font-headline">Rủi ro Churn</p>
            <AlertTriangle className="w-5 h-5 text-red-500 shadow-glow-sm" />
          </div>
          <div className="flex items-baseline gap-2 relative">
            <h3 className="text-4xl font-black text-white tracking-tighter">Low</h3>
            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ghost Segment</span>
          </div>
          <p className="mt-4 text-[10px] text-zinc-500 font-bold leading-relaxed max-w-[180px] group-hover:text-zinc-400 transition-colors">
            Cần chú trọng nhóm 500 khách hàng lâu không phát sinh giao dịch.
          </p>
        </div>
      </div>

      {/* Main Feature: RFM Scatter Plot */}
      <section className="bg-white p-12 rounded-[48px] shadow-ambient border border-gray-50 flex flex-col gap-12 group">
        <div className="flex justify-between items-end">
          <div className="space-y-1">
            <h4 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Phân Bố Khách Hàng Theo RFM</h4>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Trực quan hóa cơ cấu nhóm theo Frequency & Recency</p>
          </div>
          <div className="flex flex-wrap gap-5 text-[10px] font-black tracking-widest uppercase">
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 select-none group-hover:bg-white transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B8FF68] shadow-glow-sm"></span> Best
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 select-none group-hover:bg-white transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1C1D21] opacity-70 shadow-glow-sm"></span> Value
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 select-none group-hover:bg-white transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 opacity-70"></span> Ghost
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 select-none group-hover:bg-white transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-100 border border-gray-300 opacity-50"></span> Noise
            </div>
          </div>
        </div>

        <div className="h-[560px] w-full bg-white rounded-[40px] border border-gray-100 p-8 shadow-inner-ambient relative overflow-hidden group-hover:shadow-ambient transition-all">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f3" vertical={false} />
              
              <ReferenceArea {...({ x1: 50, x2: 100, y1: 50, y2: 100, fill: "#B8FF68", fillOpacity: 0.06, isFront: false } as any)} />
              <ReferenceArea {...({ x1: 50, x2: 100, y1: 0, y2: 50, fill: "#1C1D21", fillOpacity: 0.04, isFront: false } as any)} />
              <ReferenceArea {...({ x1: 0, x2: 50, y1: 50, y2: 100, fill: "#ef4444", fillOpacity: 0.03, isFront: false } as any)} />
              <ReferenceArea {...({ x1: 0, x2: 50, y1: 0, y2: 50, fill: "#94a3b8", fillOpacity: 0.04, isFront: false } as any)} />

              <ReferenceLine x={50} stroke="#1C1D21" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.1} />
              <ReferenceLine y={50} stroke="#1C1D21" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.1} />

              <XAxis 
                type="number" 
                dataKey="x" 
                name="Frequency" 
                domain={[0, 100]}
                axisLine={false} 
                tick={false} 
              />
              
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Recency" 
                domain={[0, 100]}
                axisLine={false} 
                tick={false} 
              />
              
              <ZAxis type="number" dataKey="z" range={[150, 600]} />

              <Tooltip 
                cursor={{ strokeDasharray: '3 3', stroke: '#1C1D21', strokeWidth: 1.5 }}
                contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', padding: '24px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                itemStyle={{ fontSize: '12px', fontWeight: 900, color: '#1C1D21' }}
              />

              <Scatter data={scatterData}>
                {scatterData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.type === 'Best' ? '#B8FF68' : entry.type === 'Value' ? '#1C1D21' : entry.type === 'Ghost' ? '#f87171' : '#cbd5e1'}
                    stroke={entry.type === 'Best' ? '#365314' : entry.type === 'Value' ? '#000' : entry.type === 'Ghost' ? '#991b1b' : '#94a3b8'}
                    strokeWidth={1.5}
                    className="drop-shadow-sm transition-all duration-300 hover:scale-110"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          
          {/* Overlay Labels - Enlarged & Clarified */}
          <div className="absolute top-14 left-14 pointer-events-none group-hover:translate-x-1 transition-transform duration-500">
            <h6 className="text-[20px] font-black text-red-500 tracking-[0.2em] opacity-60">NOISE</h6>
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mt-1">Inactive, first session only</p>
          </div>
          <div className="absolute top-14 right-14 text-right pointer-events-none group-hover:-translate-x-1 transition-transform duration-500">
            <h6 className="text-[20px] font-black text-slate-900 tracking-[0.2em] flex items-center justify-end gap-3">
              BEST <div className="w-3.5 h-3.5 rounded-full bg-[#B8FF68] shadow-glow-sm relative">
                <div className="absolute inset-0 bg-[#B8FF68] rounded-full animate-ping opacity-75"></div>
              </div>
            </h6>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">High Frequency & High Recency</p>
          </div>
          <div className="absolute bottom-14 left-14 pointer-events-none group-hover:translate-x-1 transition-transform duration-500">
            <h6 className="text-[20px] font-black text-slate-400 tracking-[0.2em] opacity-40">GHOST</h6>
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Recently active, rare visits</p>
          </div>
          <div className="absolute bottom-14 right-14 text-right pointer-events-none group-hover:-translate-x-1 transition-transform duration-500">
            <h6 className="text-[20px] font-black text-slate-700 tracking-[0.2em] flex items-center justify-end gap-3 opacity-60">
              VALUE <div className="w-3.5 h-3.5 rounded-full bg-slate-900 shadow-glow-sm relative">
                <div className="absolute inset-0 bg-slate-900 rounded-full animate-ping opacity-30"></div>
              </div>
            </h6>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Frequent in past, now drifting</p>
          </div>
        </div>

        {/* Structure Bar */}
        <div className="space-y-8 pt-4">
          <div className="flex justify-between items-end px-2">
            <div>
              <h5 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Cơ Cấu Nhóm Khách Hàng</h5>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Phân bổ nguồn lực tối ưu theo phân khúc</p>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Cập nhật: 12:45 PM Hôm nay</p>
          </div>
          
          <div className="w-full h-8 flex rounded-2xl overflow-hidden shadow-glow-sm ring-1 ring-gray-100">
            <div className="h-full bg-[#B8FF68] flex items-center justify-center text-[9px] font-black text-[#1C1D21] border-r border-black/5 hover:scale-x-105 transition-transform" style={{ width: "25%" }}>BEST (25%)</div>
            <div className="h-full bg-[#1C1D21] flex items-center justify-center text-[9px] font-black text-white border-r border-white/5 hover:scale-x-105 transition-transform" style={{ width: "35%" }}>VALUE (35%)</div>
            <div className="h-full bg-red-400 flex items-center justify-center text-[9px] font-black text-white border-r border-black/5 hover:scale-x-105 transition-transform" style={{ width: "20%" }}>NOISE (20%)</div>
            <div className="h-full bg-slate-200 flex items-center justify-center text-[9px] font-black text-[#1C1D21] hover:scale-x-105 transition-transform" style={{ width: "20%" }}>GHOST (20%)</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 px-2">
            {[
              { label: "Doanh thu Best", value: "2.4B VND", color: "text-[#3c6600]", status: "Best" },
              { label: "Doanh thu Value", value: "1.8B VND", color: "text-[#1C1D21]", status: "Value" },
              { label: "Tỷ lệ Churn Noise", value: "24.5%", color: "text-red-500", status: "Fatal" },
              { label: "Số lượng Ghost", value: "520 KH", color: "text-gray-400", status: "Lost" },
            ].map((stat, sIdx) => (
              <div key={sIdx} className="flex flex-col group cursor-default">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 font-headline group-hover:text-gray-600 transition-colors">{stat.label}</span>
                <span className={cn("text-2xl font-black tabular-nums tracking-tighter font-headline", stat.color)}>{stat.value}</span>
                <div className="w-10 h-0.5 mt-3 bg-gray-100 rounded-full group-hover:w-full transition-all duration-700"></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer Branding */}
      <div className="flex justify-center pt-8 opacity-20">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[#1C1D21]">JEGA CLASSIFICATION CORE V3.1</p>
      </div>
    </div>
  );
}
