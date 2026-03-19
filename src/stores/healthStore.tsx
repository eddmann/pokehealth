import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { DailyHealthState, ActiveModifiers } from "../lib/types";
import { computeModifiers } from "../lib/health";
import { DEFAULT_HEALTH } from "../lib/presets";
import { saveHealthState, loadHealthState } from "../lib/db";

type HealthStore = {
  health: DailyHealthState;
  modifiers: ActiveModifiers;
  setHealth: (partial: Partial<DailyHealthState>) => void;
  resetHealth: () => void;
  applyPreset: (values: Omit<DailyHealthState, "useDebugValues">) => void;
};

const HealthContext = createContext<HealthStore | null>(null);

const INITIAL_STATE: DailyHealthState = {
  ...DEFAULT_HEALTH,
  useDebugValues: true,
};

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealthState] = useState<DailyHealthState>(INITIAL_STATE);
  const [loaded, setLoaded] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    loadHealthState().then((saved) => {
      if (saved) setHealthState(saved);
      setLoaded(true);
    });
  }, []);

  // Persist on change (after initial load)
  useEffect(() => {
    if (loaded) {
      saveHealthState(health);
    }
  }, [health, loaded]);

  const modifiers = computeModifiers(health);

  const setHealth = useCallback((partial: Partial<DailyHealthState>) => {
    setHealthState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetHealth = useCallback(() => {
    setHealthState({ ...INITIAL_STATE });
  }, []);

  const applyPreset = useCallback(
    (values: Omit<DailyHealthState, "useDebugValues">) => {
      setHealthState((prev) => ({ ...prev, ...values }));
    },
    []
  );

  return (
    <HealthContext.Provider
      value={{ health, modifiers, setHealth, resetHealth, applyPreset }}
    >
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth(): HealthStore {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error("useHealth must be used within HealthProvider");
  return ctx;
}
