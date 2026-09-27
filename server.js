const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const app = express();
const PORT = 3001;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});
app.use(express.static("public", {
    maxAge: 0,
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }
}));

const CUSTOM_IMAGES_DIR = path.join(__dirname, "public", "images", "products");
const CUSTOM_IMAGE_META_PATH = path.join(CUSTOM_IMAGES_DIR, "custom-images.json");
const DATA_DIR = path.join(__dirname, "data");
const EDITED_PRODUCTS_PATH = path.join(DATA_DIR, "edited-products.json");
const customImageMap = {};

const BRAND_PATTERNS = [
    ["ซีพี", ["ซีพี", "cp", "c.p.", "cp all"]],
    ["เอส-เพียว", ["เอส-เพียว", "เอสเพียว", "s-pew", "spew", "s pew"]],
    ["เบทาโกร", ["เบทาโกร", "betagro", "betagro food"]],
    ["เนสท์เล่", ["เนสท์เล่", "nestle", "nestlé"]],
    ["มาม่า", ["มาม่า", "mama", "mama noodles"]],
    ["ไวไว", ["ไวไว", "wai wai", "waiwai"]],
    ["ยำยำ", ["ยำยำ", "yum yum", "yumyum"]],
    ["ดัชมิลล์", ["ดัชมิลล์", "duch mill", "duchmill"]],
    ["ไทย-เดนมาร์ค", ["ไทย-เดนมาร์ค", "thai denmark", "thaidenmark", "thai-denmark"]],
    ["โฟร์โมสต์", ["โฟร์โมสต์", "four most", "fourmost"]],
    ["โอวัลติน", ["โอวัลติน", "ovaltine", "ovaltine"]],
    ["ไมโล", ["ไมโล", "milo"]],
    ["โออิชิ", ["โออิชิ", "oishi", "o'ishi"]],
    ["ส.ขอนแก่น", ["ส.ขอนแก่น", "สขอนแก่น", "s. khonkaen", "s khonkaen", "s.khonkaen"]],
    ["เด็กสมบูรณ์", ["เด็กสมบูรณ์", "ด็กสมบูรณ์", "เด็กสมบูรณ์", "ด็อกสมบูรณ์", "dok somboon"]],
    ["ภูเขาทอง", ["ภูเขาทอง", "phu kaothong", "ภูเขาทอง"]],
    ["ทิปโก้", ["ทิปโก้", "tipco", "tip go"]],
    ["ดอยคำ", ["ดอยคำ", "doykum", "doy kwam"]],
    ["อิชิตัน", ["อิชิตัน", "ichitan"]],
    ["คาราบาว", ["คาราบาว", "karabao"]],
    ["ลิปตัน", ["ลิปตัน", "lipton"]],
    ["เลย์", ["เลย์", "lay"]],
    ["โก๋แก่", ["โก๋แก่", "ko kae", "ko-kae"]],
    ["ฟาร์มเฮ้าส์", ["ฟาร์มเฮ้าส์", "farm house", "farmhouse"]],
    ["การ์เด้น", ["การ์เด้น", "garden"]],
    ["ยูโร่", ["ยูโร่", "euro"]],
    ["ทิวลี่", ["ทิวลี่", "tiew lee", "tielee"]],
    ["ป๊อกกี้", ["ป๊อกกี้", "pocky"]],
    ["โคคา-โคล่า", ["โคคา-โคล่า", "coca cola", "coca-cola"]],
    ["เป๊ปซี่", ["เป๊ปซี่", "pepsi", "pepsii"]]
];

let foods = [];
const REMOVED_PRODUCT_CODES = new Set([
    "8854698012041"
]);
const REMOVED_PRODUCT_PATTERNS = [
    /\boishi\b/i,
    /โออิชิ/i
];
const MAX_BRAND_PAGES = 1;
const PAGE_SIZE = 60;
const API_DELAY_MS = 600;

