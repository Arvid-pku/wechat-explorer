"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { YearHeatmap } from "@/components/charts/year-heatmap";

export function HeatmapClient({
  year,
  data,
  selected,
}: {
  year: number;
  data: { day: string; n: number }[];
  selected?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  return (
    <YearHeatmap
      year={year}
      data={data}
      selected={selected}
      onSelect={(day) => {
        const next = new URLSearchParams(sp.toString());
        next.set("year", String(year));
        next.set("day", day);
        router.push(`/calendar?${next.toString()}`, { scroll: false });
      }}
    />
  );
}
