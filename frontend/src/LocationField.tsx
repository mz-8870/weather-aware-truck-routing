import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Field } from "./components/Field";
import styles from "./LocationField.module.css";

export type Place = { label: string; kind: string; lat: number; lon: number };

type Props = {
  label: string;
  value: string;
  onChange: (text: string) => void; // typing: the caller drops any picked coordinates
  onPick: (place: Place) => void;
  error?: string;
};

const DEBOUNCE_MS = 250;
const MIN_CHARS = 3;

async function suggest(q: string): Promise<Place[]> {
  const res = await fetch(`/api/geocode?${new URLSearchParams({ q })}`);
  if (!res.ok) return [];
  return ((await res.json()).suggestions ?? []) as Place[];
}

export function LocationField({ label, value, onChange, onPick, error }: Props) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  // A new list replaces the old one, so a highlight from the old list is meaningless.
  useEffect(() => setActive(-1), [query]);

  const { data: places = [] } = useQuery({
    queryKey: ["suggest", query],
    queryFn: () => suggest(query),
    enabled: open && query.length >= MIN_CHARS,
    staleTime: 5 * 60_000,
  });
  const shown = open && query.length >= MIN_CHARS && places.length > 0;

  function pick(place: Place) {
    onPick(place);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!shown) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = places.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && places[active]) {
      e.preventDefault(); // pick, don't submit the form
      pick(places[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Field
        label={label}
        required
        value={value}
        error={error}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {shown && (
        <div className={styles.popup}>
          <ul id={listId} role="listbox" aria-label={`${label} suggestions`} className={styles.list}>
            {places.map((p, i) => (
              <li
                key={i}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={styles.option}
                // mousedown, not click: it fires before the input's blur closes the list
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
              >
                <MapPin className={styles.icon} aria-hidden />
                <span className={styles.label}>{p.label}</span>
                <span className={styles.kind}>{p.kind}</span>
              </li>
            ))}
          </ul>
          <p className={styles.hint}>↑↓ to move · Enter to select · Esc to close</p>
        </div>
      )}
    </div>
  );
}
