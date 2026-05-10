const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PRIVATE_DIR = path.join(ROOT, "private");
const DATA_FILE = path.join(DATA_DIR, "site-data.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const CONFIG_FILE = path.join(PRIVATE_DIR, "config.json");
const PORT = Number(process.env.PORT || 3000);

const sessions = new Map();
const orderClients = new Map();
const orderIps = new Map();
const orderHashes = new Map();
const loginIps = new Map();
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const LOGIN_WINDOW_MS = 1000 * 60 * 15;
const LOGIN_IP_LIMIT = 6;
const ORDER_CLIENT_COOKIE = "ORDERCID";
const ORDER_WINDOW_MS = 1000 * 60 * 10;
const ORDER_HOUR_MS = 1000 * 60 * 60;
const ORDER_COOLDOWN_MS = 1000 * 45;
const ORDER_CLIENT_LIMIT = 2;
const ORDER_IP_LIMIT = 5;
const ORDER_IP_HOUR_LIMIT = 14;
const ORDER_DUPLICATE_MS = 1000 * 60 * 20;

const DEFAULT_DATA = {
  settings: {
    brand: "MR OPT64",
    kicker: "Каталог, корзина и быстрая заявка",
    heroTitle: "Товары по понятным ценам для дома и бизнеса",
    heroText: "Выбирайте позиции из каталога, собирайте заказ в корзине и отправляйте заявку в Telegram. Актуальные цены и условия меняются прямо из админ-панели.",
    notice: "Единые цены при любом количестве",
    telegram: "test1234",
    phone: "",
    minOrder: 5000,
    deliveryFrom: 10000,
    cities: "Саратов / Энгельс",
    pickup: "Самовывоз по договоренности.",
    payment: "Финальные детали подтверждаются в Telegram."
  },
  products: [
    { id: "p1", category: "Корма для кошек — сухие", title: "Kitekat Мясной пир для взрослых кошек, 1.3 кг", price: 300, unit: "шт", stock: "В наличии", tag: "Kitekat", description: "Сухой полнорационный корм. Цена единая при любом количестве.", image: "" },
    { id: "p2", category: "Корма для кошек — сухие", title: "Kitekat Мясной пир для взрослых кошек, 800 г", price: 178, unit: "шт", stock: "В наличии", tag: "Kitekat", description: "Удобный формат для регулярных заказов.", image: "" },
    { id: "p3", category: "Корма для кошек — сухие", title: "Kitekat Мясной пир для взрослых кошек, 350 г", price: 89, unit: "шт", stock: "В наличии", tag: "Kitekat", description: "Компактная упаковка для пробного заказа.", image: "" },
    { id: "p4", category: "Корма для кошек — влажные", title: "Kitekat влажный корм 85 г, все вкусы", price: 16.8, unit: "шт", stock: "В наличии", tag: "85 г", description: "Соус и желе, ассортимент уточняется при заявке.", image: "" },
    { id: "p5", category: "Корма для кошек — влажные", title: "Felix влажный корм 75 г, все вкусы", price: 20, unit: "шт", stock: "В наличии", tag: "75 г", description: "Популярные вкусы в соусе и желе.", image: "" },
    { id: "p6", category: "Корма для кошек — влажные", title: "Whiskas влажный корм 75 г, все вкусы", price: 21, unit: "шт", stock: "В наличии", tag: "75 г", description: "Ассортимент вкусов уточняется при подтверждении.", image: "" },
    { id: "p7", category: "Шоколад", title: "Alpen Gold 80 г, все вкусы", price: 60, unit: "шт", stock: "В наличии", tag: "80 г", description: "Плиточный шоколад для розничных и офисных заказов.", image: "" },
    { id: "p8", category: "Шоколад", title: "Milka молочный шоколад 80 г", price: 75, unit: "шт", stock: "В наличии", tag: "Milka", description: "Классический молочный вкус.", image: "" },
    { id: "p9", category: "Шоколад", title: "Milka клубника со сливками, 80 г", price: 75, unit: "шт", stock: "В наличии", tag: "Milka", description: "Двухслойная начинка с мягким вкусом.", image: "" },
    { id: "p10", category: "Шоколад", title: "Milka с фундуком, 80 г", price: 75, unit: "шт", stock: "В наличии", tag: "Milka", description: "Молочный шоколад с фундуком.", image: "" },
    { id: "p11", category: "Чай и кофе", title: "Greenfield Kenyan Sunrise, 100 пакетиков", price: 225, unit: "шт", stock: "В наличии", tag: "100 шт", description: "Черный чай для дома, офиса и торговых точек.", image: "" },
    { id: "p12", category: "Ассорти", title: "Молоко сгущенное Рогачевъ цельное 8.5%, 380 г", price: 105, unit: "шт", stock: "В наличии", tag: "380 г", description: "Сгущенное молоко с сахаром.", image: "" }
  ]
};

function ensureFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2), "utf8");
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, "[]", "utf8");
  }
}

function readConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    fileConfig = {};
  }

  return {
    adminPassword: process.env.ADMIN_PASSWORD || fileConfig.adminPassword || "",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || fileConfig.telegramBotToken || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || fileConfig.telegramChatId || ""
  };
}

function readData() {
  try {
    return sanitizePublicData(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
  } catch {
    return DEFAULT_DATA;
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(sanitizePublicData(data), null, 2), "utf8");
}

function readOrders() {
  try {
    const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(orders) ? orders : [];
  } catch {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders.slice(0, 200), null, 2), "utf8");
}

function sanitizePublicData(data) {
  const settings = data && data.settings ? data.settings : {};
  const products = Array.isArray(data && data.products) ? data.products : [];
  const { botToken, chatId, adminPin, adminPassword, telegramBotToken, telegramChatId, ...safeSettings } = settings;

  return {
    settings: {
      ...DEFAULT_DATA.settings,
      ...safeSettings,
      minOrder: Number(safeSettings.minOrder) || DEFAULT_DATA.settings.minOrder,
      deliveryFrom: Number(safeSettings.deliveryFrom) || DEFAULT_DATA.settings.deliveryFrom
    },
    products: products.map(normalizeProduct)
  };
}

function normalizeProduct(product) {
  return {
    id: String(product.id || crypto.randomUUID()),
    category: String(product.category || "Ассорти"),
    title: String(product.title || "Новый товар"),
    price: Number(product.price) || 0,
    unit: String(product.unit || "шт"),
    stock: String(product.stock || "В наличии"),
    tag: String(product.tag || ""),
    description: String(product.description || ""),
    image: String(product.image || "")
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    ...headers
  });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8" });
}

function redirect(res, location) {
  send(res, 302, "", { Location: location });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(header.split(";").map(part => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") || "")];
  }).filter(([key]) => key));
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function setCookie(res, name, value, maxAgeSeconds) {
  const existing = res.getHeader("Set-Cookie");
  const next = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];
  if (process.env.NODE_ENV === "production") next.push("Secure");
  const cookie = next.join("; ");
  if (!existing) res.setHeader("Set-Cookie", cookie);
  else if (Array.isArray(existing)) res.setHeader("Set-Cookie", [...existing, cookie]);
  else res.setHeader("Set-Cookie", [existing, cookie]);
}

function getSession(req) {
  const id = parseCookies(req).PHPSESSID;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return { id, ...session };
}

