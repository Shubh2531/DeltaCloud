import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { orbReading, biggestTick } from "../lib/orb";
import DeltaOrb from "./DeltaOrb";
import "../styles/orb.css";

const SPIKE = 0.0006; // a single tick that moves 0.06% or more fires the shock ring

export default function OrbCard() {
  const { prices, trail } = useMarket();
  const reading = useMemo(() => orbReading(prices, trail), [prices, trail]);

  const [spike, setSpike] = useState(0);
  const lastSpikeAt = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (biggestTick(trail) >= SPIKE && now - lastSpikeAt.current > 4000) {
      lastSpikeAt.current = now;
      setSpike((n) => n + 1);
    }
  }, [trail]);

  const swing = reading ? Math.round(reading.energy * 100) : 0;
  const lean = reading ? Math.round(reading.delta * 50) : 0; // -50..50, drawn from the centre

  return (
    <div className="card dorb">
      <div className="dorb-head">
        <h2 style={{ marginBottom: 0 }}>DC Intelligence</h2>
        <p>{reading ? `${reading.moodNote} Markets are ${reading.direction}.` : "Waiting for prices."}</p>
      </div>

      <DeltaOrb reading={reading} spike={spike} label="DC Intelligence" />

      {reading && (
        <>
          <div className="dorb-head">
            <h3>{reading.headline}</h3>
          </div>

          <div className="dorb-meters">
            <div className="dorb-meter">
              <span>Swing</span>
              <b className="tnum">{swing} / 100</b>
              <div className="dorb-bar" aria-hidden="true">
                <i style={{ left: 0, width: `${swing}%`, background: "linear-gradient(90deg,#5b7cfa,#ff9f43)" }} />
              </div>
            </div>
            <div className="dorb-meter">
              <span>Direction</span>
              <b className={`tnum ${reading.avg >= 0 ? "pos" : "neg"}`}>
                {reading.avg >= 0 ? "+" : ""}{reading.avg.toFixed(2)}% avg
              </b>
              <div className="dorb-bar" aria-hidden="true">
                <i
                  style={{
                    left: lean >= 0 ? "50%" : `${50 + lean}%`,
                    width: `${Math.abs(lean)}%`,
                    background: lean >= 0 ? "#4ade80" : "#ff5c7a",
                  }}
                />
              </div>
            </div>
            <div className="dorb-meter">
              <span>Moving the same way</span>
              <b className="tnum">{reading.agree} of {reading.total}</b>
              <div className="dorb-bar" aria-hidden="true">
                <i style={{ left: 0, width: `${(reading.agree / reading.total) * 100}%`, background: "#8b5cf6" }} />
              </div>
            </div>
          </div>

          <div className="dorb-tip">
            <b>Practice idea</b>
            {reading.tip}
          </div>

          <div className="dorb-chips">
            {reading.nodes.map((n) => (
              <span key={n.id} className={`dorb-chip ${n.change >= 0 ? "up" : "down"}`}>
                {n.base} {n.change >= 0 ? "+" : ""}{n.change.toFixed(2)}%
              </span>
            ))}
          </div>
        </>
      )}

      <Link to="/intelligence" className="btn btn-primary btn-block" style={{ textAlign: "center" }}>
        Ask DC Intelligence about any coin or stock
      </Link>

      <p className="dorb-foot">
        Each dot is a market, green when it is up on the day and red when it is down. The surface ripples harder when
        prices swing, and a ring flashes on a sudden jump. Drag to turn it. It describes what already happened and does
        not predict prices.
      </p>
    </div>
  );
}
