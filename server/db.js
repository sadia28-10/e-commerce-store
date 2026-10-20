// =========================
// DATABASE (SQLite via Node's built-in node:sqlite - no extra install needed)
// Requires Node.js 22.5 or newer.
// =========================

const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_FILE || path.join(DATA_DIR, "glowcart.db"));

db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT    PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT    NOT NULL,
        price       INTEGER NOT NULL CHECK (price >= 0),   -- whole rupees
        category    TEXT    NOT NULL,
        image       TEXT    NOT NULL,
        stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        rating      REAL    NOT NULL DEFAULT 4.5
    );

    CREATE TABLE IF NOT EXISTS orders (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        INTEGER NOT NULL REFERENCES users(id),
        total          INTEGER NOT NULL,
        status         TEXT    NOT NULL DEFAULT 'Pending',
        full_name      TEXT    NOT NULL,
        phone          TEXT    NOT NULL,
        address        TEXT    NOT NULL,
        city           TEXT    NOT NULL,
        payment_method TEXT    NOT NULL DEFAULT 'Cash on Delivery',
        created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id),
        name       TEXT    NOT NULL,   -- snapshot at purchase time
        price      INTEGER NOT NULL,   -- snapshot at purchase time
        quantity   INTEGER NOT NULL CHECK (quantity > 0)
    );

    CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`);

// Run `fn` inside a transaction; rolls back if it throws.
function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
        const result = fn();
        db.exec("COMMIT");
        return result;
    } catch (err) {
        db.exec("ROLLBACK");
        throw err;
    }
}

// ---------- Seed products (only when the table is empty) ----------
const seedProducts = [
    ["Elegant Dress", "A flowing evening dress cut from soft, breathable fabric. Flattering silhouette, hidden zip and a comfortable lining - perfect for weddings, dinners and festive occasions.", 4999, "Fashion", "images/dress.jpg", 15, 4.8],
    ["Luxury Handbag", "A structured handbag with a roomy interior, inner zip pocket and a detachable shoulder strap. Finished with gold-tone hardware that goes with everything.", 3499, "Bags", "images/bag.jpg", 20, 4.6],
    ["Fashion Shoes", "Lightweight, cushioned everyday shoes with a flexible sole and breathable upper. Stylish enough for the office, comfortable enough for a full day out.", 5499, "Footwear", "images/shoes.jpg", 25, 4.7],
    ["Elegant Watch", "A minimalist analog watch with a stainless-steel case, scratch-resistant glass and a soft strap. Water resistant for daily wear and reliable quartz movement.", 6999, "Accessories", "images/watch.jpg", 12, 4.9],
    ["Luxury Perfume", "A long-lasting eau de parfum with warm floral top notes and a soft musky base. 100 ml bottle in a gift-ready box.", 4299, "Beauty", "images/perfume.jpg", 30, 4.5],
];

if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
    const insert = db.prepare(
        "INSERT INTO products (name, description, price, category, image, stock, rating) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    transaction(() => seedProducts.forEach((p) => insert.run(...p)));
    console.log(`Seeded ${seedProducts.length} products.`);
}

module.exports = { db, transaction };
