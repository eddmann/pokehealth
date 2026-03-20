import { useEffect, useCallback, useRef } from "react";
import { isNative, ios } from "@pwa-kit/sdk";
import { useHealth } from "../stores/healthStore";
import type { DailyHealthState } from "../lib/types";

/** How often to poll HealthKit for fresh data (ms) */
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** Get ISO date strings for yesterday (full 24h) */
function yesterdayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/** Get ISO date strings for last night's sleep window (6pm two days ago → noon yesterday) */
function sleepRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 18, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0);
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/**
 * Fetches today's health data from HealthKit via pwa-kit bridge.
 * Returns null if HealthKit is unavailable or authorization fails.
 */
async function fetchHealthData(): Promise<Omit<DailyHealthState, "useDebugValues"> | null> {
  try {
    const { available } = await ios.healthKit.isAvailable();
    if (!available) return null;

    // Request authorization for the types we need
    const auth = await ios.healthKit.requestAuthorization({
      read: ["stepCount", "activeEnergyBurned"],
      readWorkouts: true,
      readSleep: true,
    });
    if (!auth.success) return null;

    const yesterday = yesterdayRange();
    const sleep = sleepRange();

    // Fetch all of yesterday's data in parallel
    const [stepResult, workouts, sleepSamples] = await Promise.all([
      ios.healthKit.queryStepCount(yesterday),
      ios.healthKit.queryWorkouts(yesterday),
      ios.healthKit.querySleep(sleep),
    ]);

    // Steps: deduplicated total
    const steps = stepResult.totalSteps;

    // Active calories: estimated from steps (~1 cal per 20 steps) as a baseline.
    // The pwa-kit SDK doesn't yet support queryQuantity('activeEnergyBurned'),
    // so this is a rough approximation. If workout data includes calorie totals
    // (see below), those override this estimate for users who track workouts.
    let activeCalories = Math.round(steps / 20);

    // Workout minutes: sum of all workout durations
    const workoutMinutes = Math.round(
      workouts.reduce((sum, w) => sum + w.duration, 0) / 60
    );

    // If we got workout calorie data, use it instead of the step estimate
    const workoutCalories = workouts.reduce((sum, w) => sum + (w.calories ?? 0), 0);
    if (workoutCalories > 0) {
      activeCalories = Math.round(workoutCalories);
    }

    // Sleep hours: total time in any sleep stage (not "inBed" or "awake")
    const sleepMs = sleepSamples
      .filter((s) => s.stage !== "inBed" && s.stage !== "awake")
      .reduce((sum, s) => {
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        return sum + (end - start);
      }, 0);
    const sleepHours = Math.round((sleepMs / (1000 * 60 * 60)) * 10) / 10; // 1dp

    return { steps, sleepHours, activeCalories, workoutMinutes };
  } catch (e) {
    console.warn("HealthKit fetch failed:", e);
    return null;
  }
}

/**
 * Hook that polls HealthKit for today's health data when running inside
 * the PWAKit native wrapper and useDebugValues is false.
 *
 * When useDebugValues is true, HealthKit is not polled and the debug
 * values from the store are used instead.
 */
export function useHealthKit() {
  const { health, setHealth } = useHealth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useCallback(async () => {
    if (health.useDebugValues) return;
    if (!isNative) return;

    const data = await fetchHealthData();
    if (data) {
      setHealth(data);
    }
  }, [health.useDebugValues, setHealth]);

  useEffect(() => {
    // Only poll when debug values are OFF and we're in the native wrapper
    if (health.useDebugValues || !isNative) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Fetch immediately on toggle
    sync();

    // Then poll every POLL_INTERVAL
    intervalRef.current = setInterval(sync, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [health.useDebugValues, sync]);

  return { sync, isNativeAvailable: isNative };
}
