"use strict";

const utils = require("@iobroker/adapter-core");
const express = require("express");
const path = require("path");

const VEHICLE_DP = "bmw.0.WBY11CF080CP51905.stream.vehicle.vehicle.travelledDistance.value";
const VEHICLE_TS_DP = "bmw.0.WBY11CF080CP51905.stream.vehicle.vehicle.travelledDistance.timestamp";

const START_KM = 21345;
const ALLOWED_KM = 22500;
const LEASE_START = new Date(2026, 1, 24, 0, 0, 0, 0);
const STATE_PREFIX = "0_userdata.0.LeasingBMW";
const MAX_DELTA_KM = 1000;
const UPDATE_MS = 5 * 60 * 1000;

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function ymd(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

function startOfDay(date) {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date) {
  const d = startOfDay(date);
  const wd = d.getDay();
  const delta = wd === 0 ? 6 : wd - 1;
  return addDays(d, -delta);
}

function endOfWeekSunday(date) {
  return addDays(startOfWeekMonday(date), 6);
}

function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function endOfMonth(date) {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

function diffDaysInclusive(fromDate, toDate) {
  const a = startOfDay(fromDate).getTime();
  const b = startOfDay(toDate).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

function minDateByDay(a, b) {
  return startOfDay(a).getTime() <= startOfDay(b).getTime() ? a : b;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function parseBmwTimestampToMs(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? (v < 1e12 ? Math.round(v * 1000) : Math.round(v)) : 0;
  const s = String(v).trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function hessenHolidaysYMD(year) {
  const set = new Set([`${year}-01-01`, `${year}-05-01`, `${year}-10-03`, `${year}-12-25`, `${year}-12-26`]);
  const easter = easterSunday(year);
  set.add(ymd(addDays(easter, -2)));
  set.add(ymd(addDays(easter, 1)));
  set.add(ymd(addDays(easter, 39)));
  set.add(ymd(addDays(easter, 50)));
  set.add(ymd(addDays(easter, 60)));
  return set;
}

function isHolidayHessen(date) {
  return hessenHolidaysYMD(date.getFullYear()).has(ymd(date));
}

function adjustReturnDate(date) {
  let d = startOfDay(date);
  while (d.getDay() === 0 || isHolidayHessen(d)) d = addDays(d, -1);
  return d;
}

const LEASE_END = adjustReturnDate(addMonths(LEASE_START, 24));

const ST = {
  drivenTotalRaw: `${STATE_PREFIX}.drivenKmTotalRaw`,
  remainingTotalRaw: `${STATE_PREFIX}.remainingKmTotalRaw`,
  overKmTotal: `${STATE_PREFIX}.overKmTotal`,
  daysLeftLease: `${STATE_PREFIX}.daysLeftLease`,
  avgKmPerDayFromNow: `${STATE_PREFIX}.avgKmPerDayFromNow`,
  avgKmPerDayFromNowExact: `${STATE_PREFIX}.avgKmPerDayFromNowExact`,
  avgKmPerDayFromNowPrev2359: `${STATE_PREFIX}.avgKmPerDayFromNowPrev2359`,
  dayDeltaKmSigned: `${STATE_PREFIX}.dayDeltaKmSigned`,
  weekDeltaKmSigned: `${STATE_PREFIX}.weekDeltaKmSigned`,
  monthDeltaKmSigned: `${STATE_PREFIX}.monthDeltaKmSigned`,
  usedKmThisWeek: `${STATE_PREFIX}.usedKmThisWeek`,
  weekAllowanceAtWeekStart: `${STATE_PREFIX}.weekAllowanceAtWeekStart`,
  usedKmThisMonth: `${STATE_PREFIX}.usedKmThisMonth`,
  monthAllowanceAtMonthStart: `${STATE_PREFIX}.monthAllowanceAtMonthStart`,
  usedKmThisDay: `${STATE_PREFIX}.usedKmThisDay`,
  todayAllowance: `${STATE_PREFIX}.todayAllowance`,
  dayKey: `${STATE_PREFIX}.internal.dayKey`,
  weekKey: `${STATE_PREFIX}.internal.weekKey`,
  monthKey: `${STATE_PREFIX}.internal.monthKey`,
  baselineKmDay: `${STATE_PREFIX}.internal.baselineKmDay`,
  baselineKmWeek: `${STATE_PREFIX}.internal.baselineKmWeek`,
  baselineKmMonth: `${STATE_PREFIX}.internal.baselineKmMonth`,
  lastOdo: `${STATE_PREFIX}.internal.lastOdo`,
  lastProcessedTs: `${STATE_PREFIX}.internal.lastProcessedTs`,
};

class BmwLeasingDashboard extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: "bmw-leasing-dashboard" });
    this.server = null;
    this.app = null;
    this.updateTimer = null;
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  normalizeId(rawId) {
    if (!rawId || typeof rawId !== "string") return null;
    return decodeURIComponent(rawId.trim());
  }

  getConfiguredStateIds() {
    const raw = this.config.stateIds;
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(/[\r\n,;]+/).map((line) => line.trim()).filter(Boolean)
        : [];
    return ids.filter((id) => typeof id === "string" && id.trim().length > 0);
  }

  isLikelyValidBind(bind) {
    if (typeof bind !== "string") return false;
    const value = bind.trim();
    if (!value) return false;
    if (value === "0.0.0.0" || value === "::" || value === "localhost") return true;
    if (value.includes(",") || value.includes(" ")) return false;
    return true;
  }

  async getStatePayload(id) {
    const state = await this.getForeignStateAsync(id);
    if (!state) return null;
    return { val: state.val, ts: state.ts, ack: state.ack, lc: state.lc, q: state.q, from: state.from };
  }

  async readManyStates(ids) {
    const result = {};
    await Promise.all(ids.map(async (id) => {
      try {
        result[id] = await this.getStatePayload(id);
      } catch (error) {
        this.log.warn(`Could not read state "${id}": ${error.message}`);
        result[id] = null;
      }
    }));
    return result;
  }

  parseIdsFromRequest(req) {
    if (Array.isArray(req.body?.ids)) return req.body.ids.map((id) => this.normalizeId(id)).filter(Boolean);
    if (typeof req.query.ids === "string") return req.query.ids.split(",").map((id) => this.normalizeId(id)).filter(Boolean);
    if (typeof req.params.ids === "string") return req.params.ids.split(",").map((id) => this.normalizeId(id)).filter(Boolean);
    return [];
  }

  registerApiRoutes() {
    this.app.post("/api/getBulk", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) return res.status(400).json({ error: "No ids provided" });
      const result = await this.readManyStates(ids);
      return res.json({ result });
    });

    this.app.get("/api/getBulk", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) return res.status(400).json({ error: "No ids provided" });
      const result = await this.readManyStates(ids);
      return res.json({ result });
    });

    this.app.get("/api/getBulk/:ids", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) return res.status(400).json({ error: "No ids provided" });
      const result = await this.readManyStates(ids);
      return res.json({ result });
    });

    this.app.get("/api/get/:id", async (req, res) => {
      const id = this.normalizeId(req.params.id);
      if (!id) return res.status(400).json({ error: "No id provided" });
      const state = await this.getStatePayload(id);
      if (!state) return res.status(404).json({ error: "State not found" });
      return res.json(state);
    });

    this.app.get("/api/get", async (req, res) => {
      const id = this.normalizeId(req.query.id);
      if (!id) return res.status(400).json({ error: "No id provided" });
      const state = await this.getStatePayload(id);
      if (!state) return res.status(404).json({ error: "State not found" });
      return res.json(state);
    });

    this.app.get("/api/getPlainValue/:id", async (req, res) => {
      const id = this.normalizeId(req.params.id);
      if (!id) return res.status(400).send("");
      const state = await this.getStatePayload(id);
      if (!state) return res.status(404).send("");
      return res.type("text/plain").send(String(state.val ?? ""));
    });

    this.app.get("/api/dashboard", async (_req, res) => {
      const ids = this.getConfiguredStateIds();
      const result = await this.readManyStates(ids);
      return res.json({ result, ids });
    });
  }

  registerStaticRoutes() {
    const webRoot = path.join(__dirname, "public");
    this.app.use(express.static(webRoot));
    this.app.get("*", (_req, res) => res.sendFile(path.join(webRoot, "index.html")));
  }

  async ensureState(id, name, type = "number", unit = "") {
    await this.setForeignObjectNotExistsAsync(id, {
      type: "state",
      common: { name, type, role: "value", read: true, write: false, unit: unit || undefined },
      native: {},
    });
  }

  async ensureCalculationStates() {
    await this.ensureState(ST.drivenTotalRaw, "Driven total", "number", "km");
    await this.ensureState(ST.remainingTotalRaw, "Remaining total", "number", "km");
    await this.ensureState(ST.overKmTotal, "Over km total", "number", "km");
    await this.ensureState(ST.daysLeftLease, "Days left lease", "number", "d");
    await this.ensureState(ST.avgKmPerDayFromNow, "Avg km/day from now", "number", "km");
    await this.ensureState(ST.avgKmPerDayFromNowExact, "Avg km/day from now exact", "number", "km");
    await this.ensureState(ST.avgKmPerDayFromNowPrev2359, "Avg km/day previous 23:59", "number", "km");
    await this.ensureState(ST.dayDeltaKmSigned, "Day delta", "number", "km");
    await this.ensureState(ST.weekDeltaKmSigned, "Week delta", "number", "km");
    await this.ensureState(ST.monthDeltaKmSigned, "Month delta", "number", "km");
    await this.ensureState(ST.usedKmThisWeek, "Used week", "number", "km");
    await this.ensureState(ST.weekAllowanceAtWeekStart, "Week allowance", "number", "km");
    await this.ensureState(ST.usedKmThisMonth, "Used month", "number", "km");
    await this.ensureState(ST.monthAllowanceAtMonthStart, "Month allowance", "number", "km");
    await this.ensureState(ST.usedKmThisDay, "Used day", "number", "km");
    await this.ensureState(ST.todayAllowance, "Today allowance", "number", "km");
    await this.ensureState(ST.dayKey, "Day key", "string");
    await this.ensureState(ST.weekKey, "Week key", "string");
    await this.ensureState(ST.monthKey, "Month key", "string");
    await this.ensureState(ST.baselineKmDay, "Baseline day", "number", "km");
    await this.ensureState(ST.baselineKmWeek, "Baseline week", "number", "km");
    await this.ensureState(ST.baselineKmMonth, "Baseline month", "number", "km");
    await this.ensureState(ST.lastOdo, "Last odo", "number", "km");
    await this.ensureState(ST.lastProcessedTs, "Last ts", "number", "ms");
  }

  async getNum(id, fallback) {
    const st = await this.getForeignStateAsync(id);
    if (!st || st.val === null || st.val === undefined) return fallback;
    const n = Number(st.val);
    return Number.isFinite(n) ? n : fallback;
  }

  async getStr(id, fallback) {
    const st = await this.getForeignStateAsync(id);
    if (!st || st.val === null || st.val === undefined) return fallback;
    return String(st.val);
  }

  async setNum(id, value) {
    await this.setForeignStateAsync(id, value, true);
  }

  async updateComputedStates(forceTs = false) {
    try {
      const odoState = await this.getForeignStateAsync(VEHICLE_DP);
      if (!odoState || odoState.val === null || odoState.val === undefined) return;
      const odo = Number(odoState.val);
      if (!Number.isFinite(odo) || odo <= 0) return;

      const tsState = await this.getForeignStateAsync(VEHICLE_TS_DP);
      let tsMs = tsState ? parseBmwTimestampToMs(tsState.val) : 0;
      if (forceTs || tsMs <= 0) tsMs = Date.now();

      const lastTs = await this.getNum(ST.lastProcessedTs, 0);
      const lastOdo = await this.getNum(ST.lastOdo, 0);
      if (lastTs > 0 && tsMs <= lastTs && odo <= lastOdo) return;
      if (lastOdo > 0) {
        const d = odo - lastOdo;
        if (d < 0 || d > MAX_DELTA_KM) return;
      }

      const now = new Date();
      const dayKey = ymd(startOfDay(now));
      const weekKey = ymd(startOfWeekMonday(now));
      const monthKey = ymd(startOfMonth(now));

      const prevDayKey = await this.getStr(ST.dayKey, "");
      const prevWeekKey = await this.getStr(ST.weekKey, "");
      const prevMonthKey = await this.getStr(ST.monthKey, "");

      let baseDay = await this.getNum(ST.baselineKmDay, 0);
      let baseWeek = await this.getNum(ST.baselineKmWeek, 0);
      let baseMonth = await this.getNum(ST.baselineKmMonth, 0);

      if (!baseDay || prevDayKey !== dayKey) {
        const prevExact = await this.getNum(ST.avgKmPerDayFromNowExact, 0);
        if (prevDayKey && prevDayKey !== dayKey) await this.setNum(ST.avgKmPerDayFromNowPrev2359, round2(prevExact));
        baseDay = odo;
        await this.setNum(ST.baselineKmDay, baseDay);
        await this.setForeignStateAsync(ST.dayKey, dayKey, true);
      }
      if (!baseWeek || prevWeekKey !== weekKey) {
        baseWeek = odo;
        await this.setNum(ST.baselineKmWeek, baseWeek);
        await this.setForeignStateAsync(ST.weekKey, weekKey, true);
      }
      if (!baseMonth || prevMonthKey !== monthKey) {
        baseMonth = odo;
        await this.setNum(ST.baselineKmMonth, baseMonth);
        await this.setForeignStateAsync(ST.monthKey, monthKey, true);
      }

      const usedDay = clamp(odo - baseDay, 0, 1e9);
      const usedWeek = clamp(odo - baseWeek, 0, 1e9);
      const usedMonth = clamp(odo - baseMonth, 0, 1e9);

      const drivenTotalRaw = odo - START_KM;
      const remainingTotalRaw = ALLOWED_KM - drivenTotalRaw;
      const overKmTotal = Math.max(0, -remainingTotalRaw);

      const today = startOfDay(now);
      const leaseEndDay = startOfDay(LEASE_END);
      const daysLeftLease = today.getTime() <= leaseEndDay.getTime() ? diffDaysInclusive(today, leaseEndDay) : 0;

      const avgExact = Math.max(0, daysLeftLease > 0 ? remainingTotalRaw / daysLeftLease : 0);
      const avgRounded = round1(avgExact);

      const weekEnd = minDateByDay(endOfWeekSunday(now), LEASE_END);
      const monthEnd = minDateByDay(endOfMonth(now), LEASE_END);
      const weekDays = today.getTime() <= startOfDay(weekEnd).getTime() ? diffDaysInclusive(today, weekEnd) : 0;
      const monthDays = today.getTime() <= startOfDay(monthEnd).getTime() ? diffDaysInclusive(today, monthEnd) : 0;
      const weekAllowance = avgExact * weekDays;
      const monthAllowance = avgExact * monthDays;

      await this.setNum(ST.usedKmThisDay, round1(usedDay));
      await this.setNum(ST.usedKmThisWeek, round1(usedWeek));
      await this.setNum(ST.usedKmThisMonth, round1(usedMonth));
      await this.setNum(ST.drivenTotalRaw, round1(drivenTotalRaw));
      await this.setNum(ST.remainingTotalRaw, round1(remainingTotalRaw));
      await this.setNum(ST.overKmTotal, round1(overKmTotal));
      await this.setNum(ST.daysLeftLease, daysLeftLease);
      await this.setNum(ST.avgKmPerDayFromNowExact, round2(avgExact));
      await this.setNum(ST.avgKmPerDayFromNow, avgRounded);
      await this.setNum(ST.todayAllowance, avgRounded);
      await this.setNum(ST.weekAllowanceAtWeekStart, round1(weekAllowance));
      await this.setNum(ST.monthAllowanceAtMonthStart, round1(monthAllowance));
      await this.setNum(ST.dayDeltaKmSigned, round1(avgRounded - usedDay));
      await this.setNum(ST.weekDeltaKmSigned, round1(weekAllowance - usedWeek));
      await this.setNum(ST.monthDeltaKmSigned, round1(monthAllowance - usedMonth));
      await this.setNum(ST.lastOdo, odo);
      await this.setNum(ST.lastProcessedTs, tsMs);
    } catch (error) {
      this.log.warn(`Calculation update failed: ${error.message}`);
    }
  }

  async onReady() {
    this.app = express();
    this.app.use(express.json({ limit: "100kb" }));

    let bind = typeof this.config.bind === "string" ? this.config.bind.trim() : "";
    const port = Number(this.config.port) || 8099;

    if (!this.isLikelyValidBind(bind)) {
      const fallbackStateIds = bind;
      if ((!this.config.stateIds || String(this.config.stateIds).trim() === "") && fallbackStateIds) {
        this.config.stateIds = fallbackStateIds;
        this.log.warn("Recovered stateIds from invalid bind field.");
      }
      bind = "0.0.0.0";
      this.log.warn("Invalid bind value detected. Falling back to 0.0.0.0");
    }

    this.registerApiRoutes();
    this.registerStaticRoutes();

    await this.ensureCalculationStates();

    await new Promise((resolve, reject) => {
      this.server = this.app.listen(port, bind, () => {
        this.log.info(`Dashboard server started on http://${bind}:${port}`);
        resolve();
      });
      this.server.on("error", reject);
    });

    await this.updateComputedStates(true);

    this.subscribeForeignStates(VEHICLE_DP);
    this.subscribeForeignStates(VEHICLE_TS_DP);

    this.on("stateChange", async (id) => {
      if (id === VEHICLE_DP || id === VEHICLE_TS_DP) await this.updateComputedStates(false);
    });

    this.updateTimer = setInterval(() => {
      this.updateComputedStates(true);
    }, UPDATE_MS);

    this.log.info(`Leasing start ${ymd(LEASE_START)} | adjusted return ${ymd(LEASE_END)}`);
  }

  onUnload(callback) {
    try {
      if (this.updateTimer) clearInterval(this.updateTimer);
      if (this.server) {
        this.server.close(() => callback());
      } else {
        callback();
      }
    } catch {
      callback();
    }
  }
}

if (require.main !== module) {
  module.exports = (options) => new BmwLeasingDashboard(options);
} else {
  new BmwLeasingDashboard();
}