const EXTRA_CATEGORY_PRODUCTS = [
    {
        id: "chip-lay-classic",
        name: "Lay Potato Chips Classic",
        brand: "Lay",
        flavor: "Classic Salted",
        barcode: "chip-lay-classic",
        nutriScore: "B",
        energy: 530,
        sugar: 1,
        fat: 31,
        protein: 6,
        ingredients: "Potato, vegetable oil, salt",
        image: "",
        apiImage: "",
        customImage: "",
        category: "chips"
    },
    {
        id: "chip-pringles-original",
        name: "Pringles Potato Chips Original",
        brand: "Pringles",
        flavor: "Original",
        barcode: "chip-pringles-original",
        nutriScore: "B",
        energy: 535,
        sugar: 2,
        fat: 33,
        protein: 5,
        ingredients: "Potato starch, vegetable oil, seasoning",
        image: "",
        apiImage: "",
        customImage: "",
        category: "chips"
    },
    {
        id: "chip-oishi-crispy",
        name: "Oishi Crispy Potato Chips",
        brand: "Oishi",
        flavor: "Sea Salt",
        barcode: "chip-oishi-crispy",
        nutriScore: "B",
        energy: 500,
        sugar: 2,
        fat: 30,
        protein: 5,
        ingredients: "Potato, palm oil, seasoning, salt",
        image: "",
        apiImage: "",
        customImage: "",
        category: "chips"
    },
    {
        id: "bread-gardenia-classic",
        name: "Gardenia Classic White Bread",
        brand: "Gardenia",
        flavor: "Classic White",
        barcode: "bread-gardenia-classic",
        nutriScore: "B",
        energy: 250,
        sugar: 4,
        fat: 2,
        protein: 9,
        ingredients: "Wheat flour, water, yeast, sugar, salt",
        image: "",
        apiImage: "",
        customImage: "",
        category: "bread"
    },
    {
        id: "bread-toast-wheat",
        name: "Wheat Toast Bread",
        brand: "Bake House",
        flavor: "Whole Wheat",
        barcode: "bread-toast-wheat",
        nutriScore: "A",
        energy: 230,
        sugar: 3,
        fat: 1,
        protein: 8,
        ingredients: "Whole wheat flour, water, yeast, sesame, salt",
        image: "",
        apiImage: "",
        customImage: "",
        category: "bread"
    },
    {
        id: "bread-wafer-cracker",
        name: "Crispy Wheat Crackers Bread",
        brand: "Baker's Choice",
        flavor: "Original",
        barcode: "bread-wafer-cracker",
        nutriScore: "B",
        energy: 420,
        sugar: 5,
        fat: 16,
        protein: 9,
        ingredients: "Wheat flour, vegetable oil, yeast, salt",
        image: "",
        apiImage: "",
        customImage: "",
        category: "bread"
    }
];

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCustomImageStorage() {
    fs.mkdirSync(CUSTOM_IMAGES_DIR, { recursive: true });
}

function loadCustomImageMap() {
    try {
        ensureCustomImageStorage();
        if (!fs.existsSync(CUSTOM_IMAGE_META_PATH)) {
            fs.writeFileSync(CUSTOM_IMAGE_META_PATH, JSON.stringify({}, null, 2), "utf8");
        }

        const raw = fs.readFileSync(CUSTOM_IMAGE_META_PATH, "utf8");
        const parsed = JSON.parse(raw || "{}");

        Object.keys(parsed).forEach((barcode) => {
            const imagePath = parsed[barcode];
            customImageMap[barcode] = typeof imagePath === "string" && imagePath.trim() ? imagePath : undefined;
        });
    } catch (error) {
        console.warn("ไม่สามารถโหลด custom image metadata ได้:", error.message);
    }
}

