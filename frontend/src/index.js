import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { MarketProvider } from "./context/MarketContext";

import "./styles/index.css";
import "./styles/future.css";
import "./styles/motion.css";
import "./styles/settings.css";
import { captureAttribution } from "./lib/attribution";
import { startMotion } from "./lib/motion";

// Remember an invite link or tagged link (?src=) before anything else runs.
captureAttribution();

// Reveal elements as they scroll into view; add subtle 3D tilt to cards.
startMotion();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={process.env.PUBLIC_URL || "/"}>
      <AuthProvider>
        <MarketProvider>
          <App />
        </MarketProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Make the site installable and keep the shell available offline.
// Skipped inside the native iOS/Android wrapper, which already ships its own files.
if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol) && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/sw.js`).catch(() => {});
  });
}
