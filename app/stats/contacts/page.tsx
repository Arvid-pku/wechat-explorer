import Link from "next/link";
import { ArrowLeft, Users, UserPlus, UserCheck, UserX, UsersRound } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getContactsStats } from "@/lib/stats";
import { Donut, VerticalBars } from "@/components/charts/stats/charts";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export default async function ContactsStatsPage() {
  const s = getContactsStats();
  const directPct = s.total > 0 ? (s.directMessaged / s.total) * 100 : 0;
  const groupOnlyPct = s.total > 0 ? (s.groupOnly / s.total) * 100 : 0;
  const unconnectedPct = s.total > 0 ? (s.unconnected / s.total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-8">
      <header className="space-y-3">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5 mr-1" /> Overview
        </Link>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Address book breakdown</p>
          <h1 className="text-4xl font-semibold tracking-tight mt-1">
            {fmt(s.total)} <span className="text-muted-foreground text-2xl font-normal">contacts</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl">
            That number is large because WeChat counts <strong>every group-chat member you&apos;ve ever
            encountered</strong>, not just your accepted friends. Below is the breakdown — most are people
            you&apos;ve never sent a direct message to.
          </p>
        </div>
      </header>

      {/* Hero stats strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<UserCheck className="size-4" />}
          label="Directly messaged"
          value={fmt(s.directMessaged)}
          sub={`${directPct.toFixed(1)}% of address book`}
        />
        <Tile
          icon={<UsersRound className="size-4" />}
          label="In groups with you"
          value={fmt(s.inGroupsWithYou)}
          sub="member of ≥ 1 of your groups"
        />
        <Tile
          icon={<Users className="size-4" />}
          label="Group-only acquaintances"
          value={fmt(s.groupOnly)}
          sub={`${groupOnlyPct.toFixed(1)}% — never DM'd`}
        />
        <Tile
          icon={<UserX className="size-4" />}
          label="Silent contacts"
          value={fmt(s.unconnected)}
          sub={`${unconnectedPct.toFixed(1)}% — no chat, no group`}
        />
      </section>

      {/* Origin donut */}
      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How you know each contact</CardTitle>
            <CardDescription>
              Split by whether you have a 1:1 chat with them, only share group(s), or neither.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Donut
              centerLabel={{ title: "contacts", value: fmt(s.total) }}
              data={[
                { name: "Direct chat", value: s.directMessaged },
                { name: "Group only", value: s.groupOnly },
                { name: "Silent (no chat)", value: s.unconnected },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Group overlap distribution</CardTitle>
            <CardDescription>
              Of contacts who share at least one group with you, how many groups do you co-inhabit?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VerticalBars data={s.groupMembershipBuckets.map((b) => ({ label: b.label, value: b.n }))} height={240} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Address book vs sessions</CardTitle>
            <CardDescription>
              Three-way split: in contacts only, in both, or only as a session row.
            </CardDescription>
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
              Most-overlapping people
            </CardTitle>
            <CardDescription>
              Ranked by how many of your groups they sit in. Often classmates, colleagues, or family.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {s.topGroupOverlapPeople.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No group membership data indexed yet — backfill via Settings → Fetch member counts.
              </p>
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
                      {p.groups} groups
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground text-center">
        Definitions: <em>direct chat</em> = a session with chat_type=&quot;private&quot;.{" "}
        <em>Group only</em> = appears in your group_members but no 1:1 session.{" "}
        <em>Silent</em> = no session and no shared group — usually old or never-acted-on contacts.
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
