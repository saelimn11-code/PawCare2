const state = {
    allFoods: [],
    filteredFoods: [],
    visibleFoods: [],
    page: 1,
    pageSize: 60,
    visibleCount: 60,
    totalPages: 1,
    hasMore: false,
    lastMs: 0,
    searchKeyword: "",
    selectedBrand: "all",
    selectedCategory: "all",
    selectedFilter: "all",
    sortMetric: "sugar",
    loading: false
};

function getSortMetric() {
    const select = document.getElementById("algo");
    const value = (select && select.value) || state.sortMetric || "sugar";
    return ["sugar", "protein", "fat"].includes(value) ? value : "sugar";
}

function sortFilteredFoods(items) {
    const cloned = [...items];
    const sorted = cloned.sort((a, b) => {
        const left = a || {};
        const right = b || {};

        if (state.selectedFilter === "low-sugar") {
            return Number(left.sugar || 0) - Number(right.sugar || 0);
        }

        if (state.selectedFilter === "high-protein") {
            return Number(right.protein || 0) - Number(left.protein || 0);
        }

        if (state.selectedFilter === "low-fat") {
            return Number(left.fat || 0) - Number(right.fat || 0);
        }

        const metric = getSortMetric();
        if (metric === "protein") {
            return Number(right.protein || 0) - Number(left.protein || 0);
        }

        if (metric === "fat") {
            return Number(left.fat || 0) - Number(right.fat || 0);
        }

        return Number(left.sugar || 0) - Number(right.sugar || 0);
    });

    return sorted;
}

const FOOD_CATEGORY_MAP = {
    chips: "chips",
    milk: "milk",
    bread: "bread",
    juice: "juice",
    rice: "rice"
};

const EDITED_PRODUCTS_KEY = "foodcheck-edited-products-v1";
const EDITED_PRODUCTS_BACKUP_KEY = "foodcheck-edited-products-v1-backup";
const LEGACY_EDITED_PRODUCT_KEYS = [
    "foodcheck-edited-products",
    "foodcheck-edited-products-v1",
    "foodcheck-edited-products-v2",
    "foodcheck-edited-products-backup"
];

function readStorageJson(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
        return {};
    }
}

function getEditedProductMap() {
    const merged = {};
    const keys = [...new Set([...LEGACY_EDITED_PRODUCT_KEYS, EDITED_PRODUCTS_KEY, EDITED_PRODUCTS_BACKUP_KEY])];

    keys.forEach((key) => {
        const parsed = readStorageJson(key);
        if (parsed && typeof parsed === "object") {
            Object.assign(merged, parsed);
        }
    });

    return merged;
}

async function saveEditedProductMap(map) {
    const normalized = map && typeof map === "object" ? map : {};
    const payload = JSON.stringify(normalized);

    try {
        localStorage.setItem(EDITED_PRODUCTS_KEY, payload);
        localStorage.setItem(EDITED_PRODUCTS_BACKUP_KEY, payload);
        localStorage.setItem("foodcheck-edited-products", payload);
        localStorage.setItem("foodcheck-edited-products-v2", payload);

        await fetch("/api/edited-products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            cache: "no-store"
        });
    } catch (error) {
        // Ignore storage failures to keep the UI usable.
    }
}

async function hydrateEditedProductsMap() {
    try {
        const response = await fetch("/api/edited-products", { cache: "no-store" });
        if (!response.ok) return;

        const result = await response.json();
        const serverMap = result && result.data && typeof result.data === "object" ? result.data : {};
        const merged = { ...serverMap, ...getEditedProductMap() };

        if (Object.keys(merged).length) {
            await saveEditedProductMap(merged);
        }

        return merged;
    } catch (error) {
        return getEditedProductMap();
    }
}

async function restoreCustomImageMetadata() {
    try {
        const response = await fetch("/images/products/custom-images.json", { cache: "no-store" });
        if (!response.ok) return;

        const fileMap = await response.json();
        if (!fileMap || typeof fileMap !== "object") return;

        const merged = getEditedProductMap();
        Object.entries(fileMap).forEach(([barcode, imagePath]) => {
            if (!barcode || !imagePath) return;
            const existing = merged[barcode] || {};
            merged[barcode] = {
                ...existing,
                id: existing.id || barcode,
                barcode,
                image: imagePath,
                apiImage: existing.apiImage || imagePath,
                customImage: imagePath,
                category: existing.category || inferFoodCategory(existing)
            };

            const altKey = Object.keys(merged).find((key) => String(merged[key]?.barcode || "") === String(barcode));
            if (!altKey && existing.id) {
                merged[existing.id] = merged[barcode];
            }
        });

        saveEditedProductMap(merged);
    } catch (error) {
        // Ignore metadata restore failures; app still keeps localStorage data.
    }
}

function getFoodKey(food) {
    if (!food) return "";
    const stableKey = food.id || food.barcode || food.code || `${food.brand || "brand"}-${food.name || "product"}`;
    return String(stableKey);
}

function getFoodKeys(food) {
    const keys = new Set();
    if (!food) return [];

    const candidates = [food.id, food.barcode, food.code, `${food.brand || "brand"}-${food.name || "product"}`];
    candidates.filter(Boolean).forEach((candidate) => keys.add(String(candidate)));
    return [...keys];
}

function getStoredOverride(food) {
    if (!food) return null;

    const map = getEditedProductMap();
    for (const key of getFoodKeys(food)) {
        const override = map[key];
        if (override && typeof override === "object") {
            return override;
        }
    }

    return null;
}

