# Lab Experiments 2.2 — Node.js + Express + MongoDB

> **Experiments 2.2.1 · 2.2.2 · 2.2.3** — Middleware · JWT Auth · ACID Transactions

---

## 📁 Project Structure

```
lab-experiments/
├── src/
│   ├── server.js              # Entry point — wires everything
│   ├── config/
│   │   └── db.js              # MongoDB connection
│   ├── middleware/
│   │   ├── logger.js          # Exp 2.2.1 — Custom logging middleware
│   │   ├── auth.js            # Exp 2.2.1/2.2.2 — JWT auth middleware
│   │   └── errorHandler.js    # Global error handler
│   ├── models/
│   │   ├── User.js            # Exp 2.2.2 — User + bcrypt hashing
│   │   ├── Account.js         # Exp 2.2.3 — Bank account
│   │   └── Transaction.js     # Exp 2.2.3 — Audit log
│   └── routes/
│       ├── auth.js            # Exp 2.2.2 — Register/Login/Refresh/Logout
│       └── banking.js         # Exp 2.2.3 — Deposit/Withdraw/Transfer
├── public/
│   └── index.html             # Built-in API Explorer UI
├── logs/                      # Auto-created at runtime
│   ├── requests.log
│   └── errors.log
├── .env.example
├── .gitignore
├── package.json
└── vercel.json
```

---

## ⚡ Quick Start

### 1. Clone & install

```bash
git clone <your-repo-url>
cd lab-experiments
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your MongoDB URI and secrets
```

### 3. Run (development)

```bash
npm run dev      # uses nodemon — auto-restarts on file change
# OR
npm start        # plain node
```

### 4. Open in browser

```
http://localhost:5000
```

The built-in **API Explorer** lets you test all endpoints with a click.

---

## 🔬 Experiment 2.2.1 — Middleware (Logging / Auth)

**Files:** `src/middleware/logger.js`, `src/middleware/auth.js`

### What it does
- `requestLogger` — intercepts every request, logs method, URL, status, response time, and IP to **console** (coloured) and `logs/requests.log`
- `errorLogger` — catches errors thrown by any route and appends to `logs/errors.log`
- `protect` — JWT verification middleware applied to protected routes
- `restrictTo(...roles)` — role-based access control factory

### Middleware order in `server.js`
```
requestLogger  →  routes  →  errorLogger  →  errorHandler
```

### Test it
```bash
curl http://localhost:5000/api/health
# Watch the coloured log line appear in the terminal
```

---

## 🔐 Experiment 2.2.2 — JWT Authentication

**Files:** `src/routes/auth.js`, `src/models/User.js`

### Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | ❌ | Create account + seed bank account |
| POST | `/api/auth/login` | ❌ | Returns access + refresh tokens |
| GET  | `/api/auth/me` | ✅ | Get logged-in user profile |
| POST | `/api/auth/refresh` | ❌ | Rotate token pair |
| POST | `/api/auth/logout` | ✅ | Invalidate refresh token |

### Security features
- Passwords hashed with **bcrypt** (12 salt rounds)
- **Access token**: 15 min expiry (configurable)
- **Refresh token**: 7 day expiry, stored in DB for rotation/revocation
- Token reuse detection — if a stolen refresh token is used after rotation, it's rejected

### Test with curl
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Arjun","email":"arjun@test.com","password":"secret123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"arjun@test.com","password":"secret123"}'

# Protected route (paste token from login)
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

---

## 💳 Experiment 2.2.3 — Transaction System with ACID Rollback

**Files:** `src/routes/banking.js`, `src/models/Account.js`, `src/models/Transaction.js`

### Endpoints (all require JWT)

| Method | Route | Description |
|--------|-------|-------------|
| GET  | `/api/banking/account` | View balance |
| POST | `/api/banking/deposit` | Add funds |
| POST | `/api/banking/withdraw` | Withdraw (fails + logs if insufficient) |
| POST | `/api/banking/transfer` | Atomic transfer between accounts |
| GET  | `/api/banking/transactions` | Full audit history |

### ACID Properties implemented

| Property | How |
|----------|-----|
| **Atomicity** | `session.startTransaction()` + `commitTransaction()` / `abortTransaction()` |
| **Consistency** | Mongoose validators prevent negative balances |
| **Isolation** | Both accounts locked within the same session |
| **Durability** | MongoDB write concern ensures disk persistence |

### Rollback scenario
```
Transfer ₹500 from Account A (balance: ₹200):
  1. Session starts
  2. Debit check fails: 200 < 500
  3. abortTransaction() called
  4. Zero state changes committed to DB
  5. 400 response returned with clear message
```

---

## 🚀 Deploy to Vercel

### Prerequisites
- Vercel account + CLI (`npm i -g vercel`)
- MongoDB Atlas cluster (free tier works)

### Steps
```bash
# 1. Login
vercel login

# 2. Deploy
vercel

# 3. Set environment variables in Vercel dashboard
#    MONGO_URI = mongodb+srv://...
#    JWT_SECRET = <strong random string>
#    JWT_REFRESH_SECRET = <different strong random string>
```

The `vercel.json` is already configured to route all requests to `src/server.js`.

---

## 📤 Push to GitHub

```bash
git init
git add .
git commit -m "feat: experiments 2.2.1, 2.2.2, 2.2.3 complete"
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

---

## 📖 Viva Q&A

### Experiment 2.2.1
1. **What is middleware?** Functions that execute between the request and response in Express's pipeline. Each middleware receives `(req, res, next)` and must call `next()` to pass control.
2. **How does `next()` work?** It hands off to the next middleware/route in the chain. Calling `next(err)` skips to the error handler.
3. **Why is the error handler last?** Express identifies it by its 4-argument signature `(err, req, res, next)` and only invokes it when `next(err)` is called.
4. **`app.use()` vs `router.use()`?** `app.use()` applies globally; `router.use()` scopes middleware to that router's routes only.

### Experiment 2.2.2
1. **Why hash passwords?** Plain-text storage is a single-breach catastrophe. bcrypt is one-way and slow by design, making brute-force expensive.
2. **JWT expiration significance?** Limits the damage window if a token is stolen — it becomes worthless after expiry.
3. **Refresh tokens?** Allow long-lived sessions without long-lived access tokens. Rotation + revocation gives fine-grained control.
4. **JWT security risks?** `alg: none` attacks, weak secrets, missing expiry, storing in localStorage (XSS risk).

### Experiment 2.2.3
1. **ACID in MongoDB?** Supported in replica sets via multi-document transactions using sessions since MongoDB 4.0.
2. **What is isolation?** Changes inside a session are invisible to other operations until committed.
3. **Why log failed transactions?** For fraud detection, debugging, and regulatory compliance (audit trail).