function setSessionCookie(res, id) {
  const parts = [
    `PHPSESSID=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "PHPSESSID=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function checkLoginFraud(req) {
  const now = Date.now();
  const ip = getClientIp(req);
  const bucket = loginIps.get(ip) || [];
  const recent = bucket.filter(time => now - time < LOGIN_WINDOW_MS);
  if (recent.length >= LOGIN_IP_LIMIT) {
    loginIps.set(ip, recent);
    return { ok: false, retryAfter: Math.ceil(LOGIN_WINDOW_MS / 1000) };
  }
  recent.push(now);
  loginIps.set(ip, recent);
  return { ok: true };
}

function pruneFraudBuckets(now = Date.now()) {
  for (const [key, bucket] of orderClients) {
    bucket.events = bucket.events.filter(time => now - time < ORDER_HOUR_MS);
    if (!bucket.events.length && (!bucket.lastAt || now - bucket.lastAt > ORDER_HOUR_MS)) {
      orderClients.delete(key);
    }
  }
  for (const [key, bucket] of orderIps) {
    bucket.events = bucket.events.filter(time => now - time < ORDER_HOUR_MS);
    if (!bucket.events.length && (!bucket.lastAt || now - bucket.lastAt > ORDER_HOUR_MS)) {
      orderIps.delete(key);
    }
  }
  for (const [hash, expiresAt] of orderHashes) {
    if (expiresAt < now) orderHashes.delete(hash);
  }
}

function checkOrderFraud(req, res, text) {
  const now = Date.now();
  pruneFraudBuckets(now);

  const cookies = parseCookies(req);
  let clientId = cookies[ORDER_CLIENT_COOKIE];
  if (!clientId || !/^[a-f0-9]{32,64}$/i.test(clientId)) {
    clientId = crypto.randomBytes(24).toString("hex");
    setCookie(res, ORDER_CLIENT_COOKIE, clientId, Math.floor(ORDER_HOUR_MS * 24 * 30 / 1000));
  }

  const ip = getClientIp(req);
  const clientBucket = orderClients.get(clientId) || { events: [], lastAt: 0 };
  const ipBucket = orderIps.get(ip) || { events: [], lastAt: 0 };
  const recentClient = clientBucket.events.filter(time => now - time < ORDER_WINDOW_MS);
  const recentIp = ipBucket.events.filter(time => now - time < ORDER_WINDOW_MS);
  const hourlyIp = ipBucket.events.filter(time => now - time < ORDER_HOUR_MS);
  const hash = crypto.createHash("sha256").update(text.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");

  if (now - clientBucket.lastAt < ORDER_COOLDOWN_MS) {
    return { ok: false, retryAfter: Math.ceil((ORDER_COOLDOWN_MS - (now - clientBucket.lastAt)) / 1000), reason: "cooldown" };
  }
  if (recentClient.length >= ORDER_CLIENT_LIMIT) {
    return { ok: false, retryAfter: 600, reason: "client_limit" };
  }
  if (recentIp.length >= ORDER_IP_LIMIT || hourlyIp.length >= ORDER_IP_HOUR_LIMIT) {
    return { ok: false, retryAfter: 900, reason: "ip_limit" };
  }
  if (orderHashes.has(hash)) {
    return { ok: false, retryAfter: 600, reason: "duplicate" };
  }

  clientBucket.events = [...recentClient, now];
  clientBucket.lastAt = now;
  ipBucket.events = [...hourlyIp, now];
  ipBucket.lastAt = now;
  orderClients.set(clientId, clientBucket);
  orderIps.set(ip, ipBucket);
  orderHashes.set(hash, now + ORDER_DUPLICATE_MS);
  return { ok: true };
}

async function readJsonBody(req, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("payload too large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handleApi(req, res, pathname) {
  if (pathname === "/api/catalog" && req.method === "GET") {
    return json(res, 200, readData());
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const loginFraud = checkLoginFraud(req);
    if (!loginFraud.ok) {
      return send(res, 429, JSON.stringify({ ok: false }), {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(loginFraud.retryAfter)
      });
    }
    const body = await readJsonBody(req, 16 * 1024);
    const config = readConfig();
    if (!config.adminPassword) return json(res, 500, { ok: false });
    if (String(body.password || "") !== config.adminPassword) {
      return json(res, 401, { ok: false });
    }
    const id = crypto.randomBytes(32).toString("hex");
    sessions.set(id, { createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, id);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    const session = getSession(req);
    if (session) sessions.delete(session.id);
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (pathname === "/api/session" && req.method === "GET") {
    return json(res, getSession(req) ? 200 : 401, { ok: Boolean(getSession(req)) });
  }

  if (pathname === "/api/admin/catalog") {
    if (!getSession(req)) return json(res, 401, { ok: false });
    if (req.method === "GET") return json(res, 200, readData());
    if (req.method === "PUT") {
      const body = await readJsonBody(req);
      writeData(body);
      return json(res, 200, { ok: true, data: readData() });
    }
  }

  if (pathname === "/api/admin/orders") {
    if (!getSession(req)) return json(res, 401, { ok: false });
    if (req.method === "GET") return json(res, 200, { orders: readOrders() });
    if (req.method === "DELETE") {
      writeOrders([]);
      return json(res, 200, { ok: true });
    }
  }

  if (pathname === "/api/order" && req.method === "POST") {
    const body = await readJsonBody(req, 64 * 1024);
    const text = String(body.text || "").trim();
    if (!text || text.length > 3900) return json(res, 400, { ok: false, error: "bad text" });

    const fraud = checkOrderFraud(req, res, text);
    if (!fraud.ok) {
      return send(
        res,
        429,
        JSON.stringify({ ok: false, error: "too many orders", reason: fraud.reason }),
        {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(fraud.retryAfter)
        }
      );
    }

    const config = readConfig();
    if (!config.telegramBotToken || !config.telegramChatId) {
      return json(res, 500, { ok: false, error: "telegram is not configured" });
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text,
        disable_web_page_preview: true
      })
    });

    if (!telegramResponse.ok) return json(res, 502, { ok: false, error: "telegram failed" });
    const orders = readOrders();
    orders.unshift({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ip: getClientIp(req),
      clientId: parseCookies(req)[ORDER_CLIENT_COOKIE] || "",
      text
    });
    writeOrders(orders);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { ok: false });
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveFile(req, res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/admin") pathname = "/admin.html";

  if (pathname === "/admin.html" && !getSession(req)) {
    return redirect(res, "/login.html");
  }

  const blocked = pathname.startsWith("/data/")
    || pathname.startsWith("/private/")
    || pathname.includes("..")
    || pathname.endsWith("server.js")
    || pathname.split("/").some(part => part.startsWith("."));
  if (blocked) return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });

  const filePath = path.join(ROOT, pathname);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }

  const headers = { "Content-Type": contentType(filePath) };
  if (pathname === "/admin.html") headers["Cache-Control"] = "no-store";
  send(res, 200, fs.readFileSync(filePath), headers);
}

ensureFiles();

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname);
    }
    return serveFile(req, res, url.pathname);
  } catch (error) {
    console.error("Request failed", req.method, req.url, error);
    return json(res, 500, { ok: false });
  }
}).listen(PORT, () => {
  console.log(`MR OPT64 site is running: http://localhost:${PORT}`);
});
