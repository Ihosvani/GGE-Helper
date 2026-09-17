import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.ALLIANCE_DATA_FILE || path.join(rootDirectory, "data", "alliance.json");
const attacksDataFile = process.env.ATTACKS_DATA_FILE || path.join(rootDirectory, "data", "attacks.json");
const port = Number(process.env.PORT) || 3001;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const detectedAtPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const MAX_STORED_ATTACKS = 2000;

function isAuthorized(request) {
  const configuredKey = process.env.ALLIANCE_API_KEY;
  if (!configuredKey) return false;

  const suppliedKey = request.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(configuredKey);
  const supplied = Buffer.from(suppliedKey);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function timingSafeEqualStrings(a, b) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    crypto.timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function isAuthorizedBasic(request) {
  const configuredUser = process.env.ATTACK_API_USERNAME;
  const configuredPass = process.env.ATTACK_API_PASSWORD;
  if (!configuredUser || !configuredPass) return false;

  const match = (request.get("authorization") || "").match(/^Basic\s+(.+)$/i);
  if (!match) return false;

  let decoded;
  try {
    decoded = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return false;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) return false;

  const suppliedUser = decoded.slice(0, separatorIndex);
  const suppliedPass = decoded.slice(separatorIndex + 1);
  return timingSafeEqualStrings(suppliedUser, configuredUser) && timingSafeEqualStrings(suppliedPass, configuredPass);
}

function validateAttackPayload(value) {
  if (!value || typeof value !== "object") return "Body must be a JSON object.";

  const requiredIntFields = [
    "mid", "kingdom", "x", "y", "attacker_oid",
    "attacker_attack_count", "total_attackers_on_target", "pt", "tt"
  ];
  for (const field of requiredIntFields) {
    if (!Number.isInteger(value[field])) return `${field} must be an integer.`;
  }

  if (typeof value.rule_name !== "string" || !value.rule_name.trim()) return "rule_name must be a non-empty string.";
  if (typeof value.attacker_name !== "string" || !value.attacker_name.trim()) return "attacker_name must be a non-empty string.";
  if (value.alliance_id !== null && !Number.isInteger(value.alliance_id)) return "alliance_id must be an integer or null.";
  if (value.alliance_name !== null && typeof value.alliance_name !== "string") return "alliance_name must be a string or null.";
  if (typeof value.is_own_alliance !== "boolean") return "is_own_alliance must be a boolean.";
  if (typeof value.detected_at !== "string" || !detectedAtPattern.test(value.detected_at)) {
    return "detected_at must be formatted as YYYY-MM-DD HH:MM:SS.";
  }

  return null;
}

async function readAttacks() {
  try {
    return JSON.parse(await readFile(attacksDataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeAttacks(attacksByMid) {
  await mkdir(path.dirname(attacksDataFile), { recursive: true });
  const temporaryFile = `${attacksDataFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(attacksByMid, null, 2)}\n`, "utf8");
  await rename(temporaryFile, attacksDataFile);
}

function validateSnapshot(value) {
  if (!value || !Array.isArray(value.members) || !Array.isArray(value.attacks)) {
    return "Body must contain members and attacks arrays.";
  }

  const memberNames = value.members.map((member) => typeof member === "string" ? member.trim() : member?.name?.trim());
  if (memberNames.some((name) => !name)) return "Every member must have a non-empty name.";
  if (new Set(memberNames).size !== memberNames.length) return "Member names must be unique.";

  for (const attack of value.attacks) {
    if (!attack || typeof attack.member !== "string" || !memberNames.includes(attack.member.trim())) {
      return "Every attack must reference an alliance member.";
    }
    if (typeof attack.timestamp !== "string" || !isoTimestampPattern.test(attack.timestamp) || Number.isNaN(Date.parse(attack.timestamp))) {
      return "Every attack must have a valid ISO timestamp.";
    }
    if (attack.target !== undefined && typeof attack.target !== "string") {
      return "Attack targets must be strings.";
    }
  }

  return null;
}

async function readSnapshot() {
  try {
    return JSON.parse(await readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { members: [], attacks: [], updatedAt: null };
    throw error;
  }
}

async function writeSnapshot(snapshot) {
  await mkdir(path.dirname(dataFile), { recursive: true });
  const temporaryFile = `${dataFile}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporaryFile, dataFile);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_request, response) => response.json({ ok: true }));

  app.get("/api/alliance", async (_request, response, next) => {
    try {
      response.json(await readSnapshot());
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/alliance", async (request, response, next) => {
    if (!isAuthorized(request)) return response.status(401).json({ error: "Unauthorized" });

    const validationError = validateSnapshot(request.body);
    if (validationError) return response.status(400).json({ error: validationError });

    const snapshot = {
      members: request.body.members.map((member) => typeof member === "string" ? member.trim() : { ...member, name: member.name.trim() }),
      attacks: request.body.attacks.map((attack) => ({
        member: attack.member.trim(),
        timestamp: new Date(attack.timestamp).toISOString(),
        ...(attack.target ? { target: attack.target } : {})
      })),
      updatedAt: new Date().toISOString()
    };

    try {
      await writeSnapshot(snapshot);
      response.status(201).json(snapshot);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/attacks", async (request, response, next) => {
    if (!isAuthorizedBasic(request)) {
      response.set("WWW-Authenticate", 'Basic realm="attacks"');
      return response.status(401).json({ error: "Unauthorized" });
    }

    const validationError = validateAttackPayload(request.body);
    if (validationError) return response.status(400).json({ error: validationError });

    try {
      const attacksByMid = await readAttacks();
      attacksByMid[String(request.body.mid)] = { ...request.body, receivedAt: new Date().toISOString() };

      const entries = Object.entries(attacksByMid);
      if (entries.length > MAX_STORED_ATTACKS) {
        entries.sort(([, a], [, b]) => new Date(a.receivedAt) - new Date(b.receivedAt));
        await writeAttacks(Object.fromEntries(entries.slice(entries.length - MAX_STORED_ATTACKS)));
      } else {
        await writeAttacks(attacksByMid);
      }

      response.status(201).json({ ok: true, mid: request.body.mid });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/attacks", async (request, response, next) => {
    try {
      const attacksByMid = await readAttacks();
      const list = Object.values(attacksByMid).sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      const limit = Number(request.query.limit);
      const limited = Number.isFinite(limit) && limit > 0 ? list.slice(0, limit) : list;
      response.json({ attacks: limited, count: limited.length });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400) {
      return response.status(400).json({ error: "Request body must be valid JSON." });
    }
    console.error(error);
    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(port, () => console.log(`Alliance API listening on http://localhost:${port}`));
}