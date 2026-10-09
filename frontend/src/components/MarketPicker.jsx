import { useEffect, useId, useRef, useState } from "react";
import api from "../lib/api";
import { marketById, rememberMarkets } from "../lib/symbols";
import { pct, priceFmt, tone } from "../lib/format";
import "../styles/picker.css";

// Search any coin or US stock by name or ticker, plus one-tap chips for popular markets.
export default function MarketPicker({ value, onChange, label = "Market", allowStocks = true }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [popular, setPopular] = useState([]);
  const [counts, setCounts] = useState(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const listId = useId();
  const current = marketById(value);
  const kind = allowStocks ? undefined : "crypto";

  // Popular markets for the quick chips.
  useEffect(() => {
    let alive = true;
    api
      .get("/market/symbols", { params: { limit: 16, kind } })
      .then((res) => {
        if (!alive) return;
        rememberMarkets(res.data.symbols);
        setPopular(res.data.symbols);
        setCounts(res.data.counts);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);

  // Search as you type (after a short pause).
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .get("/market/symbols", { params: { q: term, limit: 12, kind } })
        .then((res) => {
          if (!alive) return;
          rememberMarkets(res.data.symbols);
          setResults(res.data.symbols);
          setActive(0);
        })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, kind]);

  useEffect(() => {
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const choose = (m) => {
    rememberMarkets([m]);
    onChange(m.id);
    setQ("");
    setOpen(false);
  };

  const onKey = (e) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const placeholder =
    counts && allowStocks && counts.stock > 0
      ? `Search ${counts.crypto.toLocaleString()} coins and ${counts.stock.toLocaleString()} US stocks`
      : counts
      ? `Search ${counts.crypto.toLocaleString()} coins`
      : "Search by name or ticker";

  return (
    <div className="picker" ref={boxRef}>
      <label className="picker-label" htmlFor={`${listId}-input`}>
        {label}: <b>{current.name}</b> <span className="muted">{current.base}</span>
        <span className={`kind-tag ${current.kind}`}>{current.kind === "stock" ? "Stock" : "Crypto"}</span>
      </label>
      <div className="picker-search">
        <input
          id={`${listId}-input`}
          className="input"
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
        />
        {open && q.trim() && (
          <ul className="picker-results" id={`${listId}-list`} role="listbox">
            {loading && results.length === 0 && <li className="picker-empty">Searching…</li>}
            {!loading && results.length === 0 && <li className="picker-empty">No match. Try a ticker like AAPL or BTC.</li>}
            {results.map((m, i) => (
              <li
                key={m.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : ""}
                onPointerDown={(e) => {
                  e.preventDefault();
                  choose(m);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="picker-name">
                  <b>{m.base}</b> {m.name !== m.base && <span className="muted">{m.name}</span>}
                </span>
                <span className={`kind-tag ${m.kind}`}>{m.kind === "stock" ? "Stock" : "Crypto"}</span>
                {m.price && (
                  <span className="picker-price tnum">
                    {priceFmt(m.price.c)} <span className={tone(m.price.P)}>{pct(m.price.P)}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {popular.length > 0 && (
        <div className="picker-chips" role="group" aria-label="Popular markets">
          {popular.map((m) => (
            <button key={m.id} type="button" className="btn btn-sm" aria-pressed={m.id === current.id} onClick={() => choose(m)}>
              {m.base}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