function applyEditedFoodOverrides(food) {
    if (!food) return food;

    const override = getStoredOverride(food);
    if (!override || typeof override !== "object") {
        return food;
    }

    const merged = {
        ...food,
        ...override,
        id: food.id || override.id || getFoodKey(food),
        barcode: food.barcode || override.barcode || getFoodKey(food),
        image: override.image || food.image || "",
        apiImage: override.apiImage || food.apiImage || food.image || "",
        customImage: override.customImage || food.customImage || "",
        category: override.category || food.category || inferFoodCategory({ ...food, ...override })
    };

    return merged;
}

function inferFoodCategory(food) {
    const values = [food?.name || "", food?.brand || "", food?.flavor || "", food?.ingredients || ""]
        .join(" ")
        .toLowerCase();

    if (/(ชิพ|chips|cracker|cookie|snack|potato)/.test(values)) return "chips";
    if (/(นม|milk|yogurt|lactose|dairy|cream)/.test(values)) return "milk";
    if (/(ขนมปัง|bread|toast|bun|cake|wafer)/.test(values)) return "bread";
    if (/(น้ำผลไม้|juice|tea|coffee|soft drink|drink)/.test(values)) return "juice";
    if (/(ข้าว|rice|cereal|grain|oat|wheat)/.test(values)) return "rice";

    return "all";
}

async function loadDashboard() {
    state.page = 1;
    state.visibleCount = 60;
    state.pageSize = 60;
    state.allFoods = [];
    state.loading = true;
    await fetchNextPage();
    state.loading = false;
}