function saveCustomImageMap() {
    try {
        ensureCustomImageStorage();
        const cleaned = {};
        Object.entries(customImageMap).forEach(([barcode, imagePath]) => {
            if (barcode && imagePath) {
                cleaned[barcode] = imagePath;
            }
        });
        fs.writeFileSync(CUSTOM_IMAGE_META_PATH, JSON.stringify(cleaned, null, 2), "utf8");
    } catch (error) {
        console.warn("ไม่สามารถบันทึก custom image metadata ได้:", error.message);
    }
}

function ensureEditedProductsStorage() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(EDITED_PRODUCTS_PATH)) {
            fs.writeFileSync(EDITED_PRODUCTS_PATH, JSON.stringify({}, null, 2), "utf8");
        }
    } catch (error) {
        console.warn("ไม่สามารถเตรียมโครงสร้างข้อมูลที่แก้ไขได้:", error.message);
    }
}

function loadEditedProductsMap() {
    try {
        ensureEditedProductsStorage();
        const raw = fs.readFileSync(EDITED_PRODUCTS_PATH, "utf8");
        const parsed = JSON.parse(raw || "{}");
        editedProductsMap = parsed && typeof parsed === "object" ? parsed : {};
        return editedProductsMap;
    } catch (error) {
        console.warn("ไม่สามารถโหลดข้อมูลที่แก้ไขได้:", error.message);
        editedProductsMap = {};
        return {};
    }
}

function saveEditedProductsMap(map) {
    try {
        ensureEditedProductsStorage();
        const normalized = map && typeof map === "object" ? map : {};
        editedProductsMap = normalized;
        fs.writeFileSync(EDITED_PRODUCTS_PATH, JSON.stringify(normalized, null, 2), "utf8");
        return normalized;
    } catch (error) {
        console.warn("ไม่สามารถบันทึกข้อมูลที่แก้ไขได้:", error.message);
        return editedProductsMap;
    }
}

function normalizeText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]/gu, "")
        .trim();
}

function isBlockedProduct(product) {
    const barcode = String(product?.barcode || product?.id || "").trim();
    if (REMOVED_PRODUCT_CODES.has(barcode)) {
        return true;
    }

    const text = `${product?.name || ""} ${product?.brand || ""} ${product?.flavor || ""}`;
    return REMOVED_PRODUCT_PATTERNS.some((pattern) => pattern.test(text));
}

function brandMatchesCandidate(candidateBrand, targetBrand) {
    const cleanCandidate = normalizeText(candidateBrand);
    const cleanTarget = normalizeText(targetBrand);

    if (!cleanCandidate || !cleanTarget) {
        return false;
    }

    const aliases = BRAND_PATTERNS.find(([brand]) => normalizeText(brand) === cleanTarget || normalizeText(brand).includes(cleanTarget)) || [targetBrand, [targetBrand]];
    const possibleNames = aliases[1] || [targetBrand];

    return possibleNames.some(alias => {
        const cleanAlias = normalizeText(alias);
        if (!cleanAlias) {
            return false;
        }

        return cleanCandidate.includes(cleanAlias) || cleanAlias.includes(cleanCandidate);
    }) || cleanCandidate.includes(cleanTarget) || cleanTarget.includes(cleanCandidate);
}

function isSupportedBrand(brandText) {
    const candidates = String(brandText || "")
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean);

    return candidates.some(candidate => BRAND_PATTERNS.some(([brandName, aliases]) => {
        const aliasList = [brandName, ...(aliases || [])];
        return aliasList.some(alias => brandMatchesCandidate(candidate, alias));
    }));
}

function extractProductNumber(product, keys) {
    const nutriments = product?.nutriments || {};

    for (const key of keys) {
        const value = nutriments[key];
        if (value !== undefined && value !== null && value !== "") {
            const numeric = Number(value);
            if (!Number.isNaN(numeric)) {
                return numeric;
            }
        }
    }

    return undefined;
}

