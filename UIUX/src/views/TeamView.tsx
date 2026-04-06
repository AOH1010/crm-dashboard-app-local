import React from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";
import { 
  TrendingUp, 
  Search, 
  Bell, 
  Settings, 
  ArrowUp,
  ArrowDown,
  Plus,
  Users,
  Grid,
  Calendar,
  MoreVertical,
  ChevronRight,
  TrendingDown,
  Video,
  Phone,
  MessageSquare,
  Star
} from "lucide-react";
import { cn } from "@/src/lib/utils";

const employeeStats = [
  { name: "Minh Anh", initial: "MA", value: "2.4B VND", percentage: 92, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuB0m50LMCEZTV7YbL0_fqA85o7PJqpR-dKn2as5OifZ9JWfot3fPYcExHvhfI5LA885sudjX-RJ_IlZIdiSfy97AXDOVnnKEAq61WXFJL-6SeHXX_aq-VCzsQwYQMFj5ghEauD0jrTTS_eL7BjODx7_f3_dLQSi3FeD2Xs24UTwW7jRpRYpLKsrKUu2D-jyBk565tTrls9qCUJX1RVbHWKkxX8-Z_-MZA6VcO3qHtARwDhtlzRD0gpTnXkPyjJjHme6j1XJORBEMLwd" },
  { name: "Quốc Bảo", initial: "QB", value: "1.8B VND", percentage: 75, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuCF4DKx0fcmgMI4nKHcYa_ngLMqn4hO8-bCCpBwUWU4T-alBzxWKIGpKxJ9I-eXbkgOrHLywR8CrhDbBpSwWhlewyUCL4iQLzYi8NNHgCxd11B4KTRhVqt7uRnp5rVr4WdXrWVtijqcKF1GMcvGEMEqj3DbZVGiJgWyKkD93QBvVa_KrlInjGFVgSdiWXKJRINvQh0MtAG-PyZMTj7gZ7hTMOHuUYBTKZmW-oMEAgrSoucnjnHXh6oZX2PIuO4sOaYyXoiczPIVUO7p" },
  { name: "Hoàng Yến", initial: "HY", value: "1.2B VND", percentage: 50, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuDVx9Z5CRGxVpcCObn4crWIPA0tyKOys9YFmcIdWAsTRW5S8d_5ZCJWV2zC3iyqR6xd0aSP2U_T6lBMjiwZC6rIxBrH53rH1V-QUM9JEoY36EBcMHXVg2u3z-2_X8bgiuyFkCuIIV_ge9rvAQ5JSrMVZefwMAg_1uD6XIeD-Mja0g0MQaz85cLDMuOcOWaxqq96javMNSonGwjnCCIADdxCzg6-3RKE-TpQ9KXfUzZq8jfsOd_wZZqppVvcovxaHgoO5zmp7R6Ld0RK" },
];

const teamStats = [
  { team: "Team HÀ NỘI", value: "5.2B VND", split: [20, 20, 20, 20, 20], color: "#1C1D21", active: true },
  { team: "Team HCM", value: "4.8B VND", split: [25, 25, 25, 25], color: "#1C1D21", active: false },
];

const customerLog = [
  { name: "Minh Anh", initial: "MA", company: "VinFast JSC", loc: "Lê Quang Đạo, HN", activity: "Meeting trực tuyến (45p)", icon: Video, note: "Khách hàng quan tâm gói CRM Enterprise, cần demo sâu module Logistics...", rank: "Elite", score: 95, color: "#B8FF68" },
  { name: "Quốc Bảo", initial: "QB", company: "The Coffee House", loc: "Phú Mỹ Hưng, Q7", activity: "Cuộc gọi thoại (12p)", icon: Phone, note: "Đang thương thảo về chi phí triển khai server nội bộ...", rank: "Pro", score: 82, color: "#e3e2e7" },
  { name: "Hoàng Yến", initial: "HY", company: "Bamboo Airways", loc: "Sân bay Nội Bài", activity: "Tư vấn qua Zalo OA", icon: MessageSquare, note: "Khách hàng yêu cầu bổ sung báo cáo tùy chỉnh theo quý...", rank: "Junior", score: 45, color: "#dbdde0" },
];

export default function TeamView() {
  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-700 font-body">
      {/* Header and Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 px-2">
        <div className="space-y-1">
          <h2 className="text-[length:var(--font-size-h-page)] font-bold text-[#1C1D21] font-headline tracking-tight select-none">Team Performance</h2>
          <p className="text-sm text-gray-500 font-medium tracking-tight">Dữ liệu cập nhật thực tế theo thời gian thực (Real-time syncing).</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-3xl border border-gray-100 shadow-ambient font-black text-[10px] uppercase tracking-widest text-[#1C1D21]">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl hover:bg-white transition-all hover:shadow-sm">
            <Users className="w-4 h-4 text-gray-400" />
            Nhóm Sale
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 border border-gray-100 rounded-xl hover:bg-white transition-all hover:shadow-sm">
            <Grid className="w-4 h-4 text-gray-400" />
            Sản phẩm
          </button>
          <button className="flex items-center gap-2 px-5 py-2.5 bg-[#1C1D21] text-white rounded-xl shadow-lg ring-4 ring-black/5 hover:scale-105 transition-all">
            <Calendar className="w-4 h-4 text-[#B8FF68]" />
            Tháng này
          </button>
        </div>
      </div>

      {/* Main Bento Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Sales by Employee */}
        <section className="bg-white p-10 rounded-[40px] shadow-ambient border border-gray-100 flex flex-col gap-10">
          <div className="flex justify-between items-center">
            <h3 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Doanh Số Theo Nhân Viên</h3>
            <button className="p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <MoreVertical className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <div className="space-y-10">
            {employeeStats.map((emp, idx) => (
              <div key={idx} className="group">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-2 border-gray-100 overflow-hidden ring-2 ring-transparent group-hover:ring-[#B8FF68] transition-all">
                      <img src={emp.image} alt={emp.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-black text-[#1C1D21] font-headline group-hover:translate-x-1 transition-transform">{emp.name}</span>
                  </div>
                  <span className="text-sm font-black tabular-nums tracking-tighter text-[#1C1D21]">{emp.value}</span>
                </div>
                <div className="w-full h-3 bg-gray-50 rounded-2xl overflow-hidden shadow-inner border border-gray-100/50">
                  <div 
                    className={cn(
                      "h-full bg-[#B8FF68] rounded-2xl transition-all duration-1000 delay-300 shadow-glow-sm",
                      idx === 1 && "opacity-80",
                      idx === 2 && "opacity-60"
                    )} 
                    style={{ width: `${emp.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sales by Team */}
        <section className="bg-white p-10 rounded-[40px] shadow-ambient border border-gray-100 flex flex-col gap-10">
          <div className="flex justify-between items-center">
            <h3 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Doanh Số Theo Team</h3>
            <div className="flex gap-2.5">
              <div className="w-3.5 h-3.5 rounded-full bg-[#1C1D21] ring-2 ring-gray-100"></div>
              <div className="w-3.5 h-3.5 rounded-full bg-[#B8FF68] ring-2 ring-[#B8FF68]/20"></div>
            </div>
          </div>
          <div className="space-y-12">
            {teamStats.map((team, idx) => (
              <div key={idx} className="relative">
                <div className="flex justify-between items-end mb-4 group cursor-default">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none border-b border-transparent group-hover:border-gray-200 transition-colors pb-1">{team.team}</span>
                  <span className="text-4xl font-black text-[#1C1D21] font-headline tabular-nums tracking-tighter shadow-text-sm">
                    {team.value.split(" ")[0]} <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{team.value.split(" ")[1]}</span>
                  </span>
                </div>
                <div className="flex h-12 gap-1.5 p-1.5 bg-gray-50 rounded-2xl border border-gray-100">
                  {team.split.map((s, sIdx) => (
                    <div 
                      key={sIdx} 
                      className={cn(
                        "h-full rounded-xl transition-all duration-500 hover:scale-[1.02]",
                        sIdx === team.split.length - 1 ? "w-40 bg-[#B8FF68] shadow-glow-sm" : "flex-1 bg-[#1C1D21]",
                        sIdx === team.split.length - 1 ? "" : `opacity-${100 - (sIdx * 10)}`
                      )}
                    ></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Activity Logs Table */}
      <section className="bg-white rounded-[40px] shadow-ambient border border-gray-100 overflow-hidden font-body">
        <div className="px-10 py-8 flex justify-between items-center bg-gray-50/50 border-b border-gray-100">
          <h3 className="text-[length:var(--font-size-h-bento)] font-bold text-[#1C1D21] font-headline tracking-tight">Nhật Ký CSKH & Đánh Giá</h3>
          <button className="text-[10px] font-black text-[#3c6600] uppercase tracking-widest flex items-center gap-1.5 group">
            Xem tất cả báo cáo
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-transparent">
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Nhân viên</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Khách hàng</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Hoạt động cuối</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Trích dẫn Ghi chú</th>
                <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Rating Năng lực</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 text-sm">
              {customerLog.map((log, idx) => (
                <tr key={idx} className="hover:bg-gray-50/70 transition-all group">
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-black text-[10px] text-gray-500 group-hover:bg-[#B8FF68]/20 group-hover:text-[#1C1D21] transition-colors">{log.initial}</div>
                      <span className="font-black text-[#1C1D21] font-headline">{log.name}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <p className="font-black text-[#1C1D21]">{log.company}</p>
                    <p className="text-[10px] text-gray-400 font-bold">{log.loc}</p>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                      <log.icon className="w-4 h-4 text-gray-400 group-hover:text-[#3c6600]" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-tight">{log.activity}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6 max-w-xs">
                    <p className="text-[11px] text-gray-400 font-medium leading-relaxed">"{log.note}"</p>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                        <div className="h-full bg-[#B8FF68] transition-all duration-1000 shadow-glow-xs" style={{ width: `${log.score}%` }}></div>
                      </div>
                      <span 
                        className={cn("text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-tight shadow-sm border border-black/5")}
                        style={{ backgroundColor: log.rank === "Elite" ? "#B8FF68" : log.rank === "Pro" ? "#1C1D21" : "#F3F4F6", color: log.rank === "Pro" ? "white" : "#1C1D21" }}
                      >
                        {log.rank}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAB */}
      <button className="fixed bottom-12 right-12 w-16 h-16 bg-[#B8FF68] text-[#1C1D21] rounded-3xl shadow-glow-lg flex items-center justify-center hover:scale-[1.15] active:scale-95 transition-all z-50 group border-b-4 border-black/10">
        <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform duration-500" strokeWidth={3} />
      </button>
    </div>
  );
}
