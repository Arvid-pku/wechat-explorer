import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Shared "icon + label + big number + sub" tile. `href` flips it into a
 *  hoverable link card (used on the overview); `size="sm"` is the more compact
 *  variant rendered on /me, /contacts/[username] and /stats/messages. */
export function HeroCard({
  icon,
  label,
  value,
  sub,
  href,
  size = "default",
}: {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  href?: string;
  size?: "default" | "sm";
}) {
  const isSm = size === "sm";
  const inner = (
    <Card
      className={cn(
        !isSm && "h-full",
        href && "transition-colors hover:border-primary/40 cursor-pointer",
      )}
    >
      <CardHeader className="pb-2">
        <CardDescription
          className={cn(
            "inline-flex items-center",
            isSm ? "gap-1.5" : "gap-1",
          )}
        >
          {icon}
          {label}
          {href && (
            <span className="text-muted-foreground/60 text-[10px] transition-opacity group-hover:opacity-100 opacity-50">
              ↗
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className={isSm ? "space-y-1" : "space-y-1.5"}>
        <div
          className={cn(
            "font-semibold tracking-tight",
            isSm ? "text-2xl tabular-nums" : "text-3xl",
          )}
        >
          {value}
        </div>
        {sub &&
          (isSm ? (
            <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>
          ) : (
            sub
          ))}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="group block">
      {inner}
    </Link>
  ) : (
    inner
  );
}
