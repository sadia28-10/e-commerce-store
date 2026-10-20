// =========================
// HOME PAGE: product listing, search/filter/sort, contact form
// =========================

(async function () {
    await initPage();

    const grid = document.getElementById("product-grid");
    const search = document.getElementById("search");
    const category = document.getElementById("category");
    const sort = document.getElementById("sort");
    let shown = [];

    wireAddButtons(grid, () => shown);

    async function loadProducts() {
        const params = new URLSearchParams();
        if (search.value.trim()) params.set("search", search.value.trim());
        if (category.value !== "All") params.set("category", category.value);
        if (sort.value) params.set("sort", sort.value);

        try {
            shown = (await api("/api/products?" + params)).products;
            grid.innerHTML = shown.length
                ? shown.map(productCardHTML).join("")
                : '<p class="loading">No products match your search.</p>';
        } catch (err) {
            grid.innerHTML = `<p class="loading error">${esc(err.message)}</p>`;
        }
    }

    try {
        const { categories } = await api("/api/products/categories");
        category.insertAdjacentHTML("beforeend", categories.map((c) => `<option>${esc(c)}</option>`).join(""));
    } catch {}

    let timer;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(loadProducts, 250); });
    category.addEventListener("change", loadProducts);
    sort.addEventListener("change", loadProducts);
    loadProducts();

    // ---------- CONTACT FORM (saved in the database) ----------
    const contactForm = document.getElementById("contact-form");
    contactForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        try {
            await api("/api/contact", {
                method: "POST",
                body: {
                    name: document.getElementById("name").value,
                    email: document.getElementById("email").value,
                    message: document.getElementById("message").value,
                },
            });
            toast("Thank you! Your message has been sent. 💌");
            contactForm.reset();
        } catch (err) {
            toast(err.message, "error");
        }
    });
})();