function getBestImage(product) {
    const candidates = [
        product.image_front_url,
        product.image_front_small_url,
        product.image_url,
        product.image_front_thumb_url,
        product.selected_images?.front?.display?.fr,
        product.selected_images?.front?.display?.en,
        product.selected_images?.front?.display?.th,
        product.selected_images?.front?.small?.fr,
        product.selected_images?.front?.small?.en,
        product.selected_images?.front?.small?.th
    ];

    return candidates.find(item => typeof item === "string" && item.trim()) || "";
}

function getProductFlavor(product) {
    const value = product.flavor || product.flavour || product.flavor_text || product.product_name_en || product.product_name_th || product.generic_name;
    return typeof value === "string" && value.trim() ? value.trim() : "-";
}

function getCustomImageForProduct(product) {
    const barcode = String(product?.code || product?._id || "").trim();
    if (!barcode || !customImageMap[barcode]) {
        return "";
    }
    return customImageMap[barcode];
}

function normalizeFoodRecord(product, matchedBrand) {
    const apiImage = getBestImage(product);
    const customImage = getCustomImageForProduct(product);
    const image = customImage || apiImage;
    const name = product.product_name || product.product_name_en || product.product_name_th || product.generic_name || product.product_name_fr || "-";
    const brand = product.brands || matchedBrand || "-";
    const barcode = String(product.code || product._id || "").trim();

    return {
        id: String(product.code || product._id || `${name}-${brand}-${Math.random().toString(16).slice(2)}`),
        name,
        brand,
        flavor: getProductFlavor(product),
        barcode: barcode || "-",
        nutriScore: product.nutriscore_grade || product.nutrition_grades || "-",
        energy: extractProductNumber(product, ["energy-kcal_100g", "energy_100g"]),
        sugar: extractProductNumber(product, ["sugars_100g", "sugar_100g"]),
        fat: extractProductNumber(product, ["fat_100g", "fat_total_100g"]),
        protein: extractProductNumber(product, ["proteins_100g", "proteins"]),
        ingredients: product.ingredients_text || product.ingredients_text_th || product.ingredients_text_en || "-",
        image,
        apiImage,
        customImage: customImage || ""
    };
}

async function fetchOpenFoodFactsByBrand(brand, page = 1, retries = 3) {
    const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
    url.search = new URLSearchParams({
        search_terms: brand,
        search_simple: "1",
        action: "process",
        tagtype_0: "brands",
        tag_contains_0: "contains",
        tag_0: brand,
        sort_by: "unique_scans_n",
        page: String(page),
        page_size: String(PAGE_SIZE),
        json: "1",
        fields: "product_name,product_name_en,product_name_th,generic_name,brands,code,image_front_url,image_front_small_url,image_url,image_front_thumb_url,selected_images,nutriments,ingredients_text,ingredients_text_th,ingredients_text_en,nutriscore_grade,nutrition_grades,flavor,flavour,quantity"
    }).toString();

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        const response = await fetch(url.toString(), {
            headers: {
                "User-Agent": "FoodCheck/1.0 (student-project)",
                "Accept": "application/json",
                "Accept-Language": "th,en-US;q=0.9,en;q=0.8"
            }
        });

        if (response.ok) {
            const data = await response.json();
            const products = Array.isArray(data.products) ? data.products : [];
            return {
                products,
                page: Number(data.page || page),
                pageCount: Number(data.page_count || 1)
            };
        }

        if (response.status === 429 || response.status === 500 || response.status === 503) {
            if (attempt < retries) {
                await wait(Math.min(API_DELAY_MS * attempt * 2, 3000));
                continue;
            }
        }

        throw new Error(`API ตอบ status ${response.status} สำหรับแบรนด์ ${brand}`);
    }

    throw new Error(`API ล้มเหลวสำหรับแบรนด์ ${brand}`);
}

