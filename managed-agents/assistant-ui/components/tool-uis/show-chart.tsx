"use client";

// show_chart is a *custom* tool: Managed Agents doesn't run it, we do. When
// the agent calls it the session parks (session.status_idle{requires_action}
// on the custom_tool_use id); the reducer renders the tool part, and the
// session controller answers it with a user.custom_tool_result the moment it
// appears ("Rendered to the user in the chat."). The agent's "output" is this
// component: a chart drawn from the tool's input. No approval buttons here
// (custom tools are executed, not permitted), just the picture.

import type { ToolCallMessagePartComponent } from "@assistant-ui/react";
import { BarChart3Icon } from "lucide-react";
import { cn } from "@/lib/utils";

type ChartArgs = {
  title?: string;
  kind?: "bar" | "line" | string;
  x?: string[];
  series?: Array<{ name?: string; values?: number[] }>;
  unit?: string;
};

// Distinct hues that read on both light and dark backgrounds.
const PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#a855f7"];

const fmt = (n: number, unit?: string) => {
  const abs = Math.abs(n);
  const s = abs >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n * 100) / 100}`;
  return unit ? (unit === "$" || unit === "£" || unit === "€" ? `${unit}${s}` : `${s}${unit}`) : s;
};

export const ShowChartToolUI: ToolCallMessagePartComponent<ChartArgs, unknown> = ({ args, status }) => {
  // Small inputs (a few dozen points at most): compute per render, no memo.
  const x = Array.isArray(args?.x) ? args.x.map(String) : [];
  const series = (Array.isArray(args?.series) ? args.series : []).map((s, i) => ({
    name: s?.name || `series ${i + 1}`,
    values: Array.isArray(s?.values) ? s.values.map((v) => (Number.isFinite(v) ? Number(v) : 0)) : [],
    color: PALETTE[i % PALETTE.length]!,
  }));

  // Still streaming the tool input: don't try to draw a half-parsed chart.
  const ready = x.length > 0 && series.some((s) => s.values.length > 0);
  if (!ready) {
    return (
      <div className="my-1 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-muted-foreground text-xs">
        <BarChart3Icon className="size-3.5" />
        {status.type === "running" ? "Preparing chart…" : "Chart (no data)"}
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const rawMax = Math.max(...allValues, 0);
  const rawMin = Math.min(...allValues, 0);
  const kind = args?.kind === "line" ? "line" : "bar";

  // ---- geometry
  const W = 640;
  const H = 260;
  const pad = { l: 56, r: 12, t: 12, b: 44 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = rawMax === 0 && rawMin === 0 ? 1 : rawMax;
  const min = Math.min(rawMin, 0);
  const yOf = (v: number) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);

  const groups = x.length;
  const groupW = iw / groups;

  return (
    <figure className="aui-tool-chart my-1 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
        <BarChart3Icon className="size-3.5 text-muted-foreground" />
        <figcaption className="font-medium text-sm">{args?.title || "Chart"}</figcaption>
        <span className="ml-auto rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
          rendered
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={args?.title || "chart"}>
        {/* gridlines + y labels */}
        {tickVals.map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={yOf(v)}
              y2={yOf(v)}
              className="stroke-border"
              strokeDasharray={v === 0 ? "0" : "3 3"}
            />
            <text x={pad.l - 8} y={yOf(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {fmt(v, args?.unit)}
            </text>
          </g>
        ))}

        {kind === "bar"
          ? series.map((s, si) =>
              s.values.slice(0, groups).map((v, i) => {
                const bw = (groupW * 0.8) / series.length;
                const x0 = pad.l + i * groupW + groupW * 0.1 + si * bw;
                const y0 = yOf(Math.max(v, 0));
                const h = Math.abs(yOf(v) - yOf(0));
                return (
                  <rect key={`${si}-${i}`} x={x0} y={y0} width={Math.max(bw - 2, 1)} height={Math.max(h, 0.5)} rx="2" fill={s.color}>
                    <title>{`${s.name} · ${x[i]}: ${fmt(v, args?.unit)}`}</title>
                  </rect>
                );
              }),
            )
          : series.map((s) => {
              const pts = s.values.slice(0, groups).map((v, i) => {
                const cx = pad.l + i * groupW + groupW / 2;
                return `${cx},${yOf(v)}`;
              });
              return (
                <g key={s.name}>
                  <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" />
                  {s.values.slice(0, groups).map((v, i) => (
                    <circle key={i} cx={pad.l + i * groupW + groupW / 2} cy={yOf(v)} r="3" fill={s.color}>
                      <title>{`${s.name} · ${x[i]}: ${fmt(v, args?.unit)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}

        {/* x labels (thin them out if crowded) */}
        {x.map((label, i) => {
          const step = Math.ceil(groups / 10);
          if (i % step !== 0) return null;
          return (
            <text
              key={label + i}
              x={pad.l + i * groupW + groupW / 2}
              y={H - pad.b + 16}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {label.length > 10 ? `${label.slice(0, 9)}…` : label}
            </text>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 border-t px-3 py-2 text-xs">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className={cn("inline-block size-2.5 rounded-sm")} style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
};
