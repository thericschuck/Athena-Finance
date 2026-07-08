"use client";

import { cn } from "@/lib/utils";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  cta?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
  visual?: React.ReactNode;
}

interface BentoGridProps {
  items: BentoItem[];
  className?: string;
}

export function BentoGrid({ items, className }: BentoGridProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3", className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "group relative p-5 rounded-2xl overflow-hidden transition-all duration-300",
            "border border-white/[0.06] bg-[#0d0f14]",
            "hover:border-white/[0.12] hover:-translate-y-0.5 will-change-transform",
            "hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
            item.colSpan === 2 ? "md:col-span-2" : "col-span-1",
            item.hasPersistentHover && "-translate-y-0.5 border-white/[0.10] shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
          )}
        >
          {/* dot grid bg on hover */}
          <div className={cn(
            "absolute inset-0 transition-opacity duration-300",
            item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[length:20px_20px]" />
          </div>

          <div className="relative flex flex-col gap-3 h-full">
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.06] group-hover:bg-white/[0.10] transition-colors duration-300">
                {item.icon}
              </div>
              {item.status && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white/[0.06] text-gray-400 group-hover:bg-white/[0.10] transition-colors duration-300">
                  {item.status}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-semibold text-[15px] text-gray-100 tracking-tight leading-snug">
                {item.title}
                {item.meta && (
                  <span className="ml-2 text-xs text-gray-500 font-normal">{item.meta}</span>
                )}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{item.description}</p>
            </div>

            {item.visual && (
              <div className="mt-auto pt-2">{item.visual}</div>
            )}

            {item.tags && item.tags.length > 0 && (
              <div className="flex items-center justify-between mt-auto pt-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-white/[0.05] text-gray-500 hover:bg-white/[0.10] transition-colors">
                      #{tag}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.cta || "Explore →"}
                </span>
              </div>
            )}
          </div>

          {/* gradient border shine on hover */}
          <div className={cn(
            "absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-transparent via-white/[0.04] to-transparent transition-opacity duration-300",
            item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )} />
        </div>
      ))}
    </div>
  );
}