async function fetchNextPage() {
    const algo = getSortMetric();
    state.sortMetric = algo;
    const requestLimit = Math.max(state.pageSize, 60);

    try {
        const response = await fetch(`/foods?sort=${algo}&page=${state.page}&limit=${requestLimit}`);

        if (!response.ok) {
            throw new Error("ไม่สามารถโหลดข้อมูลอาหารได้");
        }

        const result = await response.json();
        const incoming = Array.isArray(result.data) ? result.data : [];

        if (state.page === 1) {
            state.allFoods = [];
        }

        state.allFoods.push(...incoming);
        state.allFoods = state.allFoods.map((food) => applyEditedFoodOverrides({
            ...food,
            category: food.category || inferFoodCategory(food)
        }));
        state.pageSize = Math.max(state.pageSize, requestLimit);
        state.lastMs = Number(result.ms || 0);
        state.totalPages = Number(result.totalPages || 1);
        state.hasMore = Boolean(result.hasMore);
        renderBrandFilter();
        applyFilterAndRender();
        showError("");
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    const errorBox = document.getElementById("error");
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.style.display = message ? "block" : "none";
}

function formatNumber(value, fallback = "-") {
    if (value === undefined || value === null || value === "" || Number.isNaN(Number(value))) {
        return fallback;
    }
    return Number(value).toFixed(0);
}

function displayValue(value, fallback = "-") {
    if (value === undefined || value === null || value === "" || String(value).trim() === "") {
        return fallback;
    }
    return value;
}

function clampText(value, maxLength) {
    const text = String(value || "Food");
    return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

function buildProductImage(brand, label, accent, energy, sugar, fat) {
    const safeBrand = clampText(brand || "Brand", 18);
    const safeLabel = clampText(label || "Product", 20);
    const safeEnergy = Number(energy || 0).toFixed(0);
    const safeSugar = Number(sugar || 0).toFixed(0);
    const safeFat = Number(fat || 0).toFixed(0);

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220">
            <rect width="320" height="220" rx="28" fill="#ffffff"/>
            <rect x="52" y="26" width="216" height="168" rx="20" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
            <rect x="52" y="26" width="216" height="28" rx="20" fill="${accent}"/>
            <rect x="74" y="84" width="172" height="68" rx="14" fill="#ffffff" stroke="#edf2f7" stroke-width="1.5"/>
            <text x="160" y="50" text-anchor="middle" font-size="15" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${safeBrand}</text>
            <text x="160" y="117" text-anchor="middle" font-size="23" font-family="Arial, sans-serif" font-weight="800" fill="#0f172a">${safeLabel}</text>
            <text x="160" y="138" text-anchor="middle" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="#475569">Nutrition info</text>
            <rect x="82" y="152" width="46" height="18" rx="9" fill="#ecfdf5"/>
            <rect x="136" y="152" width="46" height="18" rx="9" fill="#fff7ed"/>
            <rect x="190" y="152" width="46" height="18" rx="9" fill="#fef2f2"/>
            <text x="105" y="165" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#047857">${safeEnergy}</text>
            <text x="159" y="165" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#b45309">${safeSugar}g</text>
            <text x="213" y="165" text-anchor="middle" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="#b91c1c">${safeFat}g</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function resolveProductImage(food) {
    const customImage = typeof food?.customImage === "string" && food.customImage.trim() ? food.customImage : "";
    if (customImage) {
        return customImage;
    }

    const directImage = typeof food?.image === "string" && food.image.trim() ? food.image : "";
    if (directImage) {
        return directImage;
    }

    const apiImage = typeof food?.apiImage === "string" && food.apiImage.trim() ? food.apiImage : "";
    if (apiImage) {
        return apiImage;
    }

    const brand = food?.brand || "Brand";
    const name = food?.name || "Product";
    const accent = food?.category === "chips" ? "#f59e0b" : food?.category === "milk" ? "#3bb273" : food?.category === "bread" ? "#fbbf24" : food?.category === "juice" ? "#22c55e" : "#38bdf8";

    return buildProductImage(brand, name, accent, food?.energy || 0, food?.sugar || 0, food?.fat || 0);
}

function renderBrandFilter() {
    const select = document.getElementById("brandFilter");
    if (!select) return;

    const currentValue = select.value || state.selectedBrand || "all";
    const brands = [...new Set(state.allFoods.map(food => food.brand).filter(Boolean))].sort();

    select.innerHTML = '<option value="all">ทุกแบรนด์</option>' + brands.map(brand => `<option value="${brand}">${brand}</option>`).join("");
    select.value = brands.includes(currentValue) ? currentValue : "all";
}

function updateCategoryCounts() {
    const buttons = document.querySelectorAll(".quick-search button");
    const categoryCounts = {
        all: state.allFoods.length,
        chips: state.allFoods.filter((food) => (food.category || inferFoodCategory(food)) === "chips").length,
        milk: state.allFoods.filter((food) => (food.category || inferFoodCategory(food)) === "milk").length,
        bread: state.allFoods.filter((food) => (food.category || inferFoodCategory(food)) === "bread").length,
        juice: state.allFoods.filter((food) => (food.category || inferFoodCategory(food)) === "juice").length,
        rice: state.allFoods.filter((food) => (food.category || inferFoodCategory(food)) === "rice").length
    };

    buttons.forEach((button) => {
        const category = button.dataset.category || "all";
        const label = button.dataset.label || button.textContent.trim().replace(/\s+\d+$/, "");
        const total = categoryCounts[category] ?? 0;
        button.innerHTML = `${label} <span class="quick-count">${total}</span>`;
        button.classList.toggle("active", state.selectedCategory === category || (category === "all" && state.selectedCategory === "all"));
    });
}

function getFilteredFoods() {
    const keyword = (state.searchKeyword || "").trim().toLowerCase();
    const brand = state.selectedBrand || "all";
    const category = state.selectedCategory || "all";

    return state.allFoods
        .map((food) => applyEditedFoodOverrides(food))
        .filter(food => {
            const brandText = String(food.brand || "");
            const nameText = String(food.name || "");
            const flavorText = String(food.flavor || "");
            const foodCategory = food.category || inferFoodCategory(food);
            const brandMatch = brand === "all" || brandText.toLowerCase() === brand.toLowerCase();
            const categoryMatch = category === "all" || foodCategory === category;
            const keywordMatch = !keyword || [nameText, brandText, flavorText].some(value => value.toLowerCase().includes(keyword));
            return brandMatch && categoryMatch && keywordMatch;
        });
}

function applyFilterAndRender() {
    let filtered = sortFilteredFoods(getFilteredFoods());

    if (!filtered.length && state.selectedCategory !== "all") {
        state.selectedCategory = "all";
        filtered = sortFilteredFoods(getFilteredFoods());
    }

    state.filteredFoods = filtered;
    const visible = filtered.slice(0, state.visibleCount);
    state.visibleFoods = visible;
    renderFoods({ data: visible, count: filtered.length, ms: state.lastMs });
    updateCategoryCounts();
    renderComparePanel();

    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) {
        const canLoadMore = state.hasMore || visible.length < filtered.length;
        loadMoreBtn.disabled = !canLoadMore;
        loadMoreBtn.textContent = !canLoadMore ? "แสดงทั้งหมดแล้ว" : "โหลดเพิ่ม";
    }
}

function showCompareToast(food, actionText) {
    const toast = document.getElementById("compareToast");
    if (!toast) return;

    const count = (window.compareItems || []).length;
    toast.innerHTML = `
        <strong>${actionText}</strong>
        <span>${food?.name || "สินค้า"} · ${count} รายการ</span>
    `;
    toast.classList.add("show");

    clearTimeout(showCompareToast.timer);
    showCompareToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 1500);
}

function removeCompareItem(index) {
    const compare = Array.isArray(window.compareItems) ? window.compareItems : [];
    if (index < 0 || index >= compare.length) return;

    const [removedItem] = compare.splice(index, 1);
    if (removedItem) {
        showCompareToast(removedItem, "ลบออกจากรายการเปรียบเทียบแล้ว");
    }

    window.compareItems = compare;
    renderComparePanel();
    updateCompareButtonStates();
}

function toggleCompare(index) {
    const food = (state.visibleFoods || [])[index] || (window.foodData || [])[index];
    if (!food) return;

    const compare = Array.isArray(window.compareItems) ? window.compareItems : [];
    const identifier = food.barcode || food.id || food.name || `${food.brand || "brand"}-${food.flavor || "flavor"}`;
    const existingIndex = compare.findIndex(item => {
        const candidateId = item?.barcode || item?.id || item?.name || `${item?.brand || "brand"}-${item?.flavor || "flavor"}`;
        return candidateId === identifier;
    });

    if (existingIndex >= 0) {
        compare.splice(existingIndex, 1);
        showCompareToast(food, "ลบออกจากรายการเปรียบเทียบแล้ว");
    } else {
        compare.push(food);
        showCompareToast(food, "เพิ่มเข้ารายการเปรียบเทียบแล้ว");
    }

    window.compareItems = compare;
    renderComparePanel();
    updateCompareButtonStates();
}

function updateCompareButtonStates() {
    const selected = Array.isArray(window.compareItems) ? window.compareItems : [];
    const selectedIds = new Set(selected.map(item => item?.barcode || item?.id || item?.name || `${item?.brand || "brand"}-${item?.flavor || "flavor"}`));

    document.querySelectorAll(".detail-link").forEach((button) => {
        const index = Number(button.dataset.index || -1);
        const food = (state.visibleFoods || [])[index] || (window.foodData || [])[index];
        const key = food?.barcode || food?.id || food?.name || `${food?.brand || "brand"}-${food?.flavor || "flavor"}`;
        const active = selectedIds.has(key);
        button.classList.toggle("active", active);
        button.textContent = active ? "เลือกแล้ว" : "เปรียบเทียบ";
        button.setAttribute("aria-pressed", String(active));
    });
}

function getBetterValueCell(value, isBest) {
    if (!isBest) {
        return `<span>${formatNumber(value)}</span>`;
    }

    return `
        <span class="compare-better">
            <span>${formatNumber(value)}</span>
            <span class="compare-check">✓</span>
        </span>
    `;
}

function renderCompareModal(items) {
    const modalGrid = document.getElementById("compareModalGrid");
    const modalHead = document.getElementById("compareModalHead");
    const modalBody = document.getElementById("compareModalBody");

    if (!modalGrid || !modalHead || !modalBody) return;

    if (!items.length) {
        modalGrid.innerHTML = '<div class="compare-empty">ยังไม่มีสินค้าในรายการเปรียบเทียบ</div>';
        modalHead.innerHTML = '<tr><th class="label">รายการ</th><th>-</th><th>-</th></tr>';
        modalBody.innerHTML = `
            <tr><td class="label">พลังงาน</td><td>0</td><td>0</td></tr>
            <tr><td class="label">น้ำตาล</td><td>0</td><td>0</td></tr>
            <tr><td class="label">ไขมัน</td><td>0</td><td>0</td></tr>
            <tr><td class="label">โปรตีน</td><td>0</td><td>0</td></tr>
        `;
        return;
    }

    modalGrid.innerHTML = items.map((item, idx) => {
        const productImage = resolveProductImage(item);
        const fallbackImage = buildProductImage(item.brand || "Brand", item.name || "Product", item.category === "chips" ? "#f59e0b" : item.category === "milk" ? "#3bb273" : item.category === "bread" ? "#fbbf24" : item.category === "juice" ? "#22c55e" : "#38bdf8", item.energy || 0, item.sugar || 0, item.fat || 0);

        return `
            <div class="compare-modal-item">
                <div class="compare-modal-item-main">
                    <img src="${productImage}" alt="${item.name || "สินค้า"}" onerror="this.onerror=null;this.src='${fallbackImage}';" />
                    <div class="compare-modal-name">
                        <strong>${item.name || "สินค้า"}</strong>
                        <small>${item.brand || "แบรนด์"}</small>
                    </div>
                </div>
                <button class="compare-card-remove" type="button" onclick="removeCompareItem(${idx}); closeCompareModal();">×</button>
            </div>
        `;
    }).join("");

    const rows = [
        ["พลังงาน", "energy"],
        ["น้ำตาล", "sugar"],
        ["ไขมัน", "fat"],
        ["โปรตีน", "protein"]
    ];

    const columnHeaders = items.map(item => `<th>${(item.name || "สินค้า").slice(0, 12)}</th>`).join("");
    modalHead.innerHTML = `<tr><th class="label">รายการ</th>${columnHeaders}</tr>`;
    modalBody.innerHTML = rows.map(([label, key]) => {
        const values = items.map(item => Number(item?.[key] || 0));
        const bestValue = (key === "sugar" || key === "fat" || key === "protein") ? Math.min(...values) : null;

        return `
            <tr>
                <td class="label">${label}</td>
                ${items.map((item) => {
                    const value = Number(item?.[key] || 0);
                    const isBest = bestValue !== null && value === bestValue && (key === "sugar" || key === "fat" || key === "protein");
                    return `<td>${getBetterValueCell(value, isBest)}</td>`;
                }).join("")}
            </tr>
        `;
    }).join("");
}

function renderCombineSummary(items) {
    const holder = document.getElementById("combineCompareSummary");
    if (!holder) return;

    if (!items.length) {
        holder.innerHTML = '<div class="compare-empty">ยังไม่มีสินค้าที่เลือกไว้</div>';
        return;
    }

    const fieldNames = {
        energy: "พลังงาน",
        sugar: "น้ำตาล",
        fat: "ไขมัน",
        protein: "โปรตีน"
    };

    const averages = {};
    ["energy", "sugar", "fat", "protein"].forEach((key) => {
        const total = items.reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
        averages[key] = items.length ? total / items.length : 0;
    });

    holder.innerHTML = `
        <div class="compare-summary-header">
            <strong>${items.length} รายการที่เลือก</strong>
        </div>
        <div class="compare-summary-grid">
            ${items.map((item) => `
                <div class="compare-summary-item">
                    <div class="compare-summary-name">${item.name || "สินค้า"}</div>
                    <div class="compare-summary-meta">${item.brand || "แบรนด์"}</div>
                    <div class="compare-summary-values">
                        ${Object.entries(fieldNames).map(([key, label]) => `
                            <span>${label}: ${formatNumber(item?.[key])}</span>
                        `).join("")}
                    </div>
                </div>
            `).join("")}
        </div>
        <div class="compare-summary-avg">
            <h4>ค่าเฉลี่ยรวม</h4>
            <div class="compare-summary-values">
                ${Object.entries(fieldNames).map(([key, label]) => `
                    <span>${label}: ${formatNumber(averages[key], "0")}</span>
                `).join("")}
            </div>
        </div>
    `;
}

function openCombineCompareModal() {
    const items = Array.isArray(window.compareItems) ? window.compareItems : [];
    const modal = document.getElementById("combineCompareModal");
    if (!modal) return;

    renderCombineSummary(items);
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeCombineCompareModal(event) {
    const modal = document.getElementById("combineCompareModal");
    if (!modal) return;

    if (event && event.target !== modal && !event.target.closest(".compare-modal-content")) {
        return;
    }

    modal.classList.remove("show");
    if (!document.querySelector(".modal.show") && !document.querySelector(".compare-modal.show")) {
        document.body.style.overflow = "";
    }
}

function renderComparePanel() {
    const compareList = document.getElementById("compareList");
    const compareCount = document.getElementById("compareCount");
    const headerCompareCount = document.getElementById("headerCompareCount");
    const tableBody = document.getElementById("compareTableBody");
    const tableHead = document.querySelector(".compare-table thead");
    const items = Array.isArray(window.compareItems) ? window.compareItems : [];

    if (!compareList || !tableBody || !compareCount) return;

    compareCount.textContent = String(items.length);
    if (headerCompareCount) {
        headerCompareCount.textContent = String(items.length);
    }

    renderCompareModal(items);

    if (!items.length) {
        compareList.innerHTML = `
            <div class="compare-add" onclick="document.getElementById('searchInput').focus();">
                <span>＋</span>
                <span>เลือกสินค้าเพิ่ม</span>
            </div>
        `;

        if (tableHead) {
            tableHead.innerHTML = `
                <tr>
                    <th class="label">รายการ</th>
                    <th>-</th>
                    <th>-</th>
                </tr>
            `;
        }

        tableBody.innerHTML = `
            <tr><td class="label">พลังงาน</td><td>0</td><td>0</td></tr>
            <tr><td class="label">น้ำตาล</td><td>0</td><td>0</td></tr>
            <tr><td class="label">ไขมัน</td><td>0</td><td>0</td></tr>
            <tr><td class="label">โปรตีน</td><td>0</td><td>0</td></tr>
        `;
        return;
    }

    compareList.innerHTML = items.map((item, idx) => {
        const productImage = resolveProductImage(item);
        const fallbackImage = buildProductImage(item.brand || "Brand", item.name || "Product", item.category === "chips" ? "#f59e0b" : item.category === "milk" ? "#3bb273" : item.category === "bread" ? "#fbbf24" : item.category === "juice" ? "#22c55e" : "#38bdf8", item.energy || 0, item.sugar || 0, item.fat || 0);

        return `
            <div class="compare-item">
                <div class="compare-item-main">
                    <div class="compare-thumb">
                        <img src="${productImage}" alt="${item.name || "สินค้า"}" onerror="this.onerror=null;this.src='${fallbackImage}';" />
                    </div>
                    <div class="compare-name">
                        <strong>${item.name || "สินค้า"}</strong>
                        <small>${item.brand || "แบรนด์"}</small>
                    </div>
                </div>
                <button class="remove-btn" type="button" onclick="removeCompareItem(${idx});">×</button>
            </div>
        `;
    }).join("");

    const rows = [
        ["พลังงาน", "energy"],
        ["น้ำตาล", "sugar"],
        ["ไขมัน", "fat"],
        ["โปรตีน", "protein"]
    ];

    const columnHeaders = items.map(item => `<th>${(item.name || "สินค้า").slice(0, 12)}</th>`).join("");
    const tableHeadMarkup = `<tr><th class="label">รายการ</th>${columnHeaders}</tr>`;

    tableBody.innerHTML = rows.map(([label, key]) => {
        const values = items.map(item => Number(item?.[key] || 0));
        const bestValue = (key === "sugar" || key === "fat" || key === "protein") ? Math.min(...values) : null;

        return `
            <tr>
                <td class="label">${label}</td>
                ${items.map((item) => {
                    const value = Number(item?.[key] || 0);
                    const isBest = bestValue !== null && value === bestValue && (key === "sugar" || key === "fat" || key === "protein");
                    return `<td>${getBetterValueCell(value, isBest)}</td>`;
                }).join("")}
            </tr>
        `;
    }).join("");

    if (tableHead) {
        tableHead.innerHTML = tableHeadMarkup;
    }
}

function renderFoods(result) {
    const foodBox = document.getElementById("foods");
    const meta = document.querySelector(".sort-meta");
    const items = Array.isArray(result.data) ? result.data : [];
    const total = Number(result.count || items.length || 0);

    if (meta) {
        meta.textContent = `• ${total} รายการ • ${result.ms || state.lastMs || 0} ms`;
    }

    if (!items.length) {
        foodBox.innerHTML = '<div class="product-card" style="grid-column: 1 / -1; text-align: center; padding: 30px 12px; color: #40625a;">ไม่พบสินค้าที่ตรงกับเงื่อนไข</div>';
        window.foodData = [];
        return;
    }

    const mergedItems = items.map((food) => applyEditedFoodOverrides(food));

    foodBox.innerHTML = mergedItems.map((food, index) => {
        const image = resolveProductImage(food);
        const fallbackImage = buildProductImage(food.brand || "Brand", food.name || "Product", food.category === "chips" ? "#f59e0b" : food.category === "milk" ? "#3bb273" : food.category === "bread" ? "#fbbf24" : food.category === "juice" ? "#22c55e" : "#38bdf8", food.energy || 0, food.sugar || 0, food.fat || 0);
        const brand = displayValue(food.brand, "-");
        const name = displayValue(food.name, "-");
        const flavor = displayValue(food.flavor, "-");
        const energy = formatNumber(food.energy);
        const sugar = formatNumber(food.sugar);
        const fat = formatNumber(food.fat);

        return `
            <article class="product-card" onclick="openProductModal(${index})" tabindex="0" aria-label="${String(name)}">
                <div class="thumb" style="background: linear-gradient(135deg, rgba(145, 195, 126, 0.38), rgba(248, 196, 129, 0.32));">
                    <img src="${image}" alt="${String(name)}" onerror="this.onerror=null;this.src='${fallbackImage}';" />
                </div>

                <div class="card-head">
                    <span class="fav">♥</span>
                </div>

                <div class="card-body">
                    <h3>${String(name)}</h3>
                    <div class="card-brand">แบรนด์: ${String(brand)}</div>
                    <div class="card-brand">รสชาติ/สูตร: ${String(flavor)}</div>
                    <div class="card-brand">Barcode: ${displayValue(food.barcode, "-")}</div>
                    <div class="card-brand">Nutri-Score: ${displayValue(food.nutriScore, "-")}</div>
                </div>

                <div class="card-stats">
                    <div class="stat-pill"><span class="dot"></span>${energy} kcal</div>
                    <div class="stat-pill"><span class="dot"></span>${sugar} g</div>
                    <div class="stat-pill"><span class="dot"></span>${fat} g</div>
                </div>

                <button class="detail-link" type="button" data-index="${index}" onclick="event.stopPropagation(); toggleCompare(${index});">เปรียบเทียบ</button>
            </article>
        `;
    }).join("");

    window.foodData = mergedItems;
    updateCompareButtonStates();
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    if (loadMoreBtn) {
        loadMoreBtn.disabled = items.length >= total;
        loadMoreBtn.textContent = items.length >= total ? "แสดงทั้งหมดแล้ว" : "โหลดเพิ่ม";
    }
}

function updateCustomImageControls(food) {
    const resetBtn = document.getElementById("resetCustomImageBtn");
    const saveBtn = document.getElementById("saveCustomImageBtn");
    const previewWrap = document.getElementById("customImagePreviewWrap");
    const preview = document.getElementById("customImagePreview");

    if (resetBtn) {
        const hasCustom = Boolean(food && food.customImage && String(food.customImage).trim());
        resetBtn.disabled = !hasCustom;
    }

    if (preview && previewWrap) {
        previewWrap.classList.add("hidden");
        preview.src = "";
    }

    if (saveBtn) {
        saveBtn.disabled = true;
    }
}

async function saveCustomImage() {
    const fileInput = document.getElementById("customImageInput");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const food = window.activeModalFood;

    if (!food || !file) {
        showError("กรุณาเลือกไฟล์รูปภาพก่อนบันทึก");
        return;
    }

    try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`/api/products/${encodeURIComponent(food.barcode || food.id)}/image`, {
            method: "POST",
            body: formData
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result?.error || "ไม่สามารถบันทึกรูปภาพได้");
        }

        food.customImage = result.imageUrl;
        food.image = result.imageUrl;
        food.apiImage = food.apiImage || food.image;

        const preview = document.getElementById("customImagePreview");
        const previewWrap = document.getElementById("customImagePreviewWrap");
        if (preview && previewWrap) {
            preview.src = result.imageUrl;
            previewWrap.classList.remove("hidden");
        }

        const modalImage = document.getElementById("modalImage");
        if (modalImage) {
            modalImage.src = result.imageUrl;
        }

        if (fileInput) {
            fileInput.value = "";
        }

        const saveBtn = document.getElementById("saveCustomImageBtn");
        if (saveBtn) {
            saveBtn.disabled = true;
        }

        persistEditedProduct(food);
        state.allFoods = state.allFoods.map((item) => applyEditedFoodOverrides(item));
        renderFoods({ data: state.visibleFoods, count: state.filteredFoods.length, ms: state.lastMs });
        showError("");
    } catch (error) {
        showError(error.message || "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ");
    }
}

