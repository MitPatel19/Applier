import { Hand, KeyRound, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score";
import { cn } from "@/lib/utils";

const POINTS = [
  { icon: Hand, title: "You approve every application", body: "The agent prepares; you make the call. Always." },
  { icon: WandSparkles, title: "Tailored, never invented", body: "Resume edits only use experience you actually have." },
  { icon: KeyRound, title: "No job-site passwords", body: "Connections use OAuth. Disconnect or delete anytime." },
];

/** Right-hand brand panel on the sign-in / sign-up screens. */
export function BrandPanel({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Why Applier"
      className={cn(
        "relative isolate m-3 flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface p-10 xl:p-14",
        className,
      )}
    >
      <div className="bg-aurora pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="bg-grid pointer-events-none absolute inset-0 -z-10 opacity-70" aria-hidden />

      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs font-medium text-muted">
          <Sparkles className="size-3.5 text-primary" aria-hidden /> Your personal AI career agent
        </p>
        <h2 className="mt-6 max-w-md text-[2rem] font-semibold leading-[1.15] tracking-[-0.03em]">
          A job search that works while you don&apos;t — <span className="text-gradient">and waits for your yes.</span>
        </h2>
      </div>

      {/* Illustrative product snippet */}
      <div aria-hidden className="my-10 max-w-sm">
        <div className="glass rounded-2xl border border-border p-4 shadow-pop">
          <div className="flex items-center gap-3">
            <ScoreRing score={87} size={52} stroke={5} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Junior Full Stack Developer</p>
              <p className="truncate text-caption text-muted">Northwind Labs · Toronto, ON</p>
            </div>
            <Badge tone="success" size="xs">
              Ready
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 text-caption text-muted">
            <ShieldCheck className="size-3.5 shrink-0 text-success" />
            Prepared and waiting for your approval
          </div>
        </div>
      </div>

      <ul className="space-y-5">
        {POINTS.map((p) => (
          <li key={p.title} className="flex gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-primary shadow-card">
              <p.icon className="size-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{p.title}</p>
              <p className="mt-0.5 text-sm text-muted">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
