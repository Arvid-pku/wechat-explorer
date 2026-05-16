import Link from "next/link";
import { getHeatmap } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { HeatmapClient } from "./client";

export const dynamic = "force-dynamic";

interface MessageRow {
  id: number;
  chat_username: string | null;
  chat_display: string;
  sender: string;
  msg_type: string;
  content: string;
  timestamp: number;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()), 10);
  const data = getHeatmap(year);

  let dayDetail: MessageRow[] = [];
  if (sp.day) {
    const db = getDb();
    const startSec = Math.floor(new Date(`${sp.day}T00:00:00`).getTime() / 1000);
    const endSec = startSec + 86400;
    dayDetail = db
      .prepare(
        `SELECT id, chat_username, chat_display, sender, msg_type, content, timestamp
         FROM messages
         WHERE timestamp >= ? AND timestamp < ?
         ORDER BY timestamp DESC
         LIMIT 200`,
      )
      .all(startSec, endSec) as MessageRow[];
  }

  const total = data.reduce((a, b) => a + b.n, 0);
  const max = data.reduce((a, b) => Math.max(a, b.n), 0);
  const years = [year + 1, year, year - 1, year - 2].filter((y) => y > 2010 && y <= now.getFullYear() + 1);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} messages in {year} · busiest day had {max.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {years.map((y) => (
            <Link
              key={y}
              href={`/calendar?year=${y}${sp.day ? `&day=${sp.day}` : ""}`}
              className={`rounded-md border border-border/60 px-3 py-1 text-sm hover:bg-accent ${
                y === year ? "bg-accent" : ""
              }`}
            >
              {y}
            </Link>
          ))}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Activity heatmap — {year}</CardTitle>
          <CardDescription>Click any day to see messages from that date</CardDescription>
        </CardHeader>
        <CardContent>
          <HeatmapClient year={year} data={data} selected={sp.day} />
        </CardContent>
      </Card>

      {sp.day && (
        <Card>
          <CardHeader>
            <CardTitle>{sp.day}</CardTitle>
            <CardDescription>
              {dayDetail.length.toLocaleString()} indexed messages on this day
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dayDetail.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No indexed messages — try running a deep index from Settings.
              </p>
            ) : (
              dayDetail.map((m) => (
                <div key={m.id} className="text-sm space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {m.chat_username ? (
                      <Link
                        href={`/contacts/${encodeURIComponent(m.chat_username)}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {m.chat_display}
                      </Link>
                    ) : (
                      <span className="font-medium text-foreground">{m.chat_display}</span>
                    )}
                    <span>·</span>
                    <span>{m.sender || "—"}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {new Date(m.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="break-words whitespace-pre-wrap pl-1">{m.content}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

