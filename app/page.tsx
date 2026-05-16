import Link from "next/link";
import { getOverview } from "@/lib/queries";
import { getRecapYears } from "@/lib/recap";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Sparkles } from "lucide-react";
import { ActivityChart } from "@/components/charts/activity-chart";
import { TopDomainsBar } from "@/components/charts/top-domains-bar";
import { MsgTypeList } from "@/components/charts/msg-type-list";

export const dynamic = "force-dynamic";

function fmtNum(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function Page() {
  const o = getOverview();
  const lastIndexed = o.lastIndexedAt ? new Date(Number(o.lastIndexedAt)) : null;
  const years = getRecapYears();
  const latestYear = years[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lastIndexed
              ? `Index refreshed ${formatDistanceToNow(lastIndexed, { addSuffix: true })}`
              : "Index has not been built yet"}
          </p>
        </div>
        {latestYear && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/recap/${latestYear}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
            >
              <Sparkles className="size-3.5" />
              {latestYear} in Review
            </Link>
            {years.slice(1, 4).map((y) => (
              <Link
                key={y}
                href={`/recap/${y}`}
                className="rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                {y}
              </Link>
            ))}
          </div>
        )}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Sessions"
          value={fmtNum(o.sessions.total)}
          sub={
            <span className="text-xs text-muted-foreground space-x-2">
              <Badge variant="secondary" className="font-normal">{fmtNum(o.sessions.private)} private</Badge>
              <Badge variant="secondary" className="font-normal">{fmtNum(o.sessions.group)} group</Badge>
              <Badge variant="secondary" className="font-normal">{fmtNum(o.sessions.official)} official</Badge>
            </span>
          }
        />
        <StatCard
          title="Indexed messages"
          value={fmtNum(o.messages.total)}
          sub={
            <span className="text-xs text-muted-foreground">
              {fmtNum(o.messages.last30d)} in last 30 days · {fmtNum(o.messages.last7d)} this week
            </span>
          }
        />
        <StatCard
          title="Shared links"
          value={fmtNum(o.urls.total)}
          sub={<span className="text-xs text-muted-foreground">{fmtNum(o.urls.uniqueDomains)} unique domains</span>}
        />
        <StatCard
          title="Contacts"
          value={fmtNum(o.contacts)}
          sub={<span className="text-xs text-muted-foreground">in your address book</span>}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity (last 365 days)</CardTitle>
            <CardDescription>Daily message count across all indexed chats</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityChart data={o.activityByDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Message types</CardTitle>
            <CardDescription>Top types in your index</CardDescription>
          </CardHeader>
          <CardContent>
            <MsgTypeList rows={o.msgTypes} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top link sources</CardTitle>
            <CardDescription>Most shared domain groups across all chats</CardDescription>
          </CardHeader>
          <CardContent>
            <TopDomainsBar rows={o.topDomains} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        {sub}
      </CardContent>
    </Card>
  );
}
