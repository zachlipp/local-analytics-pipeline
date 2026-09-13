import "./CategorySelect.css";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Props = {
  options: string[];
  value: string[];
  // Adds when absent, removes when present; the caller owns the commit.
  onToggle: (option: string) => void;
  onFocus?: () => void;
  label: string;
  placeholder?: string;
};

type Anchor = { left: number; top: number; width: number };

export function CategorySelect({
  options,
  value,
  onToggle,
  onFocus,
  label,
  placeholder = "Type a category",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const [anchor, setAnchor] = useState<Anchor>();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const available = options.filter((o) => !value.includes(o));
  const starts = available.filter((o) => o.toLowerCase().startsWith(q));
  const contains = available.filter(
    (o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q),
  );
  const matches = q ? [...starts, ...contains] : available;
  const highlighted: string | undefined = matches[active];

  // Inline ghost completion, only when the highlighted option extends what was typed.
  const ghost =
    query && highlighted && highlighted.toLowerCase().startsWith(query.toLowerCase())
      ? highlighted.slice(query.length)
      : "";

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setError("");
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [close]);

  // Fixed, not absolute: the list has to escape the scrolling row container.
  const place = useCallback(() => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ left: rect.left, top: rect.bottom + 4, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const add = (option: string) => {
    onToggle(option);
    setQuery("");
    setError("");
    inputRef.current?.focus();
  };

  const remove = (option: string) => {
    onToggle(option);
    inputRef.current?.focus();
  };

  const commit = () => {
    if (!q && !open) return;
    const exact = options.find((o) => o.toLowerCase() === q);
    if (exact) {
      if (value.includes(exact)) setQuery("");
      else add(exact);
    } else if (highlighted) {
      add(highlighted);
    } else if (q) {
      setError(`"${query.trim()}" is not an option.`);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(i + 1, matches.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case ",":
        e.preventDefault();
        commit();
        break;
      case "Tab":
      case "ArrowRight":
        if (ghost && highlighted) {
          e.preventDefault();
          add(highlighted);
        }
        break;
      case "Backspace":
        if (!query && value.length) remove(value[value.length - 1]);
        break;
      case "Escape":
        close();
        break;
    }
  };

  const showList = open && matches.length > 0 && !!anchor;

  return (
    <div ref={rootRef} className="cs">
      <div
        ref={fieldRef}
        className={`cs-field${error ? " cs-invalid" : ""}`}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((v) => (
          <span key={v} className="cs-chip">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => remove(v)}>
              ×
            </button>
          </span>
        ))}
        <div className="cs-inputwrap">
          <span className="cs-ghost" aria-hidden="true">
            <span style={{ visibility: "hidden" }}>{query}</span>
            {ghost}
          </span>
          <input
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="both"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            aria-invalid={!!error}
            value={query}
            placeholder={value.length ? "" : placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
              setError("");
            }}
            onFocus={() => {
              setOpen(true);
              onFocus?.();
            }}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="cs-list"
          style={{ left: anchor.left, top: anchor.top, width: anchor.width }}
        >
          {matches.map((o, i) => {
            const idx = o.toLowerCase().indexOf(q);
            return (
              <li
                key={o}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "cs-active" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => add(o)}
              >
                {q && idx >= 0 ? (
                  <>
                    {o.slice(0, idx)}
                    <mark>{o.slice(idx, idx + q.length)}</mark>
                    {o.slice(idx + q.length)}
                  </>
                ) : (
                  o
                )}
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p className="cs-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
