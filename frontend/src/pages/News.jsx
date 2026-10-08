import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MARKETS } from "../lib/symbols";
import { timeAgo } from "../lib/format";
import { useNews } from "../hooks/useNews";
import Disclaimer from "../components/Disclaimer";

const TONE = { positive: "Positive wording", negative: "Negative wording", neutral: "Neutral wording" };

export function Story({ item, compact = false }) {
  const topics = (item.topics || []).slice(0, 3);
  return (
    <article className={`story${compact ? " story-compact" : ""}`}>
      <div className="story-meta">
        <b>{item.source}</b>
        {item.official && <span className="chip chip-official">Official</span>}
        <span className="muted">{timeAgo(item.publishedAt)}</span>
      </div>
      <h3>
        <a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>
      </h3>
      {!compact && item.summary && <p className="story-sum">{item.summary}</p>}
      {!compact && (
        <div className="story-tags">
          {item.assets?.map((id) => {
            const m = MARKETS.find((x) => x.id === id);
            return m ? <Link key={id} to={`/trading?symbol=${id}`} className="chip chip-asset">{m.base}</Link> : null;
          })}
          {topics.map((t) => <span key={t.id} className="chip">{t.id}</span>)}
          <span className={`chip tone-${item.tone}`}>{TONE[item.tone]}</span>
        </div>
      )}
      {!compact && item.alsoReportedBy?.length > 0 && (
        <div className="story-also small muted">
          Also reported by{" "}
          {item.alsoReportedBy.map((o, i) => (
            <span key={o.link}>
              {i > 0 && ", "}
              <a href={o.link} target="_blank" rel="noopener noreferrer">{o.source}</a>
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export default function News() {
  const [topic, setTopic] = useState("");
  const [symbol, setSymbol] = useState("");
  const [sort, setSort] = useState("top");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { items, meta, loading, error, reload } = useNews({ topic, symbol, q, sort });
  const ok = meta?.sources?.filter((s) => s.ok).length ?? 0;
  const total = meta?.sources?.length ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Delta News</h1>
          <p>Headlines from central banks, regulators and major outlets, filtered to what moves markets and ranked in the open. Every story links to the publisher.</p>
        </div>
        <div className="seg" role="group" aria-label="Sort">
          <button type="button" className="btn btn-sm" aria-pressed={sort === "top"} onClick={() => setSort("top")}>Top</button>
          <button type="button" className="btn btn-sm" aria-pressed={sort === "latest"} onClick={() => setSort("latest")}>Latest</button>
        </div>
      </div>

      <div className="card filters">
        <input className="input" type="search" placeholder="Search headlines" aria-label="Search headlines" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="seg" role="group" aria-label="Topic">
          <button type="button" className="btn btn-sm" aria-pressed={topic === ""} onClick={() => setTopic("")}>All topics</button>
          {(meta?.topics || []).map((t) => (
            <button key={t.id} type="button" className="btn btn-sm" aria-pressed={topic === t.id} onClick={() => setTopic(topic === t.id ? "" : t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Market">
          <button type="button" className="btn btn-sm" aria-pressed={symbol === ""} onClick={() => setSymbol("")}>All markets</button>
          {MARKETS.map((m) => (
            <button key={m.id} type="button" className="btn btn-sm" aria-pressed={symbol === m.id} onClick={() => setSymbol(symbol === m.id ? "" : m.id)}>{m.base}</button>
          ))}
        </div>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error} <button type="button" className="btn btn-sm" onClick={reload}>Try again</button>
        </div>
      )}

      {loading && items.length === 0 && !error && <div className="card muted">Loading stories…</div>}

      {!loading && !error && items.length === 0 && (
        <div className="card empty">
          {meta?.refreshedAt
            ? "No stories match these filters. Clear a filter to see more."
            : "The news feeds are still loading. Check back in a minute."}
        </div>
      )}

      <div className="stories">
        {items.map((it) => <Story key={it.link} item={it} />)}
      </div>

      {meta && (
        <p className="small muted">
          {total > 0 ? `${ok} of ${total} sources reachable` : ""}
          {meta.refreshedAt ? `, updated ${timeAgo(meta.refreshedAt)}` : ""}.
        </p>
      )}
      <p className="disclaimer">{meta?.disclaimer}</p>
      <Disclaimer />
    </div>
  );
}
