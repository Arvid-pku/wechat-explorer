import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { detectOnboardingState } from "@/lib/onboarding";
import { getOverview } from "@/lib/queries";
import { getRecapYears } from "@/lib/recap";
import { getSurprises } from "@/lib/surprises";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HeroCard } from "@/components/hero-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Sparkles, TrendingUp, TrendingDown, UserPlus, Activity, Trophy, ArrowUpRight } from "lucide-react";
import { ActivityChart } from "@/components/charts/activity-chart";
import { TopDomainsBar } from "@/components/charts/top-domains-bar";
import { MsgTypeList } from "@/components/charts/msg-type-list";
import { t, type Locale, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

const SURPRISE_ICONS = {
  spike: TrendingUp,
  "quiet-streak": TrendingDown,
  "fresh-contact": UserPlus,
  "favorite-shift": Activity,
  milestone: Trophy,
  "new-domain": ArrowUpRight,
} as const;

export const dynamic = "force-dynamic";

function fmtNum(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function Page() {
  // First-time check: if wx-cli isn't installed/initialised, the dashboard
  // would just render zeros. Bounce to the guided wizard instead.
  const onb = detectOnboardingState();
  if (onb.nextStep !== null) redirect("/onboarding");

  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  const o = getOverview();
  const lastIndexed = o.lastIndexedAt ? new Date(Number(o.lastIndexedAt)) : null;
  const years = getRecapYears();
  const latestYear = years[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-8">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr("overview.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lastIndexed
              ? `${tr("overview.lastRefreshed")} ${formatDistanceToNow(lastIndexed, { addSuffix: true })}`
              : tr("overview.notIndexed")}
          </p>
        </div>
        {latestYear && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/recap/${latestYear}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
            >
              <Sparkles className="size-3.5" />
              {latestYear} {tr("overview.recap")}
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
        <HeroCard
          href="/stats/sessions"
          label={tr("overview.sessions")}
          value={fmtNum(o.sessions.total)}
          sub={
            <span className="text-xs text-muted-foreground space-x-2">
              <Badge variant="secondary" className="font-normal">
                {fmtNum(o.sessions.private)} {locale === "zh" ? "私聊" : "private"}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {fmtNum(o.sessions.group)} {locale === "zh" ? "群聊" : "group"}
              </Badge>
              <Badge variant="secondary" className="font-normal">
                {fmtNum(o.sessions.official)} {locale === "zh" ? "公众号" : "official"}
              </Badge>
            </span>
          }
        />
        <HeroCard
          href="/stats/messages"
          label={tr("overview.indexedMessages")}
          value={fmtNum(o.messages.total)}
          sub={
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 flex-wrap">
              <span>
                {locale === "zh"
                  ? `近 30 天 ${fmtNum(o.messages.last30d)} · 本周 ${fmtNum(o.messages.last7d)}`
                  : `${fmtNum(o.messages.last30d)} in last 30 days · ${fmtNum(o.messages.last7d)} this week`}
              </span>
              {o.messages.prior30d > 0 && (
                <PeriodDelta current={o.messages.last30d} prior={o.messages.prior30d} />
              )}
            </span>
          }
        />
        <HeroCard
          href="/stats/links"
          label={tr("overview.sharedLinks")}
          value={fmtNum(o.urls.total)}
          sub={
            <span className="text-xs text-muted-foreground">
              {locale === "zh"
                ? `${fmtNum(o.urls.uniqueDomains)} 个独立域名`
                : `${fmtNum(o.urls.uniqueDomains)} unique domains`}
            </span>
          }
        />
        <HeroCard
          href="/stats/contacts"
          label={tr("overview.contacts")}
          value={fmtNum(o.contacts)}
          sub={
            <span className="text-xs text-muted-foreground">
              {locale === "zh" ? "通讯录中" : "in your address book"}
            </span>
          }
        />
      </section>

      {o.messages.total === 0 ? (
        <OnboardingCard locale={locale} />
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{tr("overview.activity365")}</CardTitle>
                <CardDescription>{tr("overview.activity365Desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActivityChart data={o.activityByDay} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{tr("overview.msgTypes")}</CardTitle>
                <CardDescription>{tr("overview.msgTypesDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <MsgTypeList rows={o.msgTypes} />
              </CardContent>
            </Card>
          </section>

          {/* Surprises is the slowest panel — split into its own Suspense so
              the rest of the page streams in immediately. */}
          <Suspense fallback={<SurprisesSkeleton locale={locale} />}>
            <SurprisesPanel locale={locale} />
          </Suspense>

          <section className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{tr("overview.topLinks")}</CardTitle>
                <CardDescription>{tr("overview.topLinksDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <TopDomainsBar rows={o.topDomains} />
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function OnboardingCard({ locale }: { locale: Locale }) {
  const tr = (k: TKey) => t(k, locale);
  return (
    <section className="mx-auto w-full max-w-2xl">
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-4 text-primary" /> {tr("onboarding.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{tr("onboarding.line1")}</p>
            <p>{tr("onboarding.line2")}</p>
          </div>
          <div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              <Sparkles className="size-3.5" /> {tr("onboarding.openSettings")}
            </Link>
          </div>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums shrink-0">
                1
              </span>
              <span className="pt-0.5">{tr("onboarding.step1")}</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums shrink-0">
                2
              </span>
              <span className="pt-0.5">
                <code className="text-xs px-1 py-0.5 rounded bg-muted/60">sudo wx init</code>{" "}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums shrink-0">
                3
              </span>
              <span className="pt-0.5">{tr("onboarding.step3")}</span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}

async function SurprisesPanel({ locale }: { locale: Locale }) {
  const surprises = getSurprises();
  if (surprises.length === 0) return null;
  const tr = (k: TKey) => t(k, locale);
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {tr("overview.surprises")}
          </CardTitle>
          <CardDescription>{tr("overview.surprisesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {surprises.map((s, i) => {
              const Icon = SURPRISE_ICONS[s.kind] ?? Sparkles;
              const body = (
                <div className="h-full rounded-md border border-border/40 px-3 py-2.5 hover:border-primary/40 transition-colors">
                  <div className="flex items-start gap-2">
                    <Icon className="size-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-snug">
                        {s.body}
                      </p>
                    </div>
                  </div>
                </div>
              );
              return (
                <div key={`${s.kind}-${i}`}>
                  {s.href ? <Link href={s.href}>{body}</Link> : body}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SurprisesSkeleton({ locale }: { locale: Locale }) {
  const tr = (k: TKey) => t(k, locale);
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {tr("overview.surprises")}
          </CardTitle>
          <CardDescription>{locale === "zh" ? "正在加载…" : "Loading anomalies…"}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function PeriodDelta({ current, prior }: { current: number; prior: number }) {
  // Last 30d vs the preceding 30d, expressed as a percent change. Used on
  // Overview's "Indexed messages" StatCard.
  const pct = prior > 0 ? ((current - prior) / prior) * 100 : 0;
  const arrow = pct > 0.5 ? "↑" : pct < -0.5 ? "↓" : "·";
  const tone =
    pct > 0.5
      ? "text-emerald-600 dark:text-emerald-400"
      : pct < -0.5
        ? "text-rose-600 dark:text-rose-400"
        : "text-muted-foreground";
  return (
    <span className={`${tone} tabular-nums inline-flex items-center gap-0.5 text-[10px]`} title="vs the 30 days before that">
      <span aria-hidden>{arrow}</span>
      <span>
        {pct > 0 ? "+" : ""}
        {pct.toFixed(0)}%
      </span>
    </span>
  );
}

