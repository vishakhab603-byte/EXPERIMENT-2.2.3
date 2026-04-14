// src/server.js
// ═══════════════════════════════════════════════════════════
//  Entry point — wires all experiments together
//  Experiments: 2.2.1 (Middleware), 2.2.2 (JWT), 2.2.3 (Txns)
// ═══════════════════════════════════════════════════════════

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const express      = require("express");
const path         = require("path");
const connectDB    = require("./config/db");
const { requestLogger, errorLogger } = require("./middleware/logger");
const errorHandler = require("./middleware/errorHandler");
const authRoutes   = require("./routes/auth");
const bankingRoutes= require("./routes/banking");

const app = express();

// ── 1. Connect to MongoDB ────────────────────────────────────
connectDB();

// ── 2. Built-in middleware ───────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 3. Experiment 2.2.1 — Custom logging middleware ─────────
//       Applied globally so EVERY request is logged
app.use(requestLogger);

// ── 4. Static files (serves the API explorer UI) ────────────
app.use(express.static(path.join(__dirname, "../public")));

// ── 5. Health-check ─────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success  : true,
    status   : "OK",
    timestamp: new Date().toISOString(),
    uptime   : `${Math.floor(process.uptime())}s`,
    experiments: ["2.2.1 - Middleware", "2.2.2 - JWT Auth", "2.2.3 - Transactions"],
  });
});

// ── 6. Routes ────────────────────────────────────────────────
app.use("/api/auth",    authRoutes);
app.use("/api/banking", bankingRoutes);

// ── 7. Catch-all 404 ────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── 8. Experiment 2.2.1 — Error logging middleware ──────────
app.use(errorLogger);

// ── 9. Global error handler (must be last) ──────────────────
app.use(errorHandler);

// ── 10. Start server ────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log(`║  Server running on http://localhost:${PORT}    ║`);
  console.log("║  Experiment 2.2.1 → Middleware active        ║");
  console.log("║  Experiment 2.2.2 → JWT Auth active          ║");
  console.log("║  Experiment 2.2.3 → Transactions active      ║");
  console.log("╚══════════════════════════════════════════════╝\n");
});

module.exports = app; // for Vercel serverless
