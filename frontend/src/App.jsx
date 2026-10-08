import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";

import Dashboard from "./pages/Dashboard";
import Trading from "./pages/Trading";
import Portfolio from "./pages/Portfolio";
import Insights from "./pages/Insights";
import Compounding from "./pages/Compounding";
import Settings from "./pages/Settings";

import DeltaLayout from "./layouts/DeltaLayout";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="splash">Loading DeltaCloud…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<DeltaLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/ai-advisor" element={<Navigate to="/insights" replace />} />
        <Route path="/compounding" element={<Compounding />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