async function loadFoods() {
    const seen = new Map();

    const activeBrands = [
        "เนสท์เล่",
        "โออิชิ",
        "ดอยคำ",
        "เป๊ปซี่",
        "ฟาร์มเฮ้าส์",
        "ทิปโก้",
        "ไทย-เดนมาร์ค",
        "มาม่า",
        "โก๋แก่",
        "อิชิตัน"
    ];

    for (const brand of activeBrands) {
        let page = 1;

        while (page <= MAX_BRAND_PAGES) {
            try {
                await wait(API_DELAY_MS);
                const result = await fetchOpenFoodFactsByBrand(brand, page, 2);
                const products = result.products || [];

                if (!products.length) {
                    break;
                }

                for (const product of products) {
                    const rawBrand = String(product.brands || "");

                    if (!isSupportedBrand(rawBrand)) {
                        continue;
                    }

                    const normalized = normalizeFoodRecord(product, rawBrand);
                    const dedupeKey = normalized.barcode && normalized.barcode !== "-" ? `code:${normalized.barcode}` : `fallback:${normalized.name}|${normalized.brand}|${normalized.ingredients}`;

                    if (
                        !normalized.name ||
                        normalized.name === "-" ||
                        !normalized.brand ||
                        seen.has(dedupeKey) ||
                        isBlockedProduct(normalized)
                    ) {
                        continue;
                    }

                    seen.set(dedupeKey, normalized);
                }

                if (result.page >= result.pageCount) {
                    break;
                }

                page += 1;
            } catch (error) {
                console.warn(`skip brand ${brand} page ${page}:`, error.message);
                break;
            }
        }
    }

    foods = Array.from(seen.values()).filter((item) => !isBlockedProduct(item));

    const extraFoods = EXTRA_CATEGORY_PRODUCTS.filter((product) => {
        const productKey = String(product.barcode || product.id || "").trim();
        if (REMOVED_PRODUCT_CODES.has(productKey) || isBlockedProduct(product)) {
            return false;
        }

        const existing = foods.some((item) => {
            const itemKey = String(item.barcode || item.id || "");
            return itemKey && productKey && itemKey === productKey;
        });
        return !existing;
    }).map((product) => ({
        ...product,
        category: product.category || inferFoodCategory(product)
    }));

    if (extraFoods.length) {
        foods.push(...extraFoods);
    }

    if (!foods.length) {
        console.warn("Open Food Facts ไม่มีข้อมูลสำหรับแบรนด์ที่เลือก");
        foods = [];
        return;
    }

    console.log(`โหลดข้อมูลจาก Open Food Facts สำเร็จ: ${foods.length} รายการ`);
}

function selectionSort(arr) {
    const a = [...arr];
    for (let i = 0; i < a.length - 1; i++) {
        let minIndex = i;
        for (let j = i + 1; j < a.length; j++) {
            const current = Number(a[j].sugar || 0);
            const minimum = Number(a[minIndex].sugar || 0);
            if (current < minimum) {
                minIndex = j;
            }
        }
        [a[i], a[minIndex]] = [a[minIndex], a[i]];
    }
    return a;
}

function insertionSort(arr) {
    const a = [...arr];
    for (let i = 1; i < a.length; i++) {
        const key = a[i];
        let j = i - 1;
        while (j >= 0 && Number(a[j].sugar || 0) > Number(key.sugar || 0)) {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = key;
    }
    return a;
}

function bubbleSort(arr) {
    const a = [...arr];
    for (let i = 0; i < a.length - 1; i++) {
        for (let j = 0; j < a.length - 1 - i; j++) {
            if (Number(a[j].sugar || 0) > Number(a[j + 1].sugar || 0)) {
                [a[j], a[j + 1]] = [a[j + 1], a[j]];
            }
        }
    }
    return a;
}

function sortByMetric(arr, metric) {
    const key = ["sugar", "protein", "fat"].includes(metric) ? metric : "sugar";
    const a = [...arr];

    a.sort((left, right) => {
        const leftValue = Number(left?.[key] ?? 0);
        const rightValue = Number(right?.[key] ?? 0);

        if (key === "protein") {
            return rightValue - leftValue;
        }

        return leftValue - rightValue;
    });

    return a;
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, callback) => {
            ensureCustomImageStorage();
            callback(null, CUSTOM_IMAGES_DIR);
        },
        filename: (req, file, callback) => {
            const extName = path.extname(file.originalname || ".png").toLowerCase() || ".png";
            const safeBarcode = String(req.params.barcode || "product").replace(/[^a-zA-Z0-9_-]/g, "_");
            const filename = `${safeBarcode}-${Date.now()}-${Math.random().toString(16).slice(2)}${extName}`;
            callback(null, filename);
        }
    }),
    fileFilter: (_, file, callback) => {
        if (!file || !file.mimetype || !file.mimetype.startsWith("image/")) {
            callback(new Error("ไฟล์ที่อัปโหลดต้องเป็นรูปภาพ"));
            return;
        }

        callback(null, true);
    }
});

