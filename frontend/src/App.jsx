import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Import from "./pages/Import";
import Pending from "./pages/Pending";
import Transactions from "./pages/Transactions";
import EditTransactions from "./pages/EditTransactions";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import useAuthStore from "./store/authStore";
import authApi from "./api/auth";

function AuthLoader({ children }) {
  const { accessToken, user, setUser } = useAuthStore();
  useEffect(() => {
    if (accessToken && !user) {
      authApi.me().then((r) => setUser(r.data.data.user)).catch(() => {});
    }
  }, [accessToken, user, setUser]);
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthLoader>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected — with sidebar layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/accounts"     element={<Accounts />} />
              <Route path="/import"       element={<Import />} />
              <Route path="/pending"      element={<Pending />} />
              <Route path="/transactions"      element={<Transactions />} />
              <Route path="/edit-transactions" element={<EditTransactions />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthLoader>
    </BrowserRouter>
  );
}
