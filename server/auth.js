// =========================
// AUTH: registration, login, sessions (HttpOnly cookie), password hashing
// Uses only Node built-ins (crypto.scrypt) - no bcrypt install needed.
// =========================

const crypto = require("crypto");
const express = require("express");
const { db } = require("./db");

const COOKIE = "glowcart_session";
const SESSION_DAYS = 7;
const router = express.Router();

// ---------- password hashing ----------
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function verifyPassword(password, stored) {
    const [saltHex, hashHex] = stored.split(":");
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(expected, actual);
}

// ---------- sessions ----------
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
    res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
        secure: process.env.NODE_ENV === "production",
    });
}

function readCookie(req, name) {
    const header = req.headers.cookie || "";
    for (const part of header.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k === name) return decodeURIComponent(v.join("="));
    }
    return null;
}

// Attaches req.user (or null) on every request.
function loadUser(req, res, next) {
    req.user = null;
    const token = readCookie(req, COOKIE);
    if (token) {
        const row = db
            .prepare(
                `SELECT u.id, u.name, u.email, s.expires_at FROM sessions s
                 JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`
            )
            .get(sha256(token));
        if (row && row.expires_at > Date.now()) {
            req.user = { id: row.id, name: row.name, email: row.email };
        } else if (row) {
            db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
        }
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Please log in to continue." });
    next();
}

// ---------- tiny in-memory rate limit for login/register ----------
const attempts = new Map();
function rateLimit(req, res, next) {
    const key = req.ip;
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
    if (recent.length >= 20) {
        return res.status(429).json({ error: "Too many attempts. Please try again in a few minutes." });
    }
    recent.push(now);
    attempts.set(key, recent);
    next();
}

// ---------- routes ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/register", rateLimit, (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
        return res.status(409).json({ error: "An account with this email already exists." });
    }

    const info = db
        .prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
        .run(name, email, hashPassword(password));
    createSession(res, Number(info.lastInsertRowid));
    res.status(201).json({ user: { id: Number(info.lastInsertRowid), name, email } });
});

router.post("/login", rateLimit, (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Incorrect email or password." });
    }
    createSession(res, user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
});

router.post("/logout", (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    res.clearCookie(COOKIE);
    res.json({ success: true });
});

router.get("/me", (req, res) => {
    res.json({ user: req.user });
});

module.exports = { router, loadUser, requireAuth };
