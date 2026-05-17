import Link from "next/link";
import { ArrowLeft, Users, UserPlus, UserCheck, UserX, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getContactsStats } from "@/lib/stats";
import { Donut, VerticalBars } from "@/components/charts/stats/charts";
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function ContactsStatsPage() {
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const s = getContactsStats();
  const directPct = s.total > 0 ? (s.directMessaged / s.total) * 100 : 0;
  const groupOnlyPct = s.total > 0 ? (s.groupOnly / s.total) * 100 : 0;
  const unconnectedPct = s.total > 0 ? (s.unconnected / s.total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToOverview")}
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("stats.contacts.eyebrow")}</p>
          <h1 className="text-4xl font-semibold tracking-tight mt-1">
            {fmt(s.total)}{" "}
            <span className="text-muted-foreground text-2xl font-normal">{tr("stats.contacts.heroSuffix")}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            {tr("stats.contacts.heroDescPre")}
            <strong>{tr("stats.contacts.heroDescStrong")}</strong>
            {tr("stats.contacts.heroDescSuffix")}
          </p>
        </div>
      </header>

      {/* Hero stats strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<UserCheck className="size-4" />}
          label={tr("stats.contacts.tileDirect")}
          value={fmt(s.directMessaged)}
          sub={`${directPct.toFixed(1)}% ${tr("stats.contacts.tileDirectSub")}`}
        />
        <Tile
          icon={<UsersRound className="size-4" />}
          label={tr("stats.contacts.tileInGroups")}
          value={fmt(s.inGroupsWithYou)}
          sub={tr("stats.contacts.tileInGroupsSub")}
        />
        <Tile
          icon={<Users className="size-4" />}
          label={tr("stats.contacts.tileGroupOnly")}
          value={fmt(s.groupOnly)}
          sub={tf("stats.contacts.tileGroupOnlySub", locale, { pct: `${groupOnlyPct.toFixed(1)}%` })}
        />
        <Tile
          icon={<UserX className="size-4" />}
          label={tr("stats.contacts.tileSilent")}
          value={fmt(s.unconnected)}
          sub={tf("stats.contacts.tileSilentSub", locale, { pct: `${unconnectedPct.toFixed(1)}%` })}
        />
      </section>

      {/* Origin donut */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.contacts.howKnowTitle")}</CardTitle>
            <CardDescription>{tr("stats.contacts.howKnowDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: tr("stats.contacts.donutCenter"), value: fmt(s.total) }}
              data={[
                { name: tr("stats.contacts.howKnowDirect"), value: s.directMessaged },
                { name: tr("stats.contacts.howKnowGroup"), value: s.groupOnly },
                { name: tr("stats.contacts.howKnowSilent"), value: s.unconnected },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.contacts.groupDistTitle")}</CardTitle>
            <CardDescription>{tr("stats.contacts.groupDistDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars data={s.groupMembershipBuckets.map((b) => ({ label: b.label, value: b.n }))} height={240} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.contacts.bookVsSessTitle")}</CardTitle>
            <CardDescription>{tr("stats.contacts.bookVsSessDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              data={s.sessionsVsContacts.map((r) => ({ name: r.kind, value: r.n }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-primary" />
              {tr("stats.contacts.overlapTitle")}
            </CardTitle>
            <CardDescription>{tr("stats.contacts.overlapDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {s.topGroupOverlapPeople.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("stats.contacts.overlapEmpty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.topGroupOverlapPeople.map((p) => (
                  <li key={p.username} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/contacts/${encodeURIComponent(p.username)}`}
                      className="font-medium hover:underline truncate"
                    >
                      {p.display_name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.groups} {tr("stats.contacts.groupsSuffix")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground text-center">
        {tr("stats.contacts.legend")}
      </p>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="inline-flex items-center gap-1.5">{icon} {label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
