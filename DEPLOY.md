# 🚀 Деплой Rust Radar на бесплатный хостинг

Пошаговый чек-лист. Два варианта: **B (проще)** — Render + Vercel, всё бесплатно;
**A (лучше)** — Oracle Cloud Free VPS, 24/7 без засыпания + работает A2S-скан серверов.

После любого варианта у тебя будет: сайт с личным watchlist, Telegram-бот,
уведомления в реальном времени — и ничего не теряется после перезапусков.

---

## Шаг 0. База данных (MongoDB Atlas) — нужна в обоих вариантах

1. Зайди на https://www.mongodb.com/cloud/atlas → Sign up (бесплатно).
2. Create Cluster → выбери **M0 FREE** (512 МБ, навсегда).
3. **Database Access** → Add User: логин + пароль (сохрани их).
4. **Network Access** → Add IP → `0.0.0.0/0` (доступ отовсюду — для хостингов, у которых IP плавает).
5. **Connect → Drivers** → скопируй строку вида:
   `mongodb+srv://логин:пароль@cluster0.xxxxx.mongodb.net/?retryWrites=true`
   Это и есть твой `MONGO_URI` (в конец допиши `/rust-radar` перед `?`, чтобы задать имя базы).

---

## Вариант B — ПРОЩЕ: Render (бэкенд) + Vercel (фронтенд)

⚠️ Минус: бэкенд **засыпает** после ~15 минут без посетителей (просыпается за ~30 сек
при заходе на сайт). Решение ниже. A2S-скан серверов может не работать (UDP).

### B1. Бэкенд на Render
1. Залей проект на GitHub (репозиторий).
2. https://render.com → New → **Web Service** → подключи репозиторий.
3. Настройки:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Environment Variables** (Variables → Add):
   | Ключ | Значение |
   |---|---|
   | `MONGO_URI` | строка из Шага 0 |
   | `STEAM_API_KEY` | твой ключ Steam |
   | `SESSION_SECRET` | любая длинная случайная строка |
   | `TELEGRAM_BOT_TOKEN` | токен бота (опционально) |
   | `APP_URL` | адрес фронтенда, напр. `https://rust-radar.vercel.app` |
   | `CLIENT_ORIGIN` | тот же адрес фронтенда |
   | `NODE_ENV` | `production` |
5. Create Web Service → бэкенд получит адрес вида `https://rust-radar-api.onrender.com`.

### B2. Фронтенд на Vercel
1. https://vercel.com → Add New → Project → тот же репозиторий.
2. **Root Directory:** `frontend` (Vite определится сам).
3. Открой `frontend/vercel.json` и замени адрес бэкенда на свой из B1.
4. Deploy → фронт получит адрес вида `https://rust-radar.vercel.app`.

### B3. Чтобы бэкенд не засыпал
1. https://uptimerobot.com (бесплатно) → Add New Monitor.
2. Тип HTTP, интервал **5 минут**, URL: `https://твой-бэкенд.onrender.com/api/health`.

---

## Вариант A — ЛУЧШИЙ: Oracle Cloud Free VPS (24/7, UDP, один процесс)

Бесплатная VPS навсегда (Arm, 4 ядра / 24 ГБ). Никаких засыпаний, и **открытый UDP**
→ заработает настоящий A2S-скан серверов. Нужна банковская карта для регистрации
(не списывают).

1. https://cloud.oracle.com → Free Tier → создай инстанс **A1 Flex (Ubuntu)**.
2. Подключись по SSH и выполни:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs git
   git clone <твой-репозиторий> && cd rust-radar
   cd backend && npm install && cd ../frontend && npm install && npm run build && cd ..
   ```
3. Создай `backend/.env` (те же переменные, что в B1; `APP_URL` = `http://IP-СЕРВЕРА`,
   `NODE_ENV=production`). Бэкенд **сам раздаст собранный фронтенд** из `frontend/dist`
   — весь сайт работает на одном порту.
4. Запусти навсегда:
   ```bash
   sudo npm install -g pm2
   pm2 start backend/server.js --name rust-radar && pm2 save && pm2 startup
   ```
5. Открой порты: в панели Oracle (Security List) — 3001, и в Ubuntu:
   ```bash
   sudo ufw allow 3001 && sudo ufw enable
   ```
6. Сайт: `http://IP-СЕРВЕРА:3001` (домен можно прицепить позже + Cloudflare для https).

---

## Финальные проверки после деплоя

- [ ] `https://твой-сайт/api/health` → `{"status":"ok"}`
- [ ] Вход через Steam работает (в `APP_URL` указан адрес фронтенда — иначе Steam вернёт ошибку)
- [ ] Добавил врага → перезапустил бэкенд → **враг на месте** (MongoDB работает)
- [ ] ТГ-бот привязан (код из карточки TELEGRAM) и шлёт уведомления
- [ ] `NODE_ENV=production` — dev-вход отключён автоматически

## Что уже учтено в коде

- Сессии входа хранятся в MongoDB (`connect-mongo`) — перезапуски не разлогинивают.
- Кука входа живёт 30 дней.
- `NODE_ENV=production`: отключает dev-вход и in-memory базу (без `MONGO_URI` бэкенд честно упадёт).
- `frontend/vercel.json` — прокси `/api` на бэкенд (для варианта B).
- Кэш названий серверов и `gameserverip` работают по HTTPS — на любом хостинге.
