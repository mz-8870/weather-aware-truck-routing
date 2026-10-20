// Display formatting. Times are shown in the browser's zone (SPEC: ETAs in user TZ + elapsed time).

export const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");

export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function hoursMinutes(seconds: number): [number, number] {
  const minutes = Math.round(seconds / 60);
  return [Math.floor(minutes / 60), minutes % 60];
}

export const elapsed = (seconds: number) => {
  const [h, m] = hoursMinutes(seconds);
  return `+${h}h ${m}m`;
};

export const duration = (seconds: number) => {
  const [h, m] = hoursMinutes(seconds);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
