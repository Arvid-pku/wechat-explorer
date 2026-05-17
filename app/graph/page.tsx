import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network } from "lucide-react";
import { listGraphData } from "@/lib/queries.graph";
import { GraphClient } from "./client";
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

function parseIntParam(v: string | undefined, def: number, lo: number, hi: number): number {
  if (!v) return def;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(lo, Math.min(hi, n));
}

export default async function GraphPage({
  searchParams,
}: {
  searchParams: Promise<{
    minGroupSize?: string;
    minCoOccurrence?: string;
    maxGroups?: string;
    blur?: string;
    archived?: string;
  }>;
}) {
  const sp = await searchParams;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const minGroupSize = parseIntParam(sp.minGroupSize, 5, 5, 200);
  const minCoOccurrence = parseIntParam(sp.minCoOccurrence, 2, 2, 10);
  const maxGroups = parseIntParam(sp.maxGroups, 80, 20, 200);
  const blur = sp.blur === "1";
  const includeArchived = sp.archived === "1";

  const data = listGraphData({ minGroupSize, minCoOccurrence, maxGroups, includeArchived });
  const totalAvailableGroups =
    data.stats.total_groups + (includeArchived ? data.stats.archived_groups : 0);
  const totalIndexedGroups =
    data.stats.indexed_groups +
    (includeArchived ? data.stats.archived_indexed_groups : 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Network className="size-5 text-primary" />
            {tr("graph.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tf("graph.descIndexed", locale, {
              indexed: totalIndexedGroups,
              total: totalAvailableGroups,
              kind: includeArchived ? tr("graph.activeArchived") : tr("graph.active"),
            })}
            {data.nodes.length > 0 && (
              <>
                {" "}- {tr("graph.showing")}{" "}
                <span className="font-medium text-foreground">{data.stats.rendered_groups}</span>{" "}
                {tr("graph.groupsLabel")},{" "}
                <span className="font-medium text-foreground">{data.stats.rendered_people}</span>{" "}
                {tr("graph.peopleLabel")},{" "}
                <span className="font-medium text-foreground">{data.stats.co_occurrence_edges}</span>{" "}
                {tr("graph.edgesLabel")}
              </>
            )}
            {data.stats.archived_groups > 0 && !includeArchived && (
              <>
                {" "}·{" "}
                <span className="text-muted-foreground/80">
                  {tf("graph.archivedHidden", locale, { n: data.stats.archived_groups })}
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {totalIndexedGroups === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr("graph.noMembershipsTitle")}</CardTitle>
            <CardDescription>{tr("graph.noMembershipsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {tr("graph.headTo")}{" "}
              <Link href="/settings" className="font-medium underline">
                {tr("settings.title")}
              </Link>{" "}
              {tr("graph.noMembershipsHowto")}
            </p>
            <p className="text-muted-foreground">
              {tf("graph.noMembershipsCount", locale, { n: totalAvailableGroups })}
            </p>
          </CardContent>
        </Card>
      ) : data.nodes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{tr("graph.noMatchTitle")}</CardTitle>
            <CardDescription>
              {tf("graph.noMatchDesc", locale, { indexed: totalIndexedGroups, min: minGroupSize })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GraphClient
              nodes={data.nodes}
              edges={data.edges}
              minGroupSize={minGroupSize}
              minCoOccurrence={minCoOccurrence}
              maxGroups={maxGroups}
              blur={blur}
              includeArchived={includeArchived}
            />
          </CardContent>
        </Card>
      ) : (
        <GraphClient
          nodes={data.nodes}
          edges={data.edges}
          minGroupSize={minGroupSize}
          minCoOccurrence={minCoOccurrence}
          maxGroups={maxGroups}
          blur={blur}
          includeArchived={includeArchived}
        />
      )}
    </div>
  );
}
