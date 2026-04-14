// src/middleware/auth.js
// ═══════════════════════════════════════════════════════════
//  Experiment 2.2.1 / 2.2.2 — Authentication Middleware
//  Verifies JWT from Authorization: Bearer <token> header.
// ═══════════════════════════════════════════════════════════

const jwt  = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect — Guards any route that requires a valid JWT.
 * On success, attaches `req.user` for downstream handlers.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorised — no token provided",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message =
        err.name === "TokenExpiredError"
          ? "Token expired — please refresh"
          : "Invalid token";
      return res.status(401).json({ success: false, message });
    }

    // Fetch fresh user from DB (catches deleted/disabled accounts)
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User belonging to this token no longer exists",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * restrictTo — Role-based access control factory.
 * Usage: router.delete("/account", protect, restrictTo("admin"), handler)
 */
const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user.role}' is not permitted to perform this action`,
    });
  }
  next();
};

module.exports = { protect, restrictTo };
