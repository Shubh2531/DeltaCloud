import axios from "axios";

export const BASE = (process.env.REACT_APP_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
export const API = `${BASE}/api`;

const KEYS = { access: "dc_access", refresh: "dc_refresh", user: "dc_user" };

// Browser storage can be missing or blocked, so every access is guarded.
const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};

export const tokens = {
  getAccess: () => store.get(KEYS.access),
  getRefresh: () => store.get(KEYS.refresh),
  set(access, refresh) {
    if (access) store.set(KEYS.access, access);
    if (refresh) store.set(KEYS.refresh, refresh);
  },
  clear() {
    // Only DeltaCloud's own sign-in keys; nothing else in storage is touched.
    Object.values(KEYS).forEach(store.remove);
  },
};

export const savedUser = {
  get() {
    try {
      return JSON.parse(store.get(KEYS.user) || "null");
    } catch {
      return null;
    }
  },
  set: (user) => store.set(KEYS.user, JSON.stringify(user)),
};

/* ---------------- Axios client ---------------- */
const api = axios.create({ baseURL: API, timeout: 15000 });
const plain = axios.create({ baseURL: API, timeout: 15000 }); // refresh calls skip the interceptors

api.interceptors.request.use((config) => {
  const token = tokens.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Sign-in style calls return 401 for wrong credentials. That is an answer to show, not a reason to refresh.
const NO_REFRESH = [
  "/auth/login",
  "/auth/register",
  "/auth/verify-otp",
  "/auth/resend-otp",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
  "/auth/logout",
];

let refreshing = null; // one refresh at a time; other requests wait for it

function refreshSession() {
  if (!refreshing) {
    const refreshToken = tokens.getRefresh();
    refreshing = (refreshToken
      ? plain.post("/auth/refresh", { refreshToken }).then((res) => {
          tokens.set(res.data.token, res.data.refreshToken);
          return res.data.token;
        })
      : Promise.reject(new Error("No refresh token"))
    ).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    if (status !== 401 || !config || config._retried || NO_REFRESH.some((p) => config.url?.startsWith(p))) {
      return Promise.reject(error);
    }
    config._retried = true;
    try {
      const token = await refreshSession();
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    } catch {
      tokens.clear();
      window.dispatchEvent(new Event("dc:auth-expired"));
      return Promise.reject(error);
    }
  }
);

export function errorMessage(err) {
  const fromServer = err?.response?.data?.message;
  if (fromServer) return fromServer;
  if (err?.code === "ECONNABORTED") return "The server took too long to respond. Please try again.";
  if (!err?.response) return "Can't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

export default api;
