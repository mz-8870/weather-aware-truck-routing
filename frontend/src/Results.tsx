import { ArrowLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import { CheckpointList } from "./CheckpointList";
import { Banner } from "./components/Banner";
import { Button } from "./components/Button";
import { dayTime } from "./format";
import type { Plan, Route } from "./plan";
import { RouteCard } from "./RouteCard";
import styles from "./Results.module.css";
import { convertText, type Formatter } from "./units";
import { useUnits } from "./useUnits";

type Props = {
  plan: Plan;
  intervalMi: number;
  selected: number;
  expanded: boolean;
  onSelect: (index: number) => void;
  onBack: () => void;
};

const plural = (n: number) => `${n} route${n === 1 ? "" : "s"}`;

function noTravelBanner(route: Route, f: Formatter) {
  const first = route.checkpoints.find((c) => c.level === 4);
  const when = first ? ` around ${dayTime(first.eta)}` : "";
  const why = first?.reasons[0] ? ` — ${convertText(first.reasons[0].replace(/: No Travel$/, ""), f.units)}` : "";
  return { title: `${route.name} crosses a No Travel zone`, body: `${f.distance(route.summary.notravel_mi)}${when}${why}. Ranked last.` };
}

function detourBanner(plan: Plan) {
  const detours = plan.routes.filter((r) => r.synthesized);
  if (detours.length)
    return {
      title: `Only ${plural(plan.routes_found)} found — added ${detours.length === 1 ? "a detour" : `${detours.length} detours`}`,
      body: detours
        .map((r) => (r.detour_via ? `${r.name} goes via ${r.detour_via}` : `${r.name} is a detour`))
        .join("; ")
        .concat(` so you can compare ${plan.routes.length} options.`),
    };
  if (plan.routes.length < 3)
    return { title: `Only ${plural(plan.routes.length)} found`, body: "No usable alternative or detour was found for this trip." };
  return null;
}

export function Results({ plan, intervalMi, selected, expanded, onSelect, onBack }: Props) {
  const f = useUnits();
  const allBlocked = plan.recommended === null;
  const detour = detourBanner(plan);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrolledFor = useRef<Plan>(null);

  // A new plan lands below the form, so bring its results into view. Once per plan: in Chromium a
  // second smooth scroll in the same frame (StrictMode re-runs effects) cancels the first.
  useEffect(() => {
    if (scrolledFor.current === plan) return;
    scrolledFor.current = plan;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [plan]);

  if (expanded) {
    const route = plan.routes[selected];
    return (
      <section className={styles.results}>
        <Button variant="ghost" className={styles.back} onClick={onBack}>
          <ArrowLeft aria-hidden className={styles.backIcon} />
          All routes
        </Button>
        <RouteCard route={route} recommended={selected === plan.recommended} why={plan.why} selected />
        <CheckpointList checkpoints={route.checkpoints} intervalMi={intervalMi} />
      </section>
    );
  }

  return (
    <section className={styles.results}>
      <div className={styles.head}>
        <h2 ref={heading} className={styles.title}>
          {allBlocked ? "No safe route in this window" : `${plural(plan.routes.length)} · ${plan.routes[0].name} recommended`}
        </h2>
        <p className={styles.note}>
          {allBlocked
            ? `Every route crosses a No Travel zone for a ${f.weight(plan.cargo_lb)} load. No route is recommended.`
            : convertText("Ranked by severe miles, then high miles, average risk, travel time.", f.units)}
        </p>
      </div>
      {allBlocked ? (
        <Banner tone="notravel" title={`No Travel on ${plan.routes.length === 1 ? "the only route" : `all ${plan.routes.length} routes`}`} body="Try a later departure or a lighter load." />
      ) : (
        plan.routes.filter((r) => r.summary.notravel_mi > 0).map((r) => <Banner key={r.name} tone="notravel" {...noTravelBanner(r, f)} />)
      )}
      {detour && <Banner tone="info" {...detour} />}
      {plan.routes.map((route, i) => (
        <RouteCard
          key={route.name}
          route={route}
          recommended={i === plan.recommended}
          why={plan.why}
          selected={i === selected}
          onSelect={() => onSelect(i)}
        />
      ))}
    </section>
  );
}
