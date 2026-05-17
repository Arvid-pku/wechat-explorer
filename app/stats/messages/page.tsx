import Link from "next/link";
import { ArrowLeft, MessageSquare, Sparkles, Clock, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroCard } from "@/components/hero-card";
import { getMessagesStats } from "@/lib/stats";
import { Donut, VerticalBars, StackedArea, HourRadial } from "@/components/charts/stats/charts";
import { t, tf, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function MessagesStatsPage() {
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const s = getMessagesStats();
  const minePct = s.total > 0 ? (s.mine / s.total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToOverview")}
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{tr("stats.messages.eyebrow")}</p>
          <h1 className="text-4xl font-semibold tracking-tight mt-1">
            {fmt(s.total)}{" "}
            <span className="text-muted-foreground text-2xl font-normal">{tr("stats.messages.heroSuffix")}</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            {tf("stats.messages.heroDesc", locale, {
              mine: fmt(s.mine),
              pct: `${minePct.toFixed(1)}%`,
              theirs: fmt(s.theirs),
            })}
            {s.excludedFromCount > 0 &&
              tf("stats.messages.heroExtra", locale, { n: fmt(s.excludedFromCount) })}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroCard size="sm" icon={<MessageSquare className="size-4" />} label={tr("stats.messages.tileYours")} value={fmt(s.mine)} sub={`${minePct.toFixed(1)}%`} />
        <HeroCard size="sm" icon={<Sparkles className="size-4" />} label={tr("stats.messages.tileTheirs")} value={fmt(s.theirs)} sub={`${(100 - minePct).toFixed(1)}%`} />
        <HeroCard size="sm" icon={<Calendar className="size-4" />} label={tr("stats.messages.tileMonths")} value={fmt(s.byMonth.length)} sub={tr("stats.messages.tileMonthsSub")} />
        <HeroCard
          size="sm"
          icon={<Clock className="size-4" />}
          label={tr("stats.messages.tilePeak")}
          value={(() => {
            const peak = [...s.byHour].sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))[0];
            return `${String(peak?.hour ?? 0).padStart(2, "0")}:00`;
          })()}
          sub={(() => {
            const peak = [...s.byHour].sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))[0];
            return peak ? `${fmt(peak.mine + peak.theirs)} ${tr("stats.messages.tilePeakSub")}` : "";
          })()}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{tr("stats.messages.monthlyTitle")}</CardTitle>
          <CardDescription>{tr("stats.messages.monthlyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StackedArea
            data={s.byMonth.map((r) => ({ label: r.ym, a: r.mine, b: r.theirs }))}
            seriesLabels={[tr("stats.messages.seriesYou"), tr("stats.messages.seriesThem")]}
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.messages.typesTitle")}</CardTitle>
            <CardDescription>{tr("stats.messages.typesDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: tr("stats.messages.donutCenter"), value: fmt(s.total) }}
              data={s.byMsgType.slice(0, 10).map((r) => ({ name: r.msg_type || "—", value: r.n }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.messages.dowTitle")}</CardTitle>
            <CardDescription>{tr("stats.messages.dowDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars
              data={s.byDow.map((d) => ({ label: d.label, value: d.n }))}
              height={240}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{tr("stats.messages.byHourTitle")}</CardTitle>
          <CardDescription>{tr("stats.messages.byHourDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <HourRadial data={s.byHour} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.messages.longestTitle")}</CardTitle>
            <CardDescription>{tr("stats.messages.longestDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {s.longest.map((m) => (
                <li key={m.id} className="rounded-md border border-border/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    {m.chat_username ? (
                      <Link href={`/contacts/${encodeURIComponent(m.chat_username)}`} className="font-medium hover:underline truncate">
                        {m.chat_display}
                      </Link>
                    ) : (
                      <span className="font-medium truncate">{m.chat_display}</span>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(m.len)} {tr("stats.messages.chars")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.preview}…</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{tr("stats.messages.fastestTitle")}</CardTitle>
            <CardDescription>{tr("stats.messages.fastestDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {s.bursts.map((b, i) => (
                <li key={i} className="rounded-md border border-border/40 px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    {b.chat_username ? (
                      <Link href={`/contacts/${encodeURIComponent(b.chat_username)}`} className="font-medium hover:underline truncate">
                        {b.chat_display}
                      </Link>
                    ) : (
                      <span className="font-medium truncate">{b.chat_display}</span>
                    )}
                    <span className="text-sm font-semibold tabular-nums">{fmt(b.n)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">{b.minute}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

