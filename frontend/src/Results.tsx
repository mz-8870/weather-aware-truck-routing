import { ArrowLeft } from "lucide-react";
import { CheckpointList } from "./CheckpointList";
import { Banner } from "./components/Banner";
import { Button } from "./components/Button";
import { dayTime } from "./format";
import type { Plan, Route } from "./plan";
import { RouteCard } from "./RouteCard";
import { StopList } from "./StopList";
import styles from "./Results.module.css";
import { convertText, type Formatter } from "./units";
import { useUnits } from "./useUnits";

type Props = {
  plan: Plan;
  intervalMi: number;
  hos: boolean;
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

export function Results({ plan, intervalMi, hos, selected, expanded, onSelect, onBack }: Props) {
  const f = useUnits();
  const allBlocked = plan.recommended === null;
  const detour = detourBanner(plan);

  if (expanded) {
    const route = plan.routes[selected];
    return (
      <section className={styles.results}>
        <Button variant="ghost" className={styles.back} onClick={onBack}>
          <ArrowLeft aria-hidden className={styles.backIcon} />
          All routes
        </Button>
        <RouteCard route={route} recommended={selected === plan.recommended} why={plan.why} selected />
        {route.stops.length > 0 && <StopList stops={route.stops} />}
        <CheckpointList checkpoints={route.checkpoints} intervalMi={intervalMi} />
      </section>
    );
  }

  return (
    <section className={styles.results}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          {allBlocked ? "No safe route in this window" : `${plural(plan.routes.length)} · ${plan.routes[0].name} recommended`}
        </h2>
        <p className={styles.note}>
          {allBlocked
            ? `Every route crosses a No Travel zone for a ${f.weight(plan.cargo_lb)} load. No route is recommended.`
            : convertText("Ranked by severe miles, then high miles, average risk, travel time.", f.units)}
        </p>
        <p className={styles.note}>
          {hos
            ? "ETAs include US hours-of-service stops: a 30 min break after 8 h and a 10 h rest after 11 h of driving."
            : "ETAs assume non-stop driving."}
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
