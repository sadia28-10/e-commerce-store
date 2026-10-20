// =========================
// SHOP API: products, orders, contact form
// =========================

const express = require("express");
const { db, transaction } = require("./db");
const { requireAuth } = require("./auth");

const products = express.Router();
const orders = express.Router();
const contact = express.Router();

// ---------- PRODUCTS ----------
// GET /api/products?search=&category=&sort=price-asc|price-desc|rating|name&ids=1,2,3
products.get("/", (req, res) => {
    const where = [];
    const params = [];

    if (req.query.search) {
        where.push("(name LIKE ? OR description LIKE ?)");
        const like = `%${String(req.query.search).trim()}%`;
        params.push(like, like);
    }
    if (req.query.category && req.query.category !== "All") {
        where.push("category = ?");
        params.push(String(req.query.category));
    }
    if (req.query.ids) {
        const ids = String(req.query.ids).split(",").map(Number).filter(Number.isInteger).slice(0, 100);
        if (!ids.length) return res.json({ products: [] });
        where.push(`id IN (${ids.map(() => "?").join(",")})`);
        params.push(...ids);
    }

    const orderBy =
        { "price-asc": "price ASC", "price-desc": "price DESC", rating: "rating DESC", name: "name ASC" }[
            req.query.sort
        ] || "id ASC";

    const sql = `SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${orderBy}`;
    res.json({ products: db.prepare(sql).all(...params) });
});

products.get("/categories", (req, res) => {
    const rows = db.prepare("SELECT DISTINCT category FROM products ORDER BY category").all();
    res.json({ categories: rows.map((r) => r.category) });
});

products.get("/:id", (req, res) => {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(req.params.id));
    if (!product) return res.status(404).json({ error: "Product not found." });
    const related = db
        .prepare("SELECT * FROM products WHERE category != ? AND id != ? ORDER BY rating DESC LIMIT 3")
        .all(product.category, product.id);
    res.json({ product, related });
});

// ---------- ORDERS ----------
function loadOrder(id, userId) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?").get(id, userId);
    if (!order) return null;
    order.items = db
        .prepare(
            `SELECT oi.product_id, oi.name, oi.price, oi.quantity, p.image
             FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
        )
        .all(id);
    return order;
}

// Place an order. Prices and stock are always checked on the server -
// the browser only sends product ids and quantities.
orders.post("/", requireAuth, (req, res) => {
    const { items, shipping = {}, paymentMethod } = req.body || {};

    const clean = (v, max) => String(v || "").trim().slice(0, max);
    const full_name = clean(shipping.fullName, 80);
    const phone = clean(shipping.phone, 20);
    const address = clean(shipping.address, 200);
    const city = clean(shipping.city, 60);

    if (!full_name || !address || !city) return res.status(400).json({ error: "Please fill in all shipping details." });
    if (!/^[+\d][\d\s-]{6,18}$/.test(phone)) return res.status(400).json({ error: "Please enter a valid phone number." });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Your cart is empty." });
    if (items.length > 50) return res.status(400).json({ error: "Too many items in one order." });

    // Merge duplicate product ids and validate quantities
    const wanted = new Map();
    for (const it of items) {
        const id = Number(it.productId);
        const qty = Number(it.quantity);
        if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
            return res.status(400).json({ error: "Invalid item in cart." });
        }
        wanted.set(id, (wanted.get(id) || 0) + qty);
    }

    const payment = paymentMethod === "Cash on Delivery" || !paymentMethod ? "Cash on Delivery" : null;
    if (!payment) return res.status(400).json({ error: "Unsupported payment method." });

    try {
        const orderId = transaction(() => {
            let total = 0;
            const lines = [];
            for (const [id, qty] of wanted) {
                const p = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
                if (!p) throw Object.assign(new Error("A product in your cart no longer exists."), { status: 400 });
                if (p.stock < qty) {
                    throw Object.assign(
                        new Error(p.stock === 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} left in stock.`),
                        { status: 409 }
                    );
                }
                total += p.price * qty;
                lines.push({ p, qty });
            }

            const info = db
                .prepare(
                    `INSERT INTO orders (user_id, total, full_name, phone, address, city, payment_method)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                )
                .run(req.user.id, total, full_name, phone, address, city, payment);
            const oid = Number(info.lastInsertRowid);

            const addItem = db.prepare(
                "INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)"
            );
            const reduce = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?");
            for (const { p, qty } of lines) {
                addItem.run(oid, p.id, p.name, p.price, qty);
                reduce.run(qty, p.id);
            }
            return oid;
        });

        res.status(201).json({ order: loadOrder(orderId, req.user.id) });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        throw err;
    }
});

orders.get("/", requireAuth, (req, res) => {
    const rows = db.prepare("SELECT id FROM orders WHERE user_id = ? ORDER BY id DESC").all(req.user.id);
    res.json({ orders: rows.map((r) => loadOrder(r.id, req.user.id)) });
});

orders.get("/:id", requireAuth, (req, res) => {
    const order = loadOrder(Number(req.params.id), req.user.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    res.json({ order });
});

// Customers can cancel while the order is still Pending; stock goes back.
orders.post("/:id/cancel", requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const order = loadOrder(id, req.user.id);
    if (!order) return res.status(404).json({ error: "Order not found." });
    if (order.status !== "Pending") return res.status(409).json({ error: "Only pending orders can be cancelled." });

    transaction(() => {
        db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(id);
        const restock = db.prepare("UPDATE products SET stock = stock + ? WHERE id = ?");
        order.items.forEach((i) => restock.run(i.quantity, i.product_id));
    });
    res.json({ order: loadOrder(id, req.user.id) });
});

// ---------- CONTACT FORM ----------
contact.post("/", (req, res) => {
    const name = String(req.body.name || "").trim().slice(0, 80);
    const email = String(req.body.email || "").trim().slice(0, 120);
    const message = String(req.body.message || "").trim().slice(0, 2000);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
        return res.status(400).json({ error: "Please fill in your name, a valid email and a message." });
    }
    db.prepare("INSERT INTO messages (name, email, message) VALUES (?, ?, ?)").run(name, email, message);
    res.status(201).json({ success: true });
});

module.exports = { products, orders, contact };
