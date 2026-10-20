<div align="center">

# ✨ GlowCart

**A full-stack e-commerce store with product listings, shopping cart, user accounts and order processing.**

*Built as part of the CodeAlpha Internship — "Simple E-commerce Store" task.*

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Security Notes](#security-notes)
- [Customization](#customization)
- [Troubleshooting](#troubleshooting)
- [Future Improvements](#future-improvements)

---

## Overview

GlowCart is a fashion, beauty and accessories store. Visitors can browse and search
products, view details, build a cart and — after creating an account — place orders
and track them. The frontend is plain HTML, CSS and JavaScript (no framework); the
backend is an Express REST API backed by a SQLite database.

The project has **one dependency (Express)**. The database and password hashing use
modules built into Node.js, so setup is a single `npm install`.

## Features

| Area | What you get |
|---|---|
| **Product listings** | Products loaded from the database; live search, category filter and sorting (price, rating, name) |
| **Product details** | Dedicated page with image, description, rating, stock status (in stock / low / sold out), quantity picker and related products |
| **Shopping cart** | Add from listing or details page, change quantity, remove items, clear cart, live item count in the navbar, persists across page reloads |
| **Registration & login** | Account creation with validation, secure login/logout, session kept in an HttpOnly cookie, private pages redirect to login and return you afterwards |
| **Order processing** | Checkout with shipping details, Cash on Delivery, order history, order status, and cancellation of pending orders (stock is restored) |
| **Database** | SQLite storing products, users, sessions, orders, order items and contact messages |
| **Contact form** | Messages submitted from the home page are saved in the database |
| **Responsive design** | Works on desktop, tablet and mobile (collapsible menu, stacked layouts) |

## Tech Stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript (ES2020, `fetch`, `localStorage`)
- **Backend:** Node.js 22.5+ and Express 5
- **Database:** SQLite through Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html)
- **Auth:** `crypto.scrypt` password hashing, random session tokens stored hashed (SHA-256) in the database

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **22.5 or newer** — check with `node -v`

### Installation

```bash
# 1. Go into the server folder
cd server

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open **http://localhost:3000** in your browser.

On first run the app automatically creates the database (`server/data/glowcart.db`)
and fills it with 5 sample products. No manual database setup is needed.

### Try it out

1. Browse the products on the home page and add a few to your cart.
2. Click **Proceed to Checkout** — you'll be asked to register or log in.
3. Fill in the shipping details and place your order (Cash on Delivery).
4. Open **My Orders** to view it, or cancel it while it's still *Pending*.

### Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DB_FILE` | `server/data/glowcart.db` | Path of the SQLite database file |
| `NODE_ENV` | — | Set to `production` to mark the session cookie `Secure` (requires HTTPS) |

Example: `PORT=8080 npm start`

## Project Structure

```
CodeAlpha_EcommerceStore/
├── public/                  # Frontend (served as static files)
│   ├── index.html           # Home: hero, product listing, about, contact
│   ├── product.html         # Product details
│   ├── cart.html            # Shopping cart
│   ├── checkout.html        # Shipping + place order
│   ├── login.html           # Login
│   ├── register.html        # Registration
│   ├── orders.html          # Order history
│   ├── common.js            # Navbar/footer, API helper, cart logic, toasts
│   ├── script.js            # Home page logic (listing, filters, contact form)
│   ├── style.css            # All styles
│   └── images/              # Product and banner images
├── server/                  # Backend
│   ├── server.js            # App setup and route wiring
│   ├── auth.js              # Register, login, logout, sessions
│   ├── shop.js              # Products, orders and contact endpoints
│   ├── db.js                # Schema creation and seed data
│   └── package.json
└── README.md
```

## Database Schema

```
users          id, name, email (unique), password_hash, created_at
sessions       token_hash (PK), user_id → users, expires_at
products       id, name, description, price, category, image, stock, rating
orders         id, user_id → users, total, status, full_name, phone, address,
               city, payment_method, created_at
order_items    id, order_id → orders, product_id → products,
               name, price, quantity            (name/price are saved at purchase time)
messages       id, name, email, message, created_at
```

Prices are stored as whole rupees. Order statuses: `Pending`, `Cancelled`
(`Shipped` and `Delivered` are styled and ready for an admin panel).

## API Reference

All endpoints exchange JSON. Errors return `{ "error": "message" }` with a suitable
HTTP status code.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account and log in. Body: `name`, `email`, `password` (min 6 chars) |
| `POST` | `/api/auth/login` | Log in. Body: `email`, `password` |
| `POST` | `/api/auth/logout` | Log out and clear the session |
| `GET`  | `/api/auth/me` | Current user, or `{ "user": null }` |

### Products

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | List products. Query: `search`, `category`, `sort` (`price-asc`, `price-desc`, `rating`, `name`), `ids` (comma-separated) |
| `GET` | `/api/products/categories` | List of categories |
| `GET` | `/api/products/:id` | One product plus related products |

### Orders *(login required)*

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/orders` | Place an order |
| `GET`  | `/api/orders` | Your orders, newest first |
| `GET`  | `/api/orders/:id` | One of your orders |
| `POST` | `/api/orders/:id/cancel` | Cancel a pending order (restores stock) |

Example request to place an order:

```json
POST /api/orders
{
  "items": [ { "productId": 1, "quantity": 2 }, { "productId": 4, "quantity": 1 } ],
  "shipping": {
    "fullName": "Ali Khan",
    "phone": "03001234567",
    "address": "House 5, Street 2",
    "city": "Karachi"
  },
  "paymentMethod": "Cash on Delivery"
}
```

### Other

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/contact` | Save a contact message. Body: `name`, `email`, `message` |
| `GET`  | `/api/health` | Server health check |

## Security Notes

- **Passwords** are never stored in plain text — they are hashed with scrypt and a unique salt, and compared in constant time.
- **Sessions** use a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie; only a SHA-256 hash of the token is stored in the database. Sessions expire after 7 days.
- **Prices and stock are verified on the server.** The browser only sends product IDs and quantities, so totals cannot be tampered with.
- **Orders are atomic:** stock checks, order creation and stock reduction happen in a single database transaction.
- **SQL injection** is prevented with parameterized queries throughout.
- **XSS** is prevented by escaping all dynamic content before rendering it.
- **Login and registration are rate-limited** per IP address.
- Redirects after login only allow pages inside this site.

> For a real production deployment, also serve the site over HTTPS (and set `NODE_ENV=production`), add CSRF tokens if you ever relax `SameSite`, and integrate a real payment provider.

## Customization

- **Add or edit products:** change `seedProducts` in `server/db.js` and delete the `server/data/` folder to re-seed, or insert rows directly into the `products` table. Put new images in `public/images/`.
- **Change colors:** the brand pink (`#d63384`) is used throughout `public/style.css`.
- **Contact details:** update the email and WhatsApp number in the contact section of `public/index.html`.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'node:sqlite'` | Your Node.js is too old — install version 22.5 or newer |
| `Cannot find module 'express'` | Run `npm install` inside the `server` folder |
| `EADDRINUSE: port 3000 already in use` | Another app is using the port — run with `PORT=3001 npm start` (on Windows PowerShell: `$env:PORT=3001; npm start`) |
| Want a fresh database | Stop the server and delete the `server/data/` folder |
| "Cannot reach the server" in the browser | Make sure `npm start` is running and open the site via `http://localhost:3000`, not by double-clicking the HTML files |




