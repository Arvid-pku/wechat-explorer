import Link from "next/link";
import { ArrowLeft, Users, Archive, MessageSquare, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionsStats } from "@/lib/stats";
import { Donut, VerticalBars } from "@/components/charts/stats/charts";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function SessionsStatsPage() {
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const s = getSessionsStats();

  const typeLabel: Record<string, string> = {
    private: tr("stats.sessions.label.private"),
    group: tr("stats.sessions.label.group"),
    official: tr("stats.sessions.label.official"),
    folded: tr("stats.sessions.label.folded"),
    other: tr("stats.sessions.label.other"),
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToOverview")}
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("stats.sessions.eyebrow")}</p>
          <h1 className="text-4xl font-semibold tracking-tight mt-1">
            {fmt(s.totals.total)}{" "}
            <span className="text-muted-foreground text-2xl font-normal">{tr("stats.sessions.heroSuffix")}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">{tr("stats.sessions.heroDesc")}</p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<MessageSquare className="size-4" />} label={tr("stats.sessions.tileActive")} value={fmt(s.totals.active)} />
        <Tile icon={<Archive className="size-4" />} label={tr("stats.sessions.tileArchived")} value={fmt(s.totals.archived)} />
        <Tile icon={<Users className="size-4" />} label={tr("stats.sessions.tileGroups")} value={fmt(s.byType.find((t) => t.chat_type === "group")?.n ?? 0)} />
        <Tile icon={<Calendar className="size-4" />} label={tr("stats.sessions.tileNoMsgs")} value={fmt(s.noMessageCount)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.sessions.typeTitle")}</CardTitle>
            <CardDescription>{tr("stats.sessions.typeDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: tr("stats.sessions.donutActive"), value: fmt(s.totals.active) }}
              data={s.byType.map((r) => ({ name: typeLabel[r.chat_type] ?? r.chat_type, value: r.n }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.sessions.activeVsArchTitle")}</CardTitle>
            <CardDescription>{tr("stats.sessions.activeVsArchDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut data={s.byArchive.map((r) => ({ name: r.kind, value: r.n }))} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.sessions.msgsPerTitle")}</CardTitle>
            <CardDescription>{tr("stats.sessions.msgsPerDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars
              data={s.msgsPerSessionBuckets.map((b) => ({ label: b.label, value: b.n }))}
              height={240}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.sessions.lastActiveTitle")}</CardTitle>
            <CardDescription>{tr("stats.sessions.lastActiveDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars
              data={s.lastActiveBuckets.map((b) => ({ label: b.label, value: b.n }))}
              height={240}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{tr("stats.sessions.largestGroupsTitle")}</CardTitle>
          <CardDescription>{tr("stats.sessions.largestGroupsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {s.topGroupsBySize.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {tr("stats.sessions.noMembers")}{" "}
              <Link href="/settings" className="underline">{tr("settings.title")}</Link>{" "}
              → {tr("stats.sessions.noMembersSuffix")}
            </p>
          ) : (
            <ul className="space-y-2">
              {s.topGroupsBySize.map((g) => {
                const max = s.topGroupsBySize[0].member_count || 1;
                return (
                  <li key={g.username}>
                    <Link href={`/contacts/${encodeURIComponent(g.username)}`} className="group">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate group-hover:underline">{g.display_name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{fmt(g.member_count)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${(g.member_count / max) * 100}%` }} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {s.archivedReasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.sessions.whyArchivedTitle")}</CardTitle>
            <CardDescription>{tr("stats.sessions.whyArchivedDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars
              data={s.archivedReasons.map((r) => ({ label: r.reason, value: r.n }))}
              height={200}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="inline-flex items-center gap-1.5">{icon} {label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
