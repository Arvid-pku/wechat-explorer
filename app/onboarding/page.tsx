import { redirect } from "next/navigation";
import { detectOnboardingState } from "@/lib/onboarding";
import { getDb } from "@/lib/db";
import { t, type TKey } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { OnboardingClient } from "./client";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const sp = await searchParams;
  const state = detectOnboardingState();

  let indexed = false;
  try {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS n FROM messages")
      .get() as { n: number };
    indexed = row.n > 0;
  } catch {
    indexed = false;
  }

  // Already set up and the user landed here organically — bounce home. The
  // `?force=1` escape hatch lets users open this page to re-run a step.
  if (state.nextStep === null && indexed && sp.force !== "1") {
    redirect("/");
  }

  const locale = await getServerLocale();
  const tr = (k: TKey) => t(k, locale);
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="space-y-2 mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {tr("onboarding.eyebrow")}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {tr("onboarding.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tr("onboarding.desc")}
        </p>
      </header>

      <OnboardingClient initialState={{ ...state, indexed }} locale={locale} />
    </div>
  );
}
