"use strict";

const MIN_QUESTION_LENGTH = 10;
const MAX_QUESTION_LENGTH = 2000;
const MAX_BODY_BYTES = 12 * 1024;
const MAX_REPORT_LENGTH = 200000;
const UPSTREAM_TIMEOUT_MS = 55000;
const REPORT_KEYS = ["report", "reportText", "result", "output", "answer", "summary", "text", "content"];

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

function getWebhookUrl() {
  const raw = process.env.MAKE_WEBHOOK_URL;
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
  }

  const headers = req.headers || {};
  const contentType = String(headers["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    return sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Send the question as JSON.");
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error && error.code === "BODY_TOO_LARGE") {
      return sendError(res, 413, "BODY_TOO_LARGE", "The request is too large.");
    }
    if (error && error.code === "INVALID_JSON") {
      return sendError(res, 400, "INVALID_JSON", "The request body must be valid JSON.");
    }
    console.error("Could not read investigation request body.");
    return sendError(res, 400, "INVALID_REQUEST", "The request could not be read.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError(res, 400, "INVALID_REQUEST", "Send a JSON object with a question.");
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < MIN_QUESTION_LENGTH || question.length > MAX_QUESTION_LENGTH) {
    return sendError(
      res,
      400,
      "INVALID_QUESTION",
      "Enter an investigation question between 10 and 2,000 characters."
    );
  }

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    console.error("MAKE_WEBHOOK_URL is missing or is not a valid HTTPS URL.");
    return sendError(
      res,
      503,
      "NOT_CONFIGURED",
      "The investigation service is not configured yet. Add MAKE_WEBHOOK_URL in Vercel and redeploy."
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  try {
    let upstream;
    try {
      upstream = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain;q=0.9",
          "User-Agent": "Veritas-Investigation/1.0"
        },
        body: JSON.stringify({ question: question }),
        signal: controller.signal,
        redirect: "follow"
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        return sendError(
          res,
          504,
          "TIMEOUT",
          "The investigation took too long. Try a narrower question or try again."
        );
      }
      throw error;
    }

    const raw = await upstream.text();

    if (!upstream.ok) {
      console.error("Make webhook returned HTTP " + upstream.status + ".");
      return sendError(
        res,
        502,
        "UPSTREAM_ERROR",
        "The investigation service returned an error. Please try again."
      );
    }

    let report = parseReport(raw, String(upstream.headers.get("content-type") || ""));
    if (!report) {
      console.error("Make webhook returned no usable report.");
      return sendError(
        res,
        502,
        "EMPTY_REPORT",
        "The investigation finished without a report. Check that the Make.com scenario ends with a Webhook response module."
      );
    }

    if (report.length > MAX_REPORT_LENGTH) {
      report = report.slice(0, MAX_REPORT_LENGTH) + "\n\n[Report truncated]";
    }

    return sendJson(res, 200, {
      ok: true,
      report: report,
      receivedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Investigation relay failed: " + (error && error.message ? error.message : "unknown error"));
    return sendError(
      res,
      502,
      "UPSTREAM_UNREACHABLE",
      "The investigation service could not be reached. Please try again."
    );
  } finally {
    clearTimeout(timeoutId);
  }
};
