import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import ApiPlayground from "@/pages/ApiPlayground";
import RequestActivity from "@/pages/RequestActivity";
import { Navigate, Route, Routes, useLocation } from "react-router";

function PageTitle() {
  const location = useLocation();
  const titles: Record<string, string> = {
    "/dashboard": "Dashboard",
    "/playground": "API Playground",
    "/activity": "Request Activity",
  };
  const title = titles[location.pathname] || "";
  return (
    <header className="flex h-16 items-center border-b bg-card px-4 md:px-6">
      <h1 className="text-xl font-semibold">{title}</h1>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col md:ml-0">
        <PageTitle />
        <main className="flex-1 p-4 md:p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/playground" element={<ApiPlayground />} />
            <Route path="/activity" element={<RequestActivity />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
