import Link from "next/link";
import { redirect } from "next/navigation";
import { getYearKeywords } from "@/lib/queries.calendar";
import { getRecapYears } from "@/lib/recap";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Search } from "lucide-react";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function TopicsIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  // Treat ?q=… as a "go to this topic" shortcut so the page works as a quick
  // jumping-off point from the command palette.
  if (sp.q && sp.q.trim()) {
    redirect(`/topics/${encodeURIComponent(sp.q.trim())}`);
  }

  const years = getRecapYears();
  // Suggest topics from the last two years' keyword cloud — pre-computed and
  // cached, so the index page is cheap.
  const recentSuggestions = years
    .slice(0, 2)
    .flatMap((y) => {
      const r = getYearKeywords(y);
      return r.words.slice(0, 12).map((w) => ({ year: y, word: w.word, count: w.count }));
    })
    .filter((s, i, arr) => arr.findIndex((x) => x.word === s.word) === i)
    .slice(0, 30);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <Link
        href="/"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5 mr-1" /> {tr("common.backToOverview")}
      </Link>

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {tr("topics.title")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{tr("topics.subtitle")}</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">{tr("topics.desc")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" /> {tr("topics.lookup")}
          </CardTitle>
          <CardDescription>{tr("topics.lookupDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/topics" method="get" className="flex gap-2 flex-wrap">
            <input
              type="text"
              name="q"
              autoFocus
              placeholder={tr("topics.placeholder")}
              className="flex-1 min-w-[260px] h-10 rounded-md border border-border/60 bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              {tr("topics.track")}
            </button>
          </form>
        </CardContent>
      </Card>

      {recentSuggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("topics.suggestions")}</CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "近两年关键词云中的醒目词汇，点击即可追踪。"
                : "Distinctive words from the last couple of years' keyword cloud. Click to track one."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {recentSuggestions.map((s) => (
                <Link
                  key={s.word}
                  href={`/topics/${encodeURIComponent(s.word)}`}
                  className="inline-flex items-center gap-1 rounded-md bg-muted hover:bg-accent px-2 py-1 text-sm transition-colors"
                  title={`${s.word} (${s.count} mentions in ${s.year})`}
                >
                  <span className="font-medium">{s.word}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{s.count}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
