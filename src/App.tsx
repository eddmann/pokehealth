import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HealthProvider } from "./stores/healthStore";
import GameScreen from "./components/GameScreen";
import DebugScreen from "./components/DebugScreen";
import Nav from "./components/Nav";
import { useHealthKit } from "./hooks/useHealthKit";

function AppShell() {
  // Poll HealthKit for yesterday's data when debug values are off
  useHealthKit();

  return (
    <div className="min-h-dvh flex flex-col bg-slate-900 pt-[env(safe-area-inset-top)]">
      <main className="flex-1 overflow-y-auto pb-16">
        <Routes>
          <Route path="/" element={<GameScreen />} />
          <Route path="/debug" element={<DebugScreen />} />
        </Routes>
      </main>
      <Nav />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", prevent);
    document.addEventListener("contextmenu", prevent);
    return () => {
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("contextmenu", prevent);
    };
  }, []);

  return (
    <HealthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </HealthProvider>
  );
}
