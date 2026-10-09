import { useCallback, useEffect, useState } from "react";
import api from "../lib/api";

// One place to load and update everything on the Settings page: profile, preferences,
// security info and the dropdown options the backend supports.
export function useSettings() {
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: settings }, { data: opts }] = await Promise.all([
        api.get("/settings"),
        api.get("/settings/options"),
      ]);
      setData(settings);
      setOptions(opts);
      setError("");
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't load your settings. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updatePrefs = useCallback(async (patch) => {
    const { data: res } = await api.patch("/settings/preferences", patch);
    setData((d) => (d ? { ...d, preferences: res.preferences } : d));
    return res;
  }, []);

  const updateProfile = useCallback(async (patch) => {
    const { data: res } = await api.patch("/settings/profile", patch);
    setData((d) => (d ? { ...d, profile: res.profile } : d));
    return res;
  }, []);

  // For flows that update the profile themselves (email change's two-step code),
  // so the page doesn't need a full reload to show the new state.
  const setProfile = useCallback((profile) => {
    setData((d) => (d ? { ...d, profile } : d));
  }, []);

  return { data, options, loading, error, reload: load, updatePrefs, updateProfile, setProfile };
}
