import React from "react";
import { Construction } from "lucide-react";

export default function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-4">
      <div className="w-20 h-20 bg-[#B8FF68]/10 rounded-full flex items-center justify-center">
        <Construction className="w-10 h-10 text-[#3c6600]" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-[#1C1D21] tracking-tight">{title}</h2>
        <p className="text-gray-500 max-w-md mx-auto">
          Tính năng này đang được phát triển. Vui lòng quay lại sau!
        </p>
      </div>
    </div>
  );
}
