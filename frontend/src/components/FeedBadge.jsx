import { useMarket } from "../context/MarketContext";

// Tells the user, always, whether the prices they see are real or simulated.
export default function FeedBadge() {
  const { mode, connected } = useMarket();

  if (mode === "simulated") {
    return (
      <span className="badge sim" title="The server couldn't reach a real price source, so these prices are simulated.">
        <span className="dot" />
        Simulated prices
      </span>
    );
  }
  if (mode === "live") {
    return (
      <span className="badge live" title={connected ? "Streaming" : "Updating every few seconds"}>
        <span className="dot" />
        Live prices
      </span>
    );
  }
  return (
    <span className="badge">
      <span className="dot" />
      Connecting…
    </span>
  );
}
