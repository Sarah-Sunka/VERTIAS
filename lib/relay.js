"use strict";

const MAX_BODY_BYTES = 12 * 1024;
const MAX_REPORT_LENGTH = 200000;
const REPORT_KEYS = ["report", "reportText", "result", "output", "answer", "summary", "text", "content", "briefing"];

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function sendError(res, status, code, message) {
  return sendJson(res, status, { ok: false, code: code, error: message });
}

function bodyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  let raw = "";

  if (typeof req.body === "string") {
    raw = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    raw = req.body.toString("utf8");
  } else {
    raw = await new Promise(function (resolve, reject) {
      const chunks = [];
      let size = 0;

      req.on("data", function (chunk) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          chunks.length = 0;
          reject(bodyError("BODY_TOO_LARGE", "Request body is too large."));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", function () {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      req.on("error", function (error) {
        reject(error);
      });
    });
  }

  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    throw bodyError("BODY_TOO_LARGE", "Request body is too large.");
  }
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw bodyError("INVALID_JSON", "Request body must be valid JSON.");
  }
}

function readReportValue(value, depth) {
  if (depth > 5) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  if (Array.isArray(value)) {
    return value
      .map(function (item) {
        return readReportValue(item, depth + 1);
      })
      .filter(Boolean)
      .join("\n\n");
  }

  for (const key of REPORT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = readReportValue(value[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  for (const key of ["data", "choices", "message"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const found = readReportValue(value[key], depth + 1);
      if (found) {
        return found;
      }
    }
  }

  return "";
}

function parseReport(raw, contentType) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return "";
  }

  const looksJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (looksJson) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return "";
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (parsed.success === false || parsed.ok === false) {
        return "";
      }

      const status = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
      const message = typeof parsed.message === "string" ? parsed.message.trim().toLowerCase() : "";
      const pendingStates = ["accepted", "queued", "processing", "pending"];
      if (pendingStates.includes(status) || pendingStates.includes(message)) {
        return "";
      }
    }

    const report = readReportValue(parsed, 0);
    if (report) {
      return report;
    }
    if (Array.isArray(parsed)) {
      return parsed.length ? JSON.stringify(parsed, null, 2) : "";
    }
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
      return JSON.stringify(parsed, null, 2);
    }
    return "";
  }

  if (/^accepted$/i.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function getWebhookUrl(envName) {
  const raw = process.env[envName];
  if (!raw || !raw.trim()) {
    return null;
  }

  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return null;
    }
    return url.toString();
  } catch (error) {
    return null;
  }
}

async function relayToWebhook(options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, options.upstreamTimeoutMs);

  try {
    let upstream;
    try {
      upstream = await fetch(options.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain;q=0.9",
          "User-Agent": options.userAgent
        },
        body: JSON.stringify({ question: options.question }),
        signal: controller.signal,
        redirect: "follow"
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        return { error: { status: 504, code: "TIMEOUT", message: options.timeoutMessage } };
      }
      throw error;
    }

    const raw = await upstream.text();

    if (!upstream.ok) {
      return { error: { status: 502, code: "UPSTREAM_ERROR", message: options.upstreamErrorMessage } };
    }

    let report = parseReport(raw, String(upstream.headers.get("content-type") || ""));
    if (!report) {
      return { error: { status: 502, code: "EMPTY_REPORT", message: options.emptyReportMessage } };
    }

    if (report.length > MAX_REPORT_LENGTH) {
      report = report.slice(0, MAX_REPORT_LENGTH) + "\n\n[Report truncated]";
    }

    return { report: report, receivedAt: new Date().toISOString() };
  } catch (error) {
    return { error: { status: 502, code: "UPSTREAM_UNREACHABLE", message: options.unreachableMessage } };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  sendJson: sendJson,
  sendError: sendError,
  readJsonBody: readJsonBody,
  parseReport: parseReport,
  getWebhookUrl: getWebhookUrl,
  relayToWebhook: relayToWebhook
};
