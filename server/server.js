const express = require("express");
const path = require("path");

const { router: authRouter, loadUser } = require("./auth");
const { products, orders, contact } = require("./shop");

const app = express();
const PORT = process.env.PORT || 3000;

// JSON data receive karne ke liye
app.use(express.json({ limit: "100kb" }));

// Every request: figure out who is logged in (req.user)
app.use(loadUser);

// API routes
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "GlowCart Backend is Working!"
    });
});
app.use("/api/auth", authRouter);
app.use("/api/products", products);
app.use("/api/orders", orders);
app.use("/api/contact", contact);

// Unknown /api routes -> JSON 404
app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// Public folder ko website banana
app.use(express.static(path.join(__dirname, "../public")));

// Error handler (bad JSON, unexpected errors)
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`GlowCart running at http://localhost:${PORT}`);
    });
}

module.exports = app;
