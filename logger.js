// src/middleware/logger.js
// ═══════════════════════════════════════════════════════════
//  Experiment 2.2.1 — Custom Logging Middleware
//  Logs method, URL, status code, response time, and IP.
// ═══════════════════════════════════════════════════════════

const fs   = require("fs");
const path = require("path");

/** ANSI colour helpers (console only) */
const colours = {
  reset : "\x1b[0m",
  green : "\x1b[32m",
  yellow: "\x1b[33m",
  red   : "\x1b[31m",
  cyan  : "\x1b[36m",
  grey  : "\x1b[90m",
};

const statusColour = (code) => {
  if (code >= 500) return colours.red;
  if (code >= 400) return colours.yellow;
  if (code >= 300) return colours.cyan;
  return colours.green;
};

/**
 * requestLogger — attaches to every route via app.use()
 * Intercepts res.end() to capture the final status code.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const ip    = req.ip || req.socket.remoteAddress;

  // Override res.end so we can log AFTER the response is sent
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    originalEnd(...args);

    const ms     = Date.now() - start;
    const status = res.statusCode;
    const colour = statusColour(status);
    const ts     = new Date().toISOString();

    const line = `[${ts}] ${req.method} ${req.originalUrl} — ${status} (${ms}ms) — ${ip}`;

    // ── Console (coloured) ──────────────────────────────────
    console.log(
      `${colours.grey}[${ts}]${colours.reset} ` +
      `${colours.cyan}${req.method.padEnd(7)}${colours.reset}` +
      `${req.originalUrl.padEnd(35)} ` +
      `${colour}${status}${colours.reset} ` +
      `${colours.grey}(${ms}ms)  ${ip}${colours.reset}`
    );

    // ── File log (plain text, append) ──────────────────────
    const logPath = path.join(__dirname, "../../logs/requests.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line + "\n");
  };

  next();
};

/**
 * errorLogger — placed AFTER route handlers (4-arg signature)
 * Logs stack traces and forwards to the global error handler.
 */
const errorLogger = (err, req, res, next) => {
  const ts   = new Date().toISOString();
  const line = `[${ts}] ERROR — ${req.method} ${req.originalUrl} — ${err.message}\n${err.stack}\n`;

  console.error(`${colours.red}${line}${colours.reset}`);

  const logPath = path.join(__dirname, "../../logs/errors.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, line);

  next(err);
};

module.exports = { requestLogger, errorLogger };
