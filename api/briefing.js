"use strict";

const relay = require("../lib/relay");

const MIN_TOPIC_LENGTH = 10;
const MAX_TOPIC_LENGTH = 2000;
const UPSTREAM_TIMEOUT_MS = 55000;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return relay.sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint.");
  }

  const headers = req.headers || {};
  const contentType = String(headers["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    return relay.sendError(res, 415, "UNSUPPORTED_MEDIA_TYPE", "Send the topic as JSON.");
  }

  let body;
  try {
    body = await relay.readJsonBody(req);
  } catch (error) {
    if (error && error.code === "BODY_TOO_LARGE") {
      return relay.sendError(res, 413, "BODY_TOO_LARGE", "The request is too large.");
    }
    if (error && error.code === "INVALID_JSON") {
      return relay.sendError(res, 400, "INVALID_JSON", "The request body must be valid JSON.");
    }
    console.error("Could not read briefing request body.");
    return relay.sendError(res, 400, "INVALID_REQUEST", "The request could not be read.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return relay.sendError(res, 400, "INVALID_REQUEST", "Send a JSON object with a topic.");
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH) {
    return relay.sendError(
      res,
      400,
      "INVALID_TOPIC",
      "Enter a briefing topic between 10 and 2,000 characters."
    );
  }

  const webhookUrl = relay.getWebhookUrl("MAKE_BRIEFING_WEBHOOK_URL");
  if (!webhookUrl) {
    console.error("MAKE_BRIEFING_WEBHOOK_URL is missing or is not a valid HTTPS URL.");
    return relay.sendError(
      res,
      503,
      "NOT_CONFIGURED",
      "The briefing service is not configured yet. Add MAKE_BRIEFING_WEBHOOK_URL in Vercel and redeploy."
    );
  }

  const result = await relay.relayToWebhook({
    webhookUrl: webhookUrl,
    question: topic,
    upstreamTimeoutMs: UPSTREAM_TIMEOUT_MS,
    userAgent: "Veritas-Briefing/1.0",
    timeoutMessage: "The briefing took too long. Try a narrower topic or try again.",
    upstreamErrorMessage: "The briefing service returned an error. Please try again.",
    emptyReportMessage:
      "The briefing finished without any content. Check that the briefing scenario ends with a Webhook response module.",
    unreachableMessage: "The briefing service could not be reached. Please try again."
  });

  if (result.error) {
    if (result.error.code === "UPSTREAM_ERROR") {
      console.error("Briefing webhook returned an error status.");
    } else if (result.error.code === "EMPTY_REPORT") {
      console.error("Briefing webhook returned no usable report.");
    } else if (result.error.code === "UPSTREAM_UNREACHABLE") {
      console.error("Briefing relay failed.");
    }
    return relay.sendError(res, result.error.status, result.error.code, result.error.message);
  }

  return relay.sendJson(res, 200, {
    ok: true,
    briefing: result.report,
    receivedAt: result.receivedAt
  });
};
