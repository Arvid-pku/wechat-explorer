"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as d3 from "d3";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GraphNode {
  id: string;
  kind: "group" | "person" | "me";
  label: string;
  weight: number;
  chat_type?: string;
  member_count?: number;
}
interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  kind: "membership" | "co-occurrence";
}

// d3-force annotates nodes with x/y/vx/vy at runtime.
type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = d3.SimulationLinkDatum<SimNode> & {
  weight: number;
  kind: "membership" | "co-occurrence";
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  minGroupSize: number;
  minCoOccurrence: number;
  maxGroups: number;
  blur: boolean;
  includeArchived: boolean;
}

export function GraphClient({
  nodes,
  edges,
  minGroupSize,
  minCoOccurrence,
  maxGroups,
  blur,
  includeArchived,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const svgRef = useRef<SVGSVGElement | null>(null);

  // local-controlled UI state mirrored to the URL on commit
  const [localMinGroup, setLocalMinGroup] = useState(minGroupSize);
  const [localMinCo, setLocalMinCo] = useState(minCoOccurrence);
  const [localMax, setLocalMax] = useState(maxGroups);
  const [showNames, setShowNames] = useState(!blur);
  const [withArchived, setWithArchived] = useState(includeArchived);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // Gate the SVG until after client mount: d3-force seeds positions with
  // Math.cos/Math.sin and the floating-point string serialisation can drift
  // a digit between server and client, which trips React's hydration check.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLocalMinGroup(minGroupSize);
  }, [minGroupSize]);
  useEffect(() => {
    setLocalMinCo(minCoOccurrence);
  }, [minCoOccurrence]);
  useEffect(() => {
    setLocalMax(maxGroups);
  }, [maxGroups]);
  useEffect(() => {
    setShowNames(!blur);
  }, [blur]);
  useEffect(() => {
    setWithArchived(includeArchived);
  }, [includeArchived]);

  function pushParams(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined || v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.replace(`/graph?${params.toString()}`);
  }

  // ----- simulation -----
  const width = 920;
  const height = 620;

  // Build sim inputs. Seed random positions so the layout doesn't collapse to (0,0).
  const simNodes = useMemo<SimNode[]>(
    () =>
      nodes.map((n, i) => {
        const angle = (i * 137.508 * Math.PI) / 180; // golden-angle spread
        const r = 40 + (i % 8) * 30;
        return {
          ...n,
          x: width / 2 + Math.cos(angle) * r,
          y: height / 2 + Math.sin(angle) * r,
        };
      }),
    [nodes],
  );
  const simLinks = useMemo<SimLink[]>(
    () =>
      edges.map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        kind: e.kind,
      })),
    [edges],
  );

  // Cap rendered co-occurrence edges so SVG stays responsive. Membership edges always render.
  const MAX_CO_EDGES = 1200;
  const renderLinks = useMemo<SimLink[]>(() => {
    const membership = simLinks.filter((l) => l.kind === "membership");
    const co = simLinks
      .filter((l) => l.kind === "co-occurrence")
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_CO_EDGES);
    return [...membership, ...co];
  }, [simLinks]);

  useEffect(() => {
    if (simNodes.length === 0) return;
    const sim = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(renderLinks)
          .id((d) => d.id)
          .distance((l) => (l.kind === "membership" ? 50 : 80))
          .strength((l) =>
            l.kind === "membership" ? 0.6 : Math.min(0.3, 0.05 + l.weight * 0.02),
          ),
      )
      .force("charge", d3.forceManyBody().strength(-40))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collide",
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 3),
      )
      .alpha(1)
      .alphaDecay(0.022)
      .stop();

    let raf = 0;
    let frames = 0;
    function loop() {
      // Run a few ticks per frame so the layout settles faster.
      for (let i = 0; i < 2; i++) sim.tick();
      frames += 2;
      setTick((t) => t + 1);
      if (sim.alpha() < 0.01 || frames > 200) {
        return;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      sim.stop();
    };
  }, [simNodes, renderLinks]);

  function nodeRadius(n: GraphNode): number {
    if (n.kind === "group") {
      return Math.max(6, Math.min(28, Math.sqrt(n.member_count ?? n.weight) * 2));
    }
    if (n.kind === "me") return 14;
    return Math.max(4, Math.min(18, Math.sqrt(n.weight) * 2.4));
  }

  function nodeFill(n: GraphNode): string {
    if (n.kind === "group") return "var(--primary)";
    if (n.kind === "me") return "var(--destructive)";
    return "var(--muted-foreground)";
  }

  function nodeStroke(n: GraphNode): string {
    if (n.kind === "group") return "var(--primary)";
    if (n.kind === "me") return "var(--destructive)";
    return "var(--border)";
  }

  const idIndex = useMemo(() => {
    const m = new Map<string, SimNode>();
    for (const n of simNodes) m.set(n.id, n);
    return m;
  }, [simNodes]);

  function endpoint(end: SimLink["source"] | SimLink["target"]): SimNode | undefined {
    if (typeof end === "string") return idIndex.get(end);
    if (end && typeof end === "object" && "id" in end) return idIndex.get((end as SimNode).id);
    return undefined;
  }

  // Highlight: connected nodes/edges to hovered node.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of renderLinks) {
      const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [renderLinks]);

  function isHighlighted(id: string): boolean {
    if (!hoverId) return true;
    if (id === hoverId) return true;
    return adjacency.get(hoverId)?.has(id) ?? false;
  }

  function isEdgeHighlighted(l: SimLink): boolean {
    if (!hoverId) return true;
    const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
    const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
    return s === hoverId || t === hoverId;
  }

  function onNodeClick(n: GraphNode) {
    if (n.kind === "group") {
      router.push(`/contacts/${encodeURIComponent(n.id)}`);
    } else if (n.kind === "person") {
      router.push(`/contacts/${encodeURIComponent(n.id)}`);
    }
  }

  function labelText(n: GraphNode): string {
    if (showNames || n.kind === "group" || n.kind === "me") return n.label;
    return "••••";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <div className="flex items-center gap-2 min-w-[220px]">
              <Label htmlFor="minGroup" className="w-32 shrink-0 text-muted-foreground">
                Min group size
              </Label>
              <input
                id="minGroup"
                type="range"
                min={5}
                max={200}
                step={1}
                value={localMinGroup}
                onChange={(e) => setLocalMinGroup(parseInt(e.target.value, 10))}
                onMouseUp={() => pushParams({ minGroupSize: String(localMinGroup) })}
                onTouchEnd={() => pushParams({ minGroupSize: String(localMinGroup) })}
                className="flex-1 accent-foreground"
              />
              <span className="w-9 text-right tabular-nums text-xs">{localMinGroup}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[220px]">
              <Label htmlFor="minCo" className="w-32 shrink-0 text-muted-foreground">
                Min co-occurrence
              </Label>
              <input
                id="minCo"
                type="range"
                min={2}
                max={10}
                step={1}
                value={localMinCo}
                onChange={(e) => setLocalMinCo(parseInt(e.target.value, 10))}
                onMouseUp={() => pushParams({ minCoOccurrence: String(localMinCo) })}
                onTouchEnd={() => pushParams({ minCoOccurrence: String(localMinCo) })}
                className="flex-1 accent-foreground"
              />
              <span className="w-9 text-right tabular-nums text-xs">{localMinCo}</span>
            </div>
            <div className="flex items-center gap-2 min-w-[220px]">
              <Label htmlFor="maxGroups" className="w-32 shrink-0 text-muted-foreground">
                Max groups
              </Label>
              <input
                id="maxGroups"
                type="range"
                min={20}
                max={200}
                step={5}
                value={localMax}
                onChange={(e) => setLocalMax(parseInt(e.target.value, 10))}
                onMouseUp={() => pushParams({ maxGroups: String(localMax) })}
                onTouchEnd={() => pushParams({ maxGroups: String(localMax) })}
                className="flex-1 accent-foreground"
              />
              <span className="w-9 text-right tabular-nums text-xs">{localMax}</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Switch
                id="withArchived"
                checked={withArchived}
                onCheckedChange={(v) => {
                  setWithArchived(v);
                  pushParams({ archived: v ? "1" : "" });
                }}
              />
              <Label htmlFor="withArchived" className="cursor-pointer">
                Include archived
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="showNames"
                checked={showNames}
                onCheckedChange={(v) => {
                  setShowNames(v);
                  pushParams({ blur: v ? "" : "1" });
                }}
              />
              <Label htmlFor="showNames" className="cursor-pointer">
                Show names
              </Label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-primary" /> Group
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-muted-foreground" /> Person
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full bg-destructive" /> You
            </span>
            <span className="ml-2">
              Drag a slider, then release to apply. Hover any node to highlight its neighbors;
              click a person or group to open its profile.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-border/60 bg-background/60 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          style={{ display: "block" }}
        >
          {!mounted ? null : (
          <>
          <g>
            {renderLinks.map((l, i) => {
              const a = endpoint(l.source);
              const b = endpoint(l.target);
              if (!a || !b) return null;
              const highlighted = isEdgeHighlighted(l);
              return (
                <line
                  key={i}
                  x1={a.x ?? 0}
                  y1={a.y ?? 0}
                  x2={b.x ?? 0}
                  y2={b.y ?? 0}
                  stroke={l.kind === "membership" ? "var(--border)" : "var(--muted-foreground)"}
                  strokeWidth={l.kind === "co-occurrence" ? Math.min(2.5, 0.5 + l.weight * 0.2) : 0.6}
                  strokeOpacity={highlighted ? (l.kind === "membership" ? 0.45 : 0.55) : 0.06}
                />
              );
            })}
          </g>
          <g>
            {simNodes.map((n) => {
              const r = nodeRadius(n);
              const highlighted = isHighlighted(n.id);
              const x = n.x ?? 0;
              const y = n.y ?? 0;
              const showLabel =
                n.kind === "group"
                  ? r >= 9 || hoverId === n.id || highlighted === true && hoverId !== null
                  : hoverId === n.id || n.kind === "me";
              return (
                <g
                  key={n.id}
                  transform={`translate(${x},${y})`}
                  style={{ cursor: n.kind === "me" ? "default" : "pointer" }}
                  onMouseEnter={() => setHoverId(n.id)}
                  onMouseLeave={() => setHoverId((v) => (v === n.id ? null : v))}
                  onClick={() => onNodeClick(n)}
                >
                  <circle
                    r={r}
                    fill={nodeFill(n)}
                    stroke={nodeStroke(n)}
                    strokeWidth={n.kind === "me" ? 2 : 1}
                    fillOpacity={highlighted ? (n.kind === "person" ? 0.85 : 0.9) : 0.18}
                  />
                  {showLabel && (
                    <text
                      x={r + 4}
                      y={3}
                      fontSize={n.kind === "group" ? 11 : 10}
                      fill="var(--foreground)"
                      fillOpacity={highlighted ? 0.95 : 0.3}
                      style={{ pointerEvents: "none", paintOrder: "stroke" }}
                      stroke="var(--background)"
                      strokeWidth={3}
                    >
                      {labelText(n)}
                    </text>
                  )}
                  <title>
                    {n.label}
                    {n.kind === "group" && n.member_count
                      ? ` - ${n.member_count} members`
                      : n.kind === "person"
                      ? ` - in ${n.weight} groups`
                      : n.kind === "me"
                      ? ` - in ${n.weight} groups`
                      : ""}
                  </title>
                </g>
              );
            })}
          </g>
          </>
          )}
        </svg>
      </div>
    </div>
  );
}
