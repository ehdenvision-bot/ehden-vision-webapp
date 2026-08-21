import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";

import Login from "./pages/Login";
import ResetRequest from "./pages/ResetRequest";
import Reset from "./pages/Reset";
import SupportLogin from "./pages/SupportLogin";
import Support from "./pages/Support";
import Portfolio from "./pages/Portfolio";
import Dashboard from "./pages/Dashboard";
import Locataires from "./pages/Locataires";
import Reserves from "./pages/Reserves";
import Edl from "./pages/Edl";
import Users from "./pages/Users";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";
import Planning from "./pages/Planning";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-request" element={<ResetRequest />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/support-login" element={<SupportLogin />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/portfolio" element={<Portfolio />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/locataires" element={<Locataires />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/edl" element={<Edl />} />
          <Route path="/reserves" element={<Reserves />} />
          <Route path="/users" element={<Users />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/support" element={<Support />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/portfolio" replace />} />
    </Routes>
  );
}
