import { Suspense } from "react";
import { SearchView } from "@/components/search-view";
import { getDb } from "@/lib/db";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; chat?: string; archived?: string }>;
}) {
  // Resolve the chat scope server-side so the page can pass the display name
  // to the client view for the pill — saves a client-side fetch round trip.
  const sp = await searchParams;
  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  let scopeUsername: string | null = null;
  let scopeDisplay: string | null = null;
  if (sp.chat) {
    const row = getDb()
      .prepare(`SELECT username, display_name FROM sessions WHERE username = ?`)
      .get(sp.chat) as { username: string; display_name: string } | undefined;
    if (row) {
      scopeUsername = row.username;
      scopeDisplay = row.display_name;
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{tr("search.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{tr("search.desc")}</p>
      </header>
      <Suspense>
        <SearchView scopeUsername={scopeUsername} scopeDisplay={scopeDisplay} />
      </Suspense>
    </div>
  );
}
