import React from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import { 
  History, 
  Search, 
  Bell, 
  Settings, 
  CalendarDays,
  Verified,
  Download,
  Calendar,
  ChevronRight,
  TrendingUp,
  ArrowUp,
  Plus
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const chartData = [
  { month: "JAN", total: 45, success: 32 },
  { month: "FEB", total: 38, success: 28 },
  { month: "MAR", total: 52, success: 44 },
  { month: "APR", total: 30, success: 22 },
  { month: "MAY", total: 60, success: 52 },
  { month: "JUN", total: 42, success: 35 },
  { month: "JUL", total: 48, success: 42 },
  { month: "AUG", total: 55, success: 48 },
  { month: "SEP", total: 68, success: 62 },
  { month: "OCT", total: 40, success: 28, current: true },
  { month: "NOV", total: 32, success: 15 },
  { month: "DEC", total: 28, success: 10 },
];

const customerList = [
  { id: "CR-882193", name: "Tech Horizon Solutions", contract: "450.000.000 đ", tier: "Gói Enterprise 12M", expiry: "24/10/2023", days: "Còn 5 ngày", status: "Đang đàm phán", color: "#3c6600", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBYv-YtlYTmh3cZgend_ZtyanyvR3MOGOh0Y1QOjWHmaOeJVlzl23yhlV7N_6SEzkxKJQr-HIH6kQTe0Nm7y8jHokoGPcmjfXvnBTRw0PmRhSDlMcAkMiOMTHuT-o1c3Vcc5wvhazmBEWc1xy4SYyRSGgvzAiBSQpgM6qKblIZ1BlESpTaeEekKwNYcbnr3csshExLumwYyv4hB5y4HmPAopAuW9mLvcfHehAzRTyoHOjy1be8jFmgpqTplhw32qBDPk7eOgEI4n9hM" },
  { id: "CR-102948", name: "Vina Retail Group", contract: "1.280.000.000 đ", tier: "Gói Custom Multi-Site", expiry: "28/10/2023", days: "Còn 9 ngày", status: "Chưa phản hồi", color: "#5b5b60", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCHjOYgv1vjy5iai5ZMFSvq8lkriefCy2q1VI7OGGwqr_mmejIMSFPzmxsisqFeNdhRAyBlK-VXeHgNIeUHGvKOqjxUQHFU6sRWJbzbwVwjpy2m62aOWXtO9BoinS2vWzqgc9K0o8qa58DF2o7lyG4GOxy2lDyjYVkgDhDDRzaad3db_fUGdooslEOijTRV7bpfOakUFp-Nq8LgLPIy9ujlcLLjhf0rE-izAA2Tsr-JPJ7uwCDf86WAOboCzFqPvxfYUUXA5s2RAzWe" },
  { id: "CR-556122", name: "Green Energy JSC", contract: "85.000.000 đ", tier: "Gói Standard Plus", expiry: "31/10/2023", days: "Sắp đến hạn", status: "Chờ xác nhận", color: "#3c6600", image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBQB_Tkl9q7PRi5TNO0M2K2L25iGb29XDUigGr1MZB8aCfvijacZOXmWvNsZuD8k436B9WemcOnIha7n4kd1aRePrBsbWQZ7rvTN8rWLgTKxdl39bLe-SFFUzYxM4grWqq52GJsUwYr5ofjLWmo-xiSl0b-aUOv1fDJDFUIHEdZ8VhvWiEUo-l9IIwaa_MT4IdUaCEWjBf99gHr_sEDSNuhyeSMgIIKBzWd5Ln8rxtARd_5zzpct1L-9iVuZrV9Wj1XsRZFlN6GURPk" },
];

export default function RenewView() {
  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-700 font-body">
      {/* Header and Filter */}
      <section className="flex flex-col md:flex-row justify-between items-end gap-6">
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8 w-full font-headline">
          <div className="bg-white p-8 rounded-[24px] shadow-ambient flex items-center justify-between border border-gray-100 group hover:translate-y-[-2px] transition-all">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 select-none">Số KH đến hạn tái ký</p>
              <h3 className="text-5xl font-black text-[#1C1D21] tabular-nums tracking-tighter">128</h3>
            </div>
            <div className="w-14 h-14 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-center text-[#1C1D21] group-hover:bg-[#1C1D21] group-hover:text-[#B8FF68] transition-colors">
              <TrendingUp className="w-8 h-8" />
            </div>
          </div>
          <div className="bg-white p-8 rounded-[24px] shadow-ambient flex items-center justify-between border border-gray-100 group hover:translate-y-[-2px] transition-all">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 select-none">Tỷ lệ tái ký thành công</p>
              <div className="flex items-baseline gap-3">
                <h3 className="text-5xl font-black text-[#1C1D21] tabular-nums tracking-tighter">84.5%</h3>
                <span className="text-xs font-black text-[#3c6600] flex items-center bg-[#B8FF68]/20 px-2 py-0.5 rounded-lg">
                  <ArrowUp className="w-3 h-3 mr-0.5" /> 2.1%
                </span>
              </div>
            </div>
            <div className="w-14 h-14 bg-[#B8FF68]/20 rounded-2xl flex items-center justify-center text-[#3c6600] group-hover:scale-110 transition-transform">
              <TrendingUp className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm font-black text-[10px] uppercase tracking-widest">
          <button className="px-5 py-2.5 text-gray-400 hover:text-[#1C1D21] transition-all">Q3 2023</button>
          <button className="px-8 py-2.5 bg-[#1C1D21] text-white rounded-xl shadow-lg ring-4 ring-black/5">Tháng 10</button>
          <button className="px-5 py-2.5 text-gray-400 hover:text-[#1C1D21] transition-all">Tháng 11</button>
          <div className="h-4 w-[1.5px] bg-gray-100 mx-2"></div>
          <button className="p-2.5 text-gray-400 hover:bg-gray-50 rounded-xl transition-all">
            <Calendar className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* Chart Section */}
      <section className="bg-white p-10 rounded-[40px] shadow-ambient border border-gray-50 flex flex-col gap-10">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Biểu Đồ Tiến Trình Tái Ký</h2>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">So sánh đến hạn vs hoàn tất tháng</p>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-1.5 rounded-full bg-gray-200"></span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Đến hạn</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-3.5 h-1.5 rounded-full bg-[#B8FF68]"></span>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Thành công</span>
            </div>
          </div>
        </div>
        
        <div className="h-[320px] w-full mt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f1f3" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 800, fill: "#9ca3af" }} 
                dy={15}
              />
              <YAxis hide />
              <Tooltip 
                cursor={{ fill: 'rgba(28, 29, 33, 0.02)' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', padding: '16px' }}
              />
              <Bar dataKey="total" fill="#F0F1F3" radius={[4, 4, 4, 4]} barSize={24} />
              <Bar dataKey="success" fill="#B8FF68" radius={[4, 4, 4, 4]} barSize={24}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.current ? "#1C1D21" : "#B8FF68"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* List Section */}
      <section className="space-y-6">
        <div className="flex justify-between items-center px-2">
          <h2 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Khách Hàng Sắp Hết Hạn</h2>
          <button className="text-xs font-black text-[#3c6600] uppercase tracking-widest hover:translate-x-1 transition-transform inline-flex items-center group">
            Xem tất cả <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
        
        <div className="bg-white rounded-[32px] shadow-ambient border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest font-headline">Khách hàng</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest font-headline">Giá trị hợp đồng</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest font-headline text-center">Ngày hết hạn</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest font-headline">Trạng thái</th>
                <th className="px-10 py-6 text-[10px] font-black text-gray-500 uppercase tracking-widest font-headline text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customerList.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/70 transition-all group">
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100 group-hover:scale-105 transition-transform">
                        <img src={row.image} alt="Logo" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-[#1C1D21] font-headline">{row.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold tracking-widest">ID: {row.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-black text-[#1C1D21] tabular-nums tracking-tighter">{row.contract}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{row.tier}</p>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <p className="text-sm font-black text-[#1C1D21] tabular-nums">{row.expiry}</p>
                    <p className={cn(
                      "text-[10px] font-black uppercase tracking-[0.15em] mt-0.5",
                      row.days.includes("Còn") ? "text-red-500" : "text-orange-600"
                    )}>{row.days}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: row.color }}></div>
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest select-none">{row.status}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <button className="px-6 py-2.5 bg-[#1C1D21] text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-glow-sm active:scale-95">
                      Gửi nhắc nhở
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAB */}
      <button className="fixed bottom-10 right-10 w-16 h-16 bg-[#B8FF68] text-[#1C1D21] rounded-3xl shadow-2xl flex items-center justify-center hover:scale-110 active:scale-90 transition-all group z-50">
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>
    </div>
  );
}
