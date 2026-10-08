import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { tokens, savedUser } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on start. The server confirms the token is still good.
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!tokens.getAccess() && !tokens.getRefresh()) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        if (!alive) return;
        savedUser.set(data.user);
        setUser(data.user);
      } catch (err) {
        if (!alive) return;
        const cached = savedUser.get();
        if (!err.response && cached && tokens.getAccess()) {
          setUser(cached); // offline: open with the last known profile
        } else {
          tokens.clear();
          setUser(null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // The API client raises this when a refresh fails, so one place handles sign-out.
    const onExpired = () => setUser(null);
    window.addEventListener("dc:auth-expired", onExpired);
    return () => {
      alive = false;
      window.removeEventListener("dc:auth-expired", onExpired);
    };
  }, []);

  const login = useCallback(({ token, refreshToken, user: nextUser }) => {
    tokens.set(token, refreshToken);
    savedUser.set(nextUser);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokens.getRefresh();
    try {
      if (refreshToken) await api.post("/auth/logout", { refreshToken });
    } catch {
      /* signing out locally is enough if the server can't be reached */
    }
    tokens.clear();
    try {
      sessionStorage.removeItem("dc_otp_email");
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: Boolean(user), login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
