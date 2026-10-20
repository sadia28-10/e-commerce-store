// =========================
// SHARED HELPERS (loaded on every page)
// navbar + footer, API calls, cart (localStorage), toast messages
// =========================

// ---------- small helpers ----------
const formatPrice = (n) => "Rs. " + Number(n).toLocaleString("en-US");

// Escape text before putting it inside HTML (prevents XSS)
function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function api(url, options = {}) {
    const opts = { credentials: "same-origin", ...options };
    if (opts.body && typeof opts.body !== "string") {
        opts.headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
        opts.body = JSON.stringify(opts.body);
    }
    let res;
    try {
        res = await fetch(url, opts);
    } catch {
        throw new Error("Cannot reach the server. Is it running?");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || "Something went wrong.");
        err.status = res.status;
        throw err;
    }
    return data;
}

// ---------- toast ----------
function toast(message, type = "success") {
    let box = document.getElementById("toast-box");
    if (!box) {
        box = document.createElement("div");
        box.id = "toast-box";
        document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = "toast " + type;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => el.classList.add("hide"), 2600);
    setTimeout(() => el.remove(), 3000);
}

// ---------- cart (stored in the browser; server re-checks everything at checkout) ----------
const Cart = {
    KEY: "glowcart_cart",
    get() {
        try {
            const items = JSON.parse(localStorage.getItem(this.KEY));
            return Array.isArray(items) ? items : [];
        } catch {
            return [];
        }
    },
    save(items) {
        try { localStorage.setItem(this.KEY, JSON.stringify(items)); } catch {}
        this.updateBadge();
    },
    add(productId, quantity = 1) {
        const items = this.get();
        const line = items.find((i) => i.productId === productId);
        if (line) line.quantity = Math.min(20, line.quantity + quantity);
        else items.push({ productId, quantity });
        this.save(items);
    },
    setQuantity(productId, quantity) {
        const items = this.get();
        const line = items.find((i) => i.productId === productId);
        if (line) line.quantity = Math.max(1, Math.min(20, quantity));
        this.save(items);
    },
    remove(productId) {
        this.save(this.get().filter((i) => i.productId !== productId));
    },
    clear() { this.save([]); },
    count() { return this.get().reduce((n, i) => n + i.quantity, 0); },
    updateBadge() {
        const el = document.getElementById("cart-count");
        if (el) el.textContent = this.count();
    },
};

// ---------- logged-in user ----------
let currentUser = null;

async function loadUser() {
    try {
        currentUser = (await api("/api/auth/me")).user;
    } catch {
        currentUser = null;
    }
    return currentUser;
}

async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "index.html";
}

// ---------- navbar + footer ----------
function renderLayout() {
    const userLinks = currentUser
        ? `<a href="orders.html">My Orders</a>
           <span class="nav-user">Hi, ${esc(currentUser.name.split(" ")[0])}</span>
           <a href="#" id="logout-link">Logout</a>`
        : `<a href="login.html">Login</a><a href="register.html">Register</a>`;

    const header = document.getElementById("site-header");
    if (header) {
        header.outerHTML = `
        <nav class="navbar">
            <a class="logo" href="index.html">✨ GlowCart</a>
            <button class="menu-toggle" id="menu-toggle" aria-label="Menu">☰</button>
            <div class="nav-links" id="nav-links">
                <a href="index.html">Home</a>
                <a href="index.html#products">Products</a>
                <a href="index.html#about">About</a>
                <a href="index.html#contact">Contact</a>
                ${userLinks}
            </div>
            <a class="cart-btn" href="cart.html">🛒 Cart (<span id="cart-count">0</span>)</a>
        </nav>`;
    }

    const footer = document.getElementById("site-footer");
    if (footer) {
        footer.outerHTML = `<footer><p>© ${new Date().getFullYear()} GlowCart. Made with 💖 — CodeAlpha Internship Project</p></footer>`;
    }

    const logoutLink = document.getElementById("logout-link");
    if (logoutLink) logoutLink.addEventListener("click", (e) => { e.preventDefault(); logout(); });
    const toggle = document.getElementById("menu-toggle");
    if (toggle) toggle.addEventListener("click", () => document.getElementById("nav-links").classList.toggle("open"));

    Cart.updateBadge();
}

// Every page calls this first. Pass { requireLogin: true } on private pages.
async function initPage({ requireLogin = false } = {}) {
    await loadUser();
    if (requireLogin && !currentUser) {
        window.location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
        return false;
    }
    renderLayout();
    return true;
}

// Reusable product card markup
function productCardHTML(p) {
    const out = p.stock === 0;
    return `
    <div class="product-card">
        <a class="thumb" href="product.html?id=${p.id}">
            <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
            ${out ? '<span class="badge out">Out of stock</span>' : p.stock <= 5 ? '<span class="badge low">Only ' + p.stock + ' left</span>' : ""}
        </a>
        <div class="product-info">
            <span class="category-tag">${esc(p.category)}</span>
            <h3><a href="product.html?id=${p.id}">${esc(p.name)}</a></h3>
            <div class="rating">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))} <small>${p.rating.toFixed(1)}</small></div>
            <p class="price">${formatPrice(p.price)}</p>
            <button data-add="${p.id}" ${out ? "disabled" : ""}>${out ? "Sold Out" : "Add to Cart 🛒"}</button>
        </div>
    </div>`;
}

// One click handler for any "Add to Cart" buttons inside `container`.
// getProducts() returns the products currently shown (used for the toast text).
function wireAddButtons(container, getProducts) {
    container.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-add]");
        if (!btn) return;
        const id = Number(btn.dataset.add);
        const p = getProducts().find((x) => x.id === id);
        Cart.add(id, 1);
        toast((p ? p.name : "Item") + " added to your cart 🛒");
    });
}
