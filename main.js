"use strict";

const utils = require("@iobroker/adapter-core");
const express = require("express");
const path = require("path");

class BmwLeasingDashboard extends utils.Adapter {
  constructor(options = {}) {
    super({
      ...options,
      name: "bmw-leasing-dashboard",
    });

    this.server = null;
    this.app = null;

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
        ? raw
            .split(/[\r\n,;]+/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    return ids.filter((id) => typeof id === "string" && id.trim().length > 0);
  }

  async getStatePayload(id) {
    const state = await this.getForeignStateAsync(id);
    if (!state) return null;

    return {
      val: state.val,
      ts: state.ts,
      ack: state.ack,
      lc: state.lc,
      q: state.q,
      from: state.from,
    };
  }

  async readManyStates(ids) {
    const result = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          result[id] = await this.getStatePayload(id);
        } catch (error) {
          this.log.warn(`Could not read state "${id}": ${error.message}`);
          result[id] = null;
        }
      })
    );
    return result;
  }

  parseIdsFromRequest(req) {
    if (Array.isArray(req.body?.ids)) {
      return req.body.ids.map((id) => this.normalizeId(id)).filter(Boolean);
    }

    if (typeof req.query.ids === "string") {
      return req.query.ids
        .split(",")
        .map((id) => this.normalizeId(id))
        .filter(Boolean);
    }

    if (typeof req.params.ids === "string") {
      return req.params.ids
        .split(",")
        .map((id) => this.normalizeId(id))
        .filter(Boolean);
    }

    return [];
  }

  registerApiRoutes() {
    this.app.post("/api/getBulk", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) {
        return res.status(400).json({ error: "No ids provided" });
      }
      const result = await this.readManyStates(ids);
      return res.json({ result });
    });

    this.app.get("/api/getBulk", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) {
        return res.status(400).json({ error: "No ids provided" });
      }
      const result = await this.readManyStates(ids);
      return res.json({ result });
    });

    this.app.get("/api/getBulk/:ids", async (req, res) => {
      const ids = this.parseIdsFromRequest(req);
      if (ids.length === 0) {
        return res.status(400).json({ error: "No ids provided" });
      }
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
    this.app.get("*", (_req, res) => {
      res.sendFile(path.join(webRoot, "index.html"));
    });
  }

  async onReady() {
    this.app = express();
    this.app.use(express.json({ limit: "100kb" }));

    this.registerApiRoutes();
    this.registerStaticRoutes();

    const port = Number(this.config.port) || 8099;
    const bind = this.config.bind || "0.0.0.0";

    await new Promise((resolve, reject) => {
      this.server = this.app.listen(port, bind, () => {
        this.log.info(`Dashboard server started on http://${bind}:${port}`);
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  onUnload(callback) {
    try {
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
