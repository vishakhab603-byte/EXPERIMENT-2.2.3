// src/routes/banking.js
// ═══════════════════════════════════════════════════════════
//  Experiment 2.2.3 — Transaction System with ACID Rollback
//  All routes are JWT-protected.
//
//  GET  /api/banking/account          — get own account
//  POST /api/banking/deposit          — deposit funds
//  POST /api/banking/withdraw         — withdraw funds
//  POST /api/banking/transfer         — transfer (atomic)
//  GET  /api/banking/transactions     — transaction history
// ═══════════════════════════════════════════════════════════

const express     = require("express");
const mongoose    = require("mongoose");
const Account     = require("../models/Account");
const Transaction = require("../models/Transaction");
const { protect } = require("../middleware/auth");

const router = express.Router();
router.use(protect); // All banking routes require auth

// ── GET /api/banking/account ────────────────────────────────
router.get("/account", async (req, res, next) => {
  try {
    const account = await Account.findOne({ owner: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, message: "No account found" });
    }
    res.json({ success: true, data: account });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/banking/deposit ───────────────────────────────
router.post("/deposit", async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const account = await Account.findOne({ owner: req.user._id }).session(session);
    if (!account) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const balanceBefore = account.balance;
    account.balance    += Number(amount);
    await account.save({ session });

    const txn = await Transaction.create(
      [{
        toAccount   : account._id,
        amount,
        type        : "deposit",
        status      : "completed",
        description : description || "Deposit",
        balanceBefore: { to: balanceBefore },
        balanceAfter : { to: account.balance },
      }],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `₹${amount} deposited successfully`,
      data   : { transaction: txn[0], newBalance: account.balance },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ── POST /api/banking/withdraw ──────────────────────────────
router.post("/withdraw", async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { amount, description } = req.body;
    if (!amount || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const account = await Account.findOne({ owner: req.user._id }).session(session);
    if (!account) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    // ── ACID check: insufficient funds triggers rollback ────
    if (account.balance < amount) {
      // Log failed attempt before aborting
      await Transaction.create(
        [{
          toAccount   : account._id,
          amount,
          type        : "withdrawal",
          status      : "failed",
          description : "Insufficient funds",
          balanceBefore: { to: account.balance },
          failureReason: "Insufficient funds",
        }],
        { session }
      );
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Balance: ₹${account.balance}`,
      });
    }

    const balanceBefore = account.balance;
    account.balance    -= Number(amount);
    await account.save({ session });

    const txn = await Transaction.create(
      [{
        toAccount   : account._id,
        amount,
        type        : "withdrawal",
        status      : "completed",
        description : description || "Withdrawal",
        balanceBefore: { to: balanceBefore },
        balanceAfter : { to: account.balance },
      }],
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `₹${amount} withdrawn successfully`,
      data   : { transaction: txn[0], newBalance: account.balance },
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ── POST /api/banking/transfer ──────────────────────────────
// Full ACID-compliant transfer: both debit + credit in one session.
// If anything fails, the entire operation is rolled back.
router.post("/transfer", async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { toAccountNumber, amount, description } = req.body;

    if (!toAccountNumber || !amount || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "toAccountNumber and valid amount required" });
    }

    // Lock both accounts within the same session (isolation)
    const fromAccount = await Account.findOne({ owner: req.user._id }).session(session);
    const toAccount   = await Account.findOne({ accountNumber: toAccountNumber }).session(session);

    if (!fromAccount) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Your account not found" });
    }
    if (!toAccount) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: `Account '${toAccountNumber}' not found` });
    }
    if (fromAccount._id.equals(toAccount._id)) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: "Cannot transfer to same account" });
    }
    if (fromAccount.balance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ₹${fromAccount.balance}`,
      });
    }

    // Snapshot balances for audit
    const fromBefore = fromAccount.balance;
    const toBefore   = toAccount.balance;

    // ── Atomic debit + credit ───────────────────────────────
    fromAccount.balance -= Number(amount);
    toAccount.balance   += Number(amount);

    await fromAccount.save({ session });
    await toAccount.save({ session });

    // ── Audit log ───────────────────────────────────────────
    const txn = await Transaction.create(
      [{
        fromAccount : fromAccount._id,
        toAccount   : toAccount._id,
        amount,
        type        : "transfer",
        status      : "completed",
        description : description || `Transfer to ${toAccountNumber}`,
        balanceBefore: { from: fromBefore, to: toBefore },
        balanceAfter : { from: fromAccount.balance, to: toAccount.balance },
      }],
      { session }
    );

    // ── Commit: all-or-nothing ──────────────────────────────
    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `₹${amount} transferred to ${toAccountNumber}`,
      data   : {
        transaction: txn[0],
        yourNewBalance: fromAccount.balance,
      },
    });
  } catch (err) {
    // ── Rollback on ANY error ───────────────────────────────
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
});

// ── GET /api/banking/transactions ───────────────────────────
router.get("/transactions", async (req, res, next) => {
  try {
    const account = await Account.findOne({ owner: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    const txns = await Transaction.find({
      $or: [{ fromAccount: account._id }, { toAccount: account._id }],
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, count: txns.length, data: txns });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