async function resetCustomImage() {
    const food = window.activeModalFood;
    if (!food) return;

    try {
        const response = await fetch(`/api/products/${encodeURIComponent(food.barcode || food.id)}/image`, {
            method: "DELETE"
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result?.error || "ไม่สามารถคืนค่ารูปจาก API ได้");
        }

        food.customImage = "";
        food.image = food.apiImage || "";

        const modalImage = document.getElementById("modalImage");
        const preview = document.getElementById("customImagePreview");
        const previewWrap = document.getElementById("customImagePreviewWrap");
        if (modalImage) {
            modalImage.src = resolveProductImage(food);
        }
        if (preview && previewWrap) {
            previewWrap.classList.add("hidden");
            preview.src = "";
        }

        const fileInput = document.getElementById("customImageInput");
        if (fileInput) {
            fileInput.value = "";
        }

        persistEditedProduct(food);
        state.allFoods = state.allFoods.map((item) => applyEditedFoodOverrides(item));
        renderFoods({ data: state.visibleFoods, count: state.filteredFoods.length, ms: state.lastMs });
        showError("");
    } catch (error) {
        showError(error.message || "ไม่สามารถคืนค่ารูปจาก API ได้");
    }
}

function persistEditedProduct(food) {
    if (!food) return;

    const stableKey = getFoodKey(food);
    if (!stableKey) return;

    const editedMap = getEditedProductMap();
    const storedValue = {
        ...food,
        image: food.image || "",
        apiImage: food.apiImage || food.image || "",
        customImage: food.customImage || "",
        category: food.category || inferFoodCategory(food)
    };

    editedMap[stableKey] = storedValue;
    getFoodKeys(food).forEach((key) => {
        if (key && key !== stableKey) {
            editedMap[key] = storedValue;
        }
    });

    saveEditedProductMap(editedMap);
}

