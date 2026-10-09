import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import DeltaLayout from "./layouts/DeltaLayout";
import AppLockGate from "./components/AppLockGate";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Trading = lazy(() => import("./pages/Trading"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Journal = lazy(() => import("./pages/Journal"));
const News = lazy(() => import("./pages/News"));
const Insights = lazy(() => import("./pages/Insights"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const Founder = lazy(() => import("./pages/Founder"));
const Compounding = lazy(() => import("./pages/Compounding"));
const Settings = lazy(() => import("./pages/Settings"));


export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <div className="splash">Loading DeltaCloud…</div>;

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-otp" element={<VerifyOtp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        {/* Invite links: the code was already saved on page load; send them to sign up. */}
        <Route path="/r/:code" element={<Navigate to="/register" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <AppLockGate>
      <Routes>
        <Route element={<DeltaLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/news" element={<News />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/ai-advisor" element={<Navigate to="/insights" replace />} />
          <Route path="/compounding" element={<Compounding />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/founder" element={<Founder />} />
        </Route>
        <Route path="/r/:code" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLockGate>
  );
}
