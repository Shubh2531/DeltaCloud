import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import Icon from "../components/Icon";
import MarketTicker from "../components/MarketTicker";

// DC Intelligence is a product name and stays as-is in every language, like any brand.
const NAV = [
  { to: "/dashboard", key: "nav.dashboard", icon: "dashboard" },
  { to: "/intelligence", label: "DC Intelligence", short: "Intel", icon: "orb" },
  { to: "/trading", key: "nav.trading", icon: "trading" },
  { to: "/portfolio", key: "nav.portfolio", icon: "portfolio" },
  { to: "/journal", key: "nav.journal", icon: "journal", desktopOnly: true },
  { to: "/news", key: "nav.news", icon: "news" },
  { to: "/insights", key: "nav.insights", icon: "insights", desktopOnly: true },
  { to: "/compounding", key: "nav.growth", icon: "growth" },
  { to: "/settings", key: "nav.settings", icon: "settings" },
];

const linkClass = (base) => ({ isActive }) => `${base}${isActive ? " active" : ""}`;

export default function DeltaLayout() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const label = (item) => item.label || t(item.key);

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
              {label(item)}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who" title={user?.email}>
            {user?.name || user?.email}
          </div>
          <button type="button" className="btn btn-sm" onClick={logout}>
            <Icon name="logout" size={16} /> {t("nav.signOut")}
          </button>
          <div className="faint small">© 2025 Delta Cloud</div>
        </div>
      </aside>

      <main className="main" id="main">
        <MarketTicker />
        <Suspense fallback={<div className="page muted">Loading…</div>}>
          <div data-stage><Outlet /></div>
        </Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.filter((item) => !item.desktopOnly).map((item) => (
          <NavLink key={item.to} to={item.to} className={linkClass("")}>
            <Icon name={item.icon} size={22} />
            {item.short || label(item)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