function saveProductInfo() {
    const food = window.activeModalFood;
    if (!food) return;

    const inlineIds = [
        ["modalName", "name"],
        ["modalBrand", "brand"],
        ["modalFlavor", "flavor"],
        ["modalBarcode", "barcode"],
        ["modalNutri", "nutriScore"],
        ["modalIngredients", "ingredients"],
        ["modalEnergy", "energy"],
        ["modalSugar", "sugar"],
        ["modalFat", "fat"],
        ["modalProtein", "protein"]
    ];

    inlineIds.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;

        const rawText = el.textContent.replace(/\u00A0/g, " ").trim();
        if (key === "energy" || key === "sugar" || key === "fat" || key === "protein") {
            food[key] = Number(rawText) || 0;
            return;
        }

        food[key] = rawText || (food[key] || "-");
    });

    persistEditedProduct(food);

    state.allFoods = state.allFoods.map((item) => applyEditedFoodOverrides(item));
    renderFoods({ data: state.visibleFoods, count: state.filteredFoods.length, ms: state.lastMs });
    showError("");
}

function openProductModal(index) {
    const food = applyEditedFoodOverrides((window.foodData || [])[index]);
    if (!food) return;

    window.activeModalFood = food;
    updateCustomImageControls(food);

    document.getElementById("modalImage").src = resolveProductImage(food);
    document.getElementById("modalName").textContent = displayValue(food.name, "-");
    document.getElementById("modalBrand").textContent = displayValue(food.brand, "-");
    document.getElementById("modalFlavor").textContent = displayValue(food.flavor, "-");
    document.getElementById("modalBarcode").textContent = displayValue(food.barcode, "-");
    document.getElementById("modalNutri").textContent = displayValue(food.nutriScore, "-");
    document.getElementById("modalEnergy").textContent = formatNumber(food.energy);
    document.getElementById("modalSugar").textContent = formatNumber(food.sugar);
    document.getElementById("modalFat").textContent = formatNumber(food.fat);
    document.getElementById("modalProtein").textContent = formatNumber(food.protein);
    document.getElementById("modalIngredients").textContent = displayValue(food.ingredients, "-");

    const inlineIds = [
        ["modalName", "name"],
        ["modalBrand", "brand"],
        ["modalFlavor", "flavor"],
        ["modalBarcode", "barcode"],
        ["modalNutri", "nutriScore"],
        ["modalIngredients", "ingredients"],
        ["modalEnergy", "energy"],
        ["modalSugar", "sugar"],
        ["modalFat", "fat"],
        ["modalProtein", "protein"]
    ];

    inlineIds.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const value = (key === "energy" || key === "sugar" || key === "fat" || key === "protein")
            ? formatNumber(food[key])
            : displayValue(food[key], "-");
        el.textContent = value;
    });

    const modal = document.getElementById("productModal");
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function openCompareModal() {
    const items = Array.isArray(window.compareItems) ? window.compareItems : [];
    if (!items.length) {
        const shouldOpen = window.confirm("กรุณาเลือกสินค้าเพื่อเปรียบเทียบก่อนเปิดข้อมูล");
        if (!shouldOpen) return;
    }

    const modal = document.getElementById("compareModal");
    if (!modal) return;
    renderComparePanel();
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeCompareModal(event) {
    if (event && event.target !== event.currentTarget) {
        return;
    }

    const modal = document.getElementById("compareModal");
    if (modal) {
        modal.classList.remove("show");
    }

    if (!document.querySelector(".modal.show") && !document.querySelector(".compare-modal.show")) {
        document.body.style.overflow = "";
    }
}

function openClearCompareConfirm() {
    const modal = document.getElementById("clearCompareConfirmModal");
    if (!modal) return;
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeClearCompareConfirm(event) {
    if (event && event.target !== event.currentTarget) {
        return;
    }

    const modal = document.getElementById("clearCompareConfirmModal");
    if (modal) {
        modal.classList.remove("show");
    }

    if (!document.querySelector(".modal.show") && !document.querySelector(".compare-modal.show") && !document.querySelector(".clear-confirm-modal.show")) {
        document.body.style.overflow = "";
    }
}

function closeProductModal(event) {
    if (event && event.target !== event.currentTarget) {
        return;
    }

    const modal = document.getElementById("productModal");
    modal.classList.remove("show");
    if (!document.querySelector(".modal.show") && !document.querySelector(".compare-modal.show")) {
        document.body.style.overflow = "";
    }
}

document.addEventListener("keydown", function(event) {
    if (event.key === "Escape") {
        const compareModal = document.getElementById("compareModal");
        if (compareModal && compareModal.classList.contains("show")) {
            closeCompareModal();
            return;
        }

        const modal = document.getElementById("productModal");
        if (modal && modal.classList.contains("show")) {
            closeProductModal();
        }
    }
});

window.addEventListener("load", async function() {
    const savedMap = getEditedProductMap();
    if (Object.keys(savedMap).length) {
        await saveEditedProductMap(savedMap);
    }

    await hydrateEditedProductsMap();
    await restoreCustomImageMetadata();

    window.compareItems = [];
    renderComparePanel();

    const searchBtn = document.getElementById("searchBtn");
    const searchInput = document.getElementById("searchInput");
    const brandFilter = document.getElementById("brandFilter");
    const loadMoreBtn = document.getElementById("loadMoreBtn");
    const comparePill = document.getElementById("headerComparePill");
    const compareMoreBtn = document.getElementById("compareMoreBtn");
    const clearCompareBtn = document.getElementById("clearCompareBtn");
    const combineCompareBtn = document.getElementById("combineCompareBtn");
    const combineCompareCloseBtn = document.getElementById("combineCompareCloseBtn");
    const confirmClearCompareBtn = document.getElementById("confirmClearCompareBtn");
    const cancelClearCompareBtn = document.getElementById("cancelClearCompareBtn");
    const quickSearchButtons = document.querySelectorAll(".quick-search button");
    const filterChips = document.querySelectorAll(".filter-chip");
    const algoSelect = document.getElementById("algo");

    quickSearchButtons.forEach((button) => {
        button.dataset.label = button.dataset.label || button.textContent.trim().replace(/\s+\d+$/, "");
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
    });

    if (algoSelect) {
        algoSelect.addEventListener("change", async () => {
            state.sortMetric = getSortMetric();
            state.page = 1;
            state.visibleCount = 60;
            state.pageSize = 60;
            state.allFoods = [];
            await fetchNextPage();
        });
    }

    filterChips.forEach((button) => {
        button.addEventListener("click", () => {
            state.selectedFilter = button.dataset.filter || "all";
            if (state.selectedFilter === "all") {
                state.selectedCategory = "all";
                quickSearchButtons.forEach((item) => item.classList.toggle("active", item.dataset.category === "all"));
            }
            filterChips.forEach((item) => item.classList.toggle("active", item === button));
            applyFilterAndRender();
        });
    });

    quickSearchButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            return false;
        });
    });

    if (comparePill) {
        comparePill.addEventListener("click", openCompareModal);
    }

    if (combineCompareBtn) {
        combineCompareBtn.addEventListener("click", () => {
            openCombineCompareModal();
        });
    }

    if (combineCompareCloseBtn) {
        combineCompareCloseBtn.addEventListener("click", () => {
            closeCombineCompareModal();
        });
    }

    if (compareMoreBtn) {
        compareMoreBtn.addEventListener("click", () => {
            closeCompareModal();
            document.getElementById("searchInput")?.focus();
        });
    }

    if (clearCompareBtn) {
        clearCompareBtn.addEventListener("click", () => {
            openClearCompareConfirm();
        });
    }

    if (confirmClearCompareBtn) {
        confirmClearCompareBtn.addEventListener("click", () => {
            window.compareItems = [];
            renderComparePanel();
            updateCompareButtonStates();
            closeClearCompareConfirm();
            closeCompareModal();
        });
    }

    if (cancelClearCompareBtn) {
        cancelClearCompareBtn.addEventListener("click", () => {
            closeClearCompareConfirm();
        });
    }

    if (searchBtn && searchInput) {
        searchBtn.addEventListener("click", () => {
            state.searchKeyword = searchInput.value;
            state.pageSize = 60;
            state.visibleCount = 60;
            applyFilterAndRender();
        });

        searchInput.addEventListener("input", () => {
            state.searchKeyword = searchInput.value;
            state.pageSize = 60;
            state.visibleCount = 60;
            applyFilterAndRender();
        });
    }

    if (brandFilter) {
        brandFilter.addEventListener("change", () => {
            state.selectedBrand = brandFilter.value;
            state.pageSize = 60;
            state.visibleCount = 60;
            applyFilterAndRender();
        });
    }

    if (loadMoreBtn) {
        loadMoreBtn.addEventListener("click", async () => {
            if (state.loading) return;
            if (state.hasMore) {
                state.loading = true;
                state.visibleCount += 8;
                state.page += 1;
                await fetchNextPage();
                state.loading = false;
            }
        });
    }

    const changeImageBtn = document.getElementById("changeImageBtn");
    const customImageInput = document.getElementById("customImageInput");
    const saveCustomImageBtn = document.getElementById("saveCustomImageBtn");
    const resetCustomImageBtn = document.getElementById("resetCustomImageBtn");

    if (changeImageBtn && customImageInput) {
        changeImageBtn.addEventListener("click", () => customImageInput.click());
    }

    if (customImageInput) {
        customImageInput.addEventListener("change", () => {
            const file = customImageInput.files && customImageInput.files[0];
            const preview = document.getElementById("customImagePreview");
            const previewWrap = document.getElementById("customImagePreviewWrap");
            const saveBtn = document.getElementById("saveCustomImageBtn");

            if (!file) {
                if (preview && previewWrap) {
                    preview.src = "";
                    previewWrap.classList.add("hidden");
                }
                if (saveBtn) {
                    saveBtn.disabled = true;
                }
                return;
            }

            if (preview) {
                preview.src = URL.createObjectURL(file);
            }
            if (previewWrap) {
                previewWrap.classList.remove("hidden");
            }
            if (saveBtn) {
                saveBtn.disabled = false;
            }
        });
    }

    if (saveCustomImageBtn) {
        saveCustomImageBtn.addEventListener("click", saveCustomImage);
    }

    const saveInfoBtn = document.getElementById("saveProductInfoBtn");
    if (saveInfoBtn) {
        saveInfoBtn.addEventListener("click", saveProductInfo);
    }

    const inlineEditableTargets = [
        "modalName",
        "modalBrand",
        "modalFlavor",
        "modalBarcode",
        "modalNutri",
        "modalIngredients",
        "modalEnergy",
        "modalSugar",
        "modalFat",
        "modalProtein"
    ];

    inlineEditableTargets.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("blur", saveProductInfo);
    });

    const modalImage = document.getElementById("modalImage");
    if (modalImage && customImageInput) {
        modalImage.addEventListener("click", () => customImageInput.click());
    }

    if (resetCustomImageBtn) {
        resetCustomImageBtn.addEventListener("click", resetCustomImage);
    }

    loadDashboard();
});
