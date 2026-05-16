import { Suspense } from "react";
import { SearchView } from "@/components/search-view";

export default function SearchPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Full-text search across indexed messages — Chinese substring matching included.
        </p>
      </header>
      <Suspense>
        <SearchView />
      </Suspense>
    </div>
  );
}
