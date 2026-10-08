import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Icon from "../components/Icon";
import MarketTicker from "../components/MarketTicker";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/trading", label: "Trading", icon: "trading" },
  { to: "/portfolio", label: "Portfolio", icon: "portfolio" },
  { to: "/news", label: "News", icon: "news" },
  { to: "/insights", label: "Insights", icon: "insights" },
  { to: "/compounding", label: "Growth Lab", icon: "growth" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const linkClass = (base) => ({ isActive }) => `${base}${isActive ? " active" : ""}`;

export default function DeltaLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span>Δ</span> DeltaCloud
        </div>
        <nav aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass("nav-link")}>
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who" title={user?.email}>
            {user?.name || user?.email}
          </div>
          <button type="button" className="btn btn-sm" onClick={logout}>
            <Icon name="logout" size={16} /> Sign out
          </button>
          <div className="faint small">© 2025 Delta Cloud</div>
        </div>
      </aside>

      <main className="main" id="main">
        <MarketTicker />
        <Suspense fallback={<div className="page muted">Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass("")}>
            <Icon name={item.icon} size={22} />
            {item.label.replace("Growth Lab", "Growth")}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
