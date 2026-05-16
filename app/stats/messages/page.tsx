import Link from "next/link";
import { ArrowLeft, MessageSquare, Sparkles, Clock, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessagesStats } from "@/lib/stats";
import { Donut, VerticalBars, StackedArea, HourRadial } from "@/components/charts/stats/charts";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function MessagesStatsPage() {
  const s = getMessagesStats();
  const minePct = s.total > 0 ? (s.mine / s.total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> Overview
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Indexed messages</p>
          <h1 className="text-4xl font-semibold tracking-tight mt-1">
            {fmt(s.total)} <span className="text-muted-foreground text-2xl font-normal">messages</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            {fmt(s.mine)} from you ({minePct.toFixed(1)}%), {fmt(s.theirs)} from everyone else.
            {s.excludedFromCount > 0 && (
              <>
                {" "}Plus {fmt(s.excludedFromCount)} more from official accounts and the folded inbox that
                are excluded from these charts.
              </>
            )}
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon={<MessageSquare className="size-4" />} label="Yours" value={fmt(s.mine)} sub={`${minePct.toFixed(1)}%`} />
        <Tile icon={<Sparkles className="size-4" />} label="Theirs" value={fmt(s.theirs)} sub={`${(100 - minePct).toFixed(1)}%`} />
        <Tile icon={<Calendar className="size-4" />} label="Months covered" value={fmt(s.byMonth.length)} sub="of indexed history" />
        <Tile
          icon={<Clock className="size-4" />}
          label="Peak hour"
          value={(() => {
            const peak = [...s.byHour].sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))[0];
            return `${String(peak?.hour ?? 0).padStart(2, "0")}:00`;
          })()}
          sub={(() => {
            const peak = [...s.byHour].sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))[0];
            return peak ? `${fmt(peak.mine + peak.theirs)} msgs` : "";
          })()}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Activity by month (you vs them)</CardTitle>
          <CardDescription>Stacked: your share on top of theirs over your full indexed history.</CardDescription>
        </CardHeader>
        <CardContent>
          <StackedArea
            data={s.byMonth.map((r) => ({ label: r.ym, a: r.mine, b: r.theirs }))}
            seriesLabels={["You", "Them"]}
          />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Message types</CardTitle>
            <CardDescription>Donut of the indexed type distribution.</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: "messages", value: fmt(s.total) }}
              data={s.byMsgType.slice(0, 10).map((r) => ({ name: r.msg_type || "—", value: r.n }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>By weekday</CardTitle>
            <CardDescription>Does the weekend look different?</CardDescription>
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
          <CardTitle>By hour of day</CardTitle>
          <CardDescription>Radial — your circadian pattern at a glance. Bars are total messages per hour (24-hour clock).</CardDescription>
        </CardHeader>
        <CardContent>
          <HourRadial data={s.byHour} />
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Longest messages</CardTitle>
            <CardDescription>Your top-5 single-message essays.</CardDescription>
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
                    <span className="text-xs text-muted-foreground tabular-nums">{fmt(m.len)} chars</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.preview}…</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fastest minutes</CardTitle>
            <CardDescription>Most messages in a single minute — usually a hot group convo.</CardDescription>
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

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
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