app.post("/api/products/:barcode/image", upload.single("image"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "กรุณาเลือกไฟล์รูปภาพ" });
        }

        const barcode = String(req.params.barcode || "").trim();
        const imageUrl = `/images/products/${req.file.filename}`;

        if (barcode) {
            customImageMap[barcode] = imageUrl;
            saveCustomImageMap();
        }

        return res.json({
            ok: true,
            barcode,
            imageUrl,
            customImage: imageUrl
        });
    } catch (error) {
        return res.status(500).json({ error: error.message || "ไม่สามารถบันทึกรูปภาพได้" });
    }
});

app.delete("/api/products/:barcode/image", (req, res) => {
    try {
        const barcode = String(req.params.barcode || "").trim();
        const currentImage = barcode ? customImageMap[barcode] : "";

        if (currentImage) {
            const fileName = path.basename(currentImage);
            const filePath = path.join(CUSTOM_IMAGES_DIR, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            delete customImageMap[barcode];
            saveCustomImageMap();
        }

        return res.json({ ok: true, barcode, removed: Boolean(currentImage) });
    } catch (error) {
        return res.status(500).json({ error: error.message || "ไม่สามารถคืนค่ารูปภาพได้" });
    }
});

app.get("/api/edited-products", (_, res) => {
    const payload = loadEditedProductsMap();
    res.json({ ok: true, data: payload });
});

app.post("/api/edited-products", (req, res) => {
    try {
        const incoming = req.body && typeof req.body === "object" ? req.body : {};
        const merged = { ...loadEditedProductsMap(), ...incoming };
        saveEditedProductsMap(merged);
        res.json({ ok: true, data: merged });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message || "ไม่สามารถบันทึกข้อมูลที่แก้ไขได้" });
    }
});

app.get("/foods", (req, res) => {
    const algo = req.query.sort || "sugar";
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 12));
    const start = performance.now();

    let sorted = [...foods];
    if (algo === "protein") {
        sorted = sortByMetric(sorted, "protein");
    } else if (algo === "fat") {
        sorted = sortByMetric(sorted, "fat");
    } else if (algo === "sugar") {
        sorted = sortByMetric(sorted, "sugar");
    } else if (algo === "insertion") {
        sorted = insertionSort(sorted);
    } else if (algo === "bubble") {
        sorted = bubbleSort(sorted);
    } else {
        sorted = selectionSort(sorted);
    }

    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const sliceStart = (page - 1) * limit;
    const pageItems = sorted.slice(sliceStart, sliceStart + limit);
    const ms = (performance.now() - start).toFixed(3);

    res.json({
        algorithm: algo,
        count: total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
        ms,
        data: pageItems
    });
});

loadCustomImageMap();
loadEditedProductsMap();
loadFoods()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`FoodCheck running at http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error("Failed to load Open Food Facts data:", error.message);
        app.listen(PORT, () => {
            console.log(`FoodCheck running at http://localhost:${PORT} with empty inventory`);
        });
    });