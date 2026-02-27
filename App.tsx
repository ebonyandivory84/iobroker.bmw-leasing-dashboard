import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const STATE_IDS = {
  remainingKmTotalRaw: "0_userdata.0.LeasingBMW.remainingKmTotalRaw",
  overKmTotal: "0_userdata.0.LeasingBMW.overKmTotal",
  daysLeftLease: "0_userdata.0.LeasingBMW.daysLeftLease",
  avgKmPerDayFromNow: "0_userdata.0.LeasingBMW.avgKmPerDayFromNow",
  dayDeltaKmSigned: "0_userdata.0.LeasingBMW.dayDeltaKmSigned",
  weekDeltaKmSigned: "0_userdata.0.LeasingBMW.weekDeltaKmSigned",
  monthDeltaKmSigned: "0_userdata.0.LeasingBMW.monthDeltaKmSigned",
  usedKmThisWeek: "0_userdata.0.LeasingBMW.usedKmThisWeek",
  weekAllowanceAtWeekStart: "0_userdata.0.LeasingBMW.weekAllowanceAtWeekStart",
  usedKmThisMonth: "0_userdata.0.LeasingBMW.usedKmThisMonth",
  monthAllowanceAtMonthStart: "0_userdata.0.LeasingBMW.monthAllowanceAtMonthStart",
  usedKmThisDay: "0_userdata.0.LeasingBMW.usedKmThisDay",
  todayAllowance: "0_userdata.0.LeasingBMW.todayAllowance",
  drivenKmTotalRaw: "0_userdata.0.LeasingBMW.drivenKmTotalRaw",
} as const;

type DashboardKey = keyof typeof STATE_IDS;
type RawState = { val?: unknown; value?: unknown; ts?: number; state?: RawState };
type DashboardValues = Record<DashboardKey, number | null>;

const EMPTY_VALUES: DashboardValues = {
  remainingKmTotalRaw: null,
  overKmTotal: null,
  daysLeftLease: null,
  avgKmPerDayFromNow: null,
  dayDeltaKmSigned: null,
  weekDeltaKmSigned: null,
  monthDeltaKmSigned: null,
  usedKmThisWeek: null,
  weekAllowanceAtWeekStart: null,
  usedKmThisMonth: null,
  monthAllowanceAtMonthStart: null,
  usedKmThisDay: null,
  todayAllowance: null,
  drivenKmTotalRaw: null,
};

const iobrokerBaseUrl = process.env.EXPO_PUBLIC_IOBROKER_URL;
const iobrokerAuthToken = process.env.EXPO_PUBLIC_IOBROKER_TOKEN;
const backgroundImage = require("./assets/images/BMW 3.jpg");
const logoImage = require("./assets/images/logo.png");

function parseToNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseStateNumber(value: unknown): number | null {
  if (value && typeof value === "object") {
    const stateObj = value as RawState;
    if (stateObj.state) {
      const nested = parseStateNumber(stateObj.state);
      if (nested !== null) return nested;
    }
    if ("val" in stateObj) {
      const parsed = parseToNumber(stateObj.val);
      if (parsed !== null) return parsed;
    }
    if ("value" in stateObj) {
      const parsed = parseToNumber(stateObj.value);
      if (parsed !== null) return parsed;
    }
  }
  return parseToNumber(value);
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "--";
  const decimals = Math.abs(value) < 10 && unit !== "Tage" ? 2 : 0;
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${unit}`;
}

function getDeltaColor(value: number | null): string {
  if (value === null) return "#94A3B8";
  if (value > 0.05) return "#16A34A";
  if (value < -0.05) return "#DC2626";
  return "#EAB308";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getBudgetLineColor(used: number | null, budget: number | null): string {
  if (used === null || budget === null || budget <= 0) return "#94A3B8";
  const remaining = budget - used;
  if (remaining < 0) return "#EF4444";
  if (remaining <= 10) return "#FACC15";
  return "#22C55E";
}

function resolveBulkResponse(payload: unknown, ids: string[]): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};

  if ("result" in payload && typeof payload.result === "object" && payload.result) {
    return payload.result as Record<string, unknown>;
  }

  if ("data" in payload && typeof payload.data === "object" && payload.data) {
    return payload.data as Record<string, unknown>;
  }

  if (Array.isArray(payload)) {
    const byId = payload.reduce<Record<string, unknown>>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const maybeId = (item as { id?: unknown }).id;
      if (typeof maybeId === "string") acc[maybeId] = item;
      return acc;
    }, {});

    if (Object.keys(byId).length > 0) return byId;

    if (payload.length === ids.length) {
      return ids.reduce<Record<string, unknown>>((acc, id, index) => {
        acc[id] = payload[index];
        return acc;
      }, {});
    }
  }

  return payload as Record<string, unknown>;
}

async function fetchSingleState(base: string, id: string, headers: Record<string, string>): Promise<number | null> {
  const singleEndpoints = [
    `${base}/get/${encodeURIComponent(id)}`,
    `${base}/get?id=${encodeURIComponent(id)}`,
    `${base}/getPlainValue/${encodeURIComponent(id)}`,
  ];

  for (const url of singleEndpoints) {
    try {
      const response = await fetch(url, { method: "GET", headers });
      if (!response.ok) continue;

      const text = await response.text();
      if (!text.trim()) continue;

      try {
        const parsedJson = JSON.parse(text) as unknown;
        const parsed = parseStateNumber(parsedJson);
        if (parsed !== null) return parsed;
      } catch {
        const parsed = parseToNumber(text);
        if (parsed !== null) return parsed;
      }
    } catch {
      // intentional: try next endpoint format
    }
  }

  return null;
}

async function fetchBulkStates(): Promise<DashboardValues> {
  const runtimeBaseUrl = iobrokerBaseUrl || (Platform.OS === "web" ? "/api" : undefined);
  if (!runtimeBaseUrl) {
    throw new Error("EXPO_PUBLIC_IOBROKER_URL fehlt.");
  }

  const ids = Object.values(STATE_IDS);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (iobrokerAuthToken) {
    headers.Authorization = `Bearer ${iobrokerAuthToken}`;
  }

  const base = runtimeBaseUrl.replace(/\/$/, "");
  const endpoints = [
    {
      url: `${base}/getBulk`,
      options: { method: "POST", headers, body: JSON.stringify({ ids }) } as RequestInit,
    },
    {
      url: `${base}/getBulk?ids=${encodeURIComponent(ids.join(","))}`,
      options: { method: "GET", headers } as RequestInit,
    },
    {
      url: `${base}/getBulk/${encodeURIComponent(ids.join(","))}`,
      options: { method: "GET", headers } as RequestInit,
    },
  ];

  let lastError: unknown = new Error("Unbekannter Fehler");
  let resolved: Record<string, unknown> = {};

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, endpoint.options);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} (${endpoint.url})`);
        continue;
      }
      const json = (await response.json()) as unknown;
      resolved = resolveBulkResponse(json, ids);
      if (Object.keys(resolved).length > 0) break;
    } catch (error) {
      lastError = error;
    }
  }

  const mapped = (Object.keys(STATE_IDS) as DashboardKey[]).reduce((acc, key) => {
    const id = STATE_IDS[key];
    const direct = resolved[id];
    const encoded = resolved[encodeURIComponent(id)];
    const fallbackKey = Object.keys(resolved).find((itemKey) => safeDecode(itemKey) === id);
    const fallbackValue = fallbackKey ? resolved[fallbackKey] : undefined;

    acc[key] = parseStateNumber(direct ?? encoded ?? fallbackValue);
    return acc;
  }, { ...EMPTY_VALUES });

  const hasAnyValue = Object.values(mapped).some((value) => value !== null);
  if (hasAnyValue) return mapped;

  const singleFetched = await Promise.all(
    (Object.keys(STATE_IDS) as DashboardKey[]).map(async (key) => {
      const parsed = await fetchSingleState(base, STATE_IDS[key], headers);
      return [key, parsed] as const;
    })
  );
  const fallbackMapped = singleFetched.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, { ...EMPTY_VALUES });

  if (!Object.values(fallbackMapped).some((value) => value !== null)) {
    throw new Error(
      `Keine gueltigen Werte von iobroker erhalten (Bulk + Single fehlgeschlagen). Letzter Fehler: ${String(lastError)}`
    );
  }

  return fallbackMapped;
}

function ProgressCard({
  title,
  used,
  budget,
}: {
  title: string;
  used: number | null;
  budget: number | null;
}) {
  const ratio = useMemo(() => {
    if (used === null || budget === null || budget <= 0) return 0;
    return used / budget;
  }, [used, budget]);

  const lineColor = getBudgetLineColor(used, budget);
  const remaining = used !== null && budget !== null ? budget - used : null;
  const safeUsed = Math.max(used ?? 0, 0);
  const safeBudget = Math.max(budget ?? 0, 0);
  const scaleMax = Math.max(safeUsed, safeBudget, 1);
  const fillFraction = Math.max(0, Math.min(safeUsed / scaleMax, 1));
  const markerFraction = Math.max(0, Math.min(safeBudget / scaleMax, 1));

  const remainingLabel =
    remaining === null
      ? "Rest: --"
      : remaining < 0
        ? `Ueberzogen: ${formatValue(Math.abs(remaining), "km")}`
        : `Rest: ${formatValue(remaining, "km")}`;

  return (
    <View style={styles.progressCard}>
      <Text style={styles.progressTitle}>{title}</Text>
      <Text style={styles.progressValue}>
        {formatValue(used, "km")} / {formatValue(budget, "km")}
      </Text>
      <View style={styles.progressWrap}>
        <View style={[styles.progressTrack, { borderColor: lineColor }]}>
          <View style={[styles.progressFill, { width: `${fillFraction * 100}%`, backgroundColor: lineColor }]} />
          <View style={[styles.budgetMarker, { left: `${markerFraction * 100}%` }]} />
        </View>
      </View>
      <Text style={[styles.progressMeta, { color: lineColor }]}>{remainingLabel}</Text>
    </View>
  );
}

function StatCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | null;
  unit: string;
  color?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{formatValue(value, unit)}</Text>
    </View>
  );
}

function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState<DashboardValues>(EMPTY_VALUES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const loadData = useCallback(
    async (isPullToRefresh = false) => {
      if (isPullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const next = await fetchBulkStates();
        setValues(next);
        setUpdatedAt(new Date());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unbekannter Fehler");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setValues]
  );

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      loadData();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadData]);

  return (
    <ImageBackground source={backgroundImage} style={styles.background} resizeMode="cover">
      <View style={styles.backgroundOverlay} />
      <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              tintColor="#E2E8F0"
            />
          }
        >
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>BMW Leasing KM Monitoring</Text>
              <Text style={styles.subtitle}>Bulk-Update alle 30 Minuten</Text>
              {updatedAt ? (
                <Text style={styles.subtle}>Zuletzt aktualisiert: {updatedAt.toLocaleString("de-DE")}</Text>
              ) : null}
            </View>
            <Image source={logoImage} style={styles.logo} resizeMode="contain" />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#38BDF8" />
            </View>
          ) : (
            <>
              <View style={styles.grid}>
                <StatCard label="Rest-km gesamt" value={values.remainingKmTotalRaw} unit="km" />
                <StatCard label="Über-km" value={values.overKmTotal} unit="km" />
                <StatCard label="Tage bis Rückgabe" value={values.daysLeftLease} unit="Tage" />
                <StatCard label="Soll km/Tag ab jetzt" value={values.avgKmPerDayFromNow} unit="km" />
                <StatCard
                  label="Saldo heute"
                  value={values.dayDeltaKmSigned}
                  unit="km"
                  color={getDeltaColor(values.dayDeltaKmSigned)}
                />
                <StatCard
                  label="Saldo Woche"
                  value={values.weekDeltaKmSigned}
                  unit="km"
                  color={getDeltaColor(values.weekDeltaKmSigned)}
                />
                <StatCard
                  label="Saldo Monat"
                  value={values.monthDeltaKmSigned}
                  unit="km"
                  color={getDeltaColor(values.monthDeltaKmSigned)}
                />
                <StatCard label="Gesamt gefahren km" value={values.drivenKmTotalRaw} unit="km" />
              </View>

              <View style={styles.progressSection}>
                <ProgressCard
                  title="Tag: Verbrauch vs Budget"
                  used={values.usedKmThisDay}
                  budget={values.todayAllowance}
                />
                <ProgressCard
                  title="Woche: Verbrauch vs Budget"
                  used={values.usedKmThisWeek}
                  budget={values.weekAllowanceAtWeekStart}
                />
                <ProgressCard
                  title="Monat: Verbrauch vs Budget"
                  used={values.usedKmThisMonth}
                  budget={values.monthAllowanceAtMonthStart}
                />
              </View>
            </>
          )}

          <TouchableOpacity style={styles.button} onPress={() => loadData(true)}>
            <Text style={styles.buttonText}>Jetzt aktualisieren</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DashboardScreen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2, 6, 23, 0.56)",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  logo: {
    width: 56,
    height: 56,
    marginTop: 2,
  },
  title: {
    color: "#E2E8F0",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: "#BFDBFE",
    fontSize: 14,
  },
  subtle: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  errorText: {
    color: "#FECACA",
    fontSize: 13,
    backgroundColor: "rgba(69, 10, 10, 0.72)",
    borderColor: "rgba(239, 68, 68, 0.8)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  loader: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 90,
    justifyContent: "space-between",
  },
  statLabel: {
    color: "#94A3B8",
    fontSize: 13,
  },
  statValue: {
    color: "#E2E8F0",
    fontSize: 20,
    fontWeight: "700",
  },
  progressSection: {
    gap: 10,
    marginTop: 4,
  },
  progressCard: {
    backgroundColor: "rgba(15, 23, 42, 0.62)",
    borderColor: "rgba(148, 163, 184, 0.35)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  progressTitle: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "600",
  },
  progressValue: {
    color: "#E2E8F0",
    fontSize: 18,
    fontWeight: "700",
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    overflow: "visible",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  budgetMarker: {
    position: "absolute",
    marginLeft: -1,
    top: -3,
    width: 2,
    height: 14,
    backgroundColor: "rgba(226, 232, 240, 0.95)",
  },
  progressMeta: {
    fontSize: 13,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "rgba(3, 105, 161, 0.8)",
    borderColor: "rgba(224, 242, 254, 0.4)",
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 8,
  },
  buttonText: {
    color: "#E0F2FE",
    fontWeight: "700",
  },
});
