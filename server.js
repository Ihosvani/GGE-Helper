import crypto from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.ALLIANCE_DATA_FILE || path.join(rootDirectory, "data", "alliance.json");
const port = Number(process.env.PORT) || 3001;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isAuthorized(request) {
  const configuredKey = process.env.ALLIANCE_API_KEY;
  if (!configuredKey) return false;

  const suppliedKey = request.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = Buffer.from(configuredKey);
  const supplied = Buffer.from(suppliedKey);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
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