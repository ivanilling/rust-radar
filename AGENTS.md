# AGENTS.md — Rust Enemy Radar & Tracker

## Назначение проекта
Веб-сервис мониторинга активности игроков в Rust (игра, AppID **252490**) — аналог Battlemetrics + Steam Tracker.
Отслеживает «врагов» двумя способами одновременно: опрос Steam Web API (статус профиля + запущена ли Rust) и A2S-запросы напрямую к игровым серверам (в каком именно сервере игрок сидит прямо сейчас). История сессий хранится для графиков активности.

Репозиторий стартует **пустым**: код создаётся с нуля агентом, поэтапно (Этапы 1→3 ниже). Не искать существующую архитектуру — её создаём.

## Структура (создать при инициализации)
```
/backend   Node.js (Express) + MongoDB (Mongoose)  — реализован (Этапы 1–2)
  routes/        — только маршруты
  controllers/   — обработчики запросов
  services/      — изолированная логика: steamApiService, a2sScanner (gamedig),
                   trackerService (цикл), отдельные моки в scripts/
/frontend  React 18 (Vite) + Tailwind CSS v4 (@tailwindcss/vite, токены в
  src/index.css @theme) + Framer Motion + Lucide React + Recharts  — реализован (Этап 3+)
  components/    — AuthGate (лендинг ⇄ дашборд), Landing (вход через Steam),
                   Dashboard (опрос /api/players раз в 8с, тосты на смене статусов),
                   PlayerCard (вращающиеся неоновые рамки у «в игре»), PlayerModal
                   (график истории), ServerPanel, RadarWidget (блипы по hash(steamId)),
                   Toasts («ВРАГ В СЕТИ»), Avatar
  ВАЖНО: авторизация — сессия express-session (cookie). Неавторизованный видит общий
  список; вошедший — только свой watchlist (фильтр в playerController.listPlayers по
  req.user.watchlist). DELETE /api/players/:id убирает из личного watchlist и
  деактивирует игрока, только если его никто больше не отслеживает.
```

## Стек (обязательный)
- **Бэкенд:** Express, Mongoose, `passport-steam` (Steam OpenID вход), Steam Web API (`GetPlayerSummaries`), `gamedig` (предпочтительно) или `node-a2s` для A2S_PLAYER UDP-запросов.
- **Фронтенд:** Vite + React, Tailwind CSS, **Framer Motion** (обязателен — анимации переходов), **Lucide React** (обязателен — иконки), Recharts или Chart.js для графиков.

## Ключевая доменная логика
- **Watchlist личный** (`WatchlistItem`: user + player + `notify` — настройки уведомлений на КАЖДОГО врага: enter/exit/serverChange/sound; общие для сайта и Telegram-бота). Поток: поиск `GET /api/players/search` (БЕЗ отслеживания) → кнопка «Отслеживать» `POST /api/players/:id/track` (нужен вход через Steam) → настройки `PATCH /api/players/:id/notify`. Гость видит общий список (демо-режим).
- **Уведомления:** trackerService детектит события (вход в Rust / выход / смена сервера — по изменениям isInRust и currentServer) и зовёт `notifyService.dispatch` → Telegram-сообщения уходят только тем, у кого событие включено в notify. Тосты и звук на сайте фильтруются теми же настройками на клиенте.
- **Реальное время:** трекер работает сам (без кнопки СКАН — она лишь принудительный запуск). Интервал адаптивный: `TRACK_INTERVAL_MS` (60с), а пока кто-то из отслеживаемых в игре — `TRACK_FAST_INTERVAL_MS` (20с). События (enter/exit/serverChange) уходят в `eventBus` → SSE `GET /api/track/events` → фронт через EventSource: мгновенно обновляет карточку, тостит и пищит. 8-секундный опрос /api/players остался как страховка синхронизации.
- **Telegram-бот** (`telegramService`): long-polling getUpdates (webhook не нужен, работает на бесплатных хостингах), включается при наличии `TELEGRAM_BOT_TOKEN`. Команды: /start, /link КОД (привязка аккаунта; код из `POST /api/telegram/link`, живёт 10 мин), /list, /watch ID, /unwatch ID, /settings.
- **Три метода слежки сливаются:**
  1. Steam API: опрос `GetPlayerSummaries` раз в 1 минуту — онлайн ли враг и запущена ли Rust (appid 252490).
  2. A2S: циклический скан заданных IP серверов Rust; если ник врага найден в списке игроков — показать точное название сервера (требует открытый UDP, на машине разработки закрыт).
  3. **gameserverip (работает без UDP)**: Steam сам отдаёт `gameserverip` (IP:порт сервера, где сидит игрок) в GetPlayerSummaries; название резолвится из кэша `IGameServersService/GetServerList` (`serverNameService`, ~4.8 тыс. живых Rust-серверов одним запросом, обновление раз в 30 мин, env `SERVER_LIST_REFRESH_MS`). Приоритет: живой A2S-скан перетирает gameserverip; gameserverip не трогает свежий a2s-результат (поле `matchedBy`).
- **История сессий в MongoDB:** время захода/выхода, длительность; `TrackingSession.source` = `steam` | `a2s` | `gameserverip`.
- Данные пользователя (SteamID64, аватар, ник) сохраняются в MongoDB при входе через Steam.

## UI/дизайн (обязательные правила)
- Тёмный киберспортивный стиль: чёрный/тёмно-серый фон, **неоновый зелёный** = онлайн, **неоновый красный** = офлайн.
- Игроки «в игре сейчас» — карточки с пульсирующими неоновыми кольцами (эффект радара, Tailwind `animate-ping`).
- Уведомления «ВРАГ В СЕТИ»: toast, вылетающий сверху экрана, с анимацией Framer Motion.
- Графики активности плавно отрисовываются при открытии профиля.

## Команды
- бэкенд: `cd backend` → `npm run dev` (обычный запуск), `npm run demo` (ДЕМО: мок Steam API + мок Rust-сервер + автосид 3 врагов и сервера — идеальный способ показать сайт без ключей и сети), `npm run smoke` (e2e 42 проверки, гонять после правок trackerService/моделей), `npm run find-servers`;
- фронтенд (Этап 3 готов): `cd frontend` → `npm run dev` (порт 5173, прокси `/api` → бэкенд, целевой порт бэкенда меняется env `API_TARGET`), `npm run build`;
- демо-пара: backend `npm run demo` (порт 3001) + frontend `npm run dev` → http://localhost:5173;
- запускать тесты/скрипты, читать ошибки в консоли и исправлять код самостоятельно, без запроса подтверждения.

## Бэкенд: что уже реализовано и как устроено
- **Модели** (`src/models/`): `Player` (steamId64 unique, nickname + nicknameNormalized, isOnline/isInRust, steamStatus, currentServer, кольцевой буфер `onlineHistory` — select:false, пишется через `$push` c `$slice:-288`), `TrackingSession` (история сессий: source steam/a2s/gameserverip, server, startedAt/endedAt/durationMinutes, statics `openIfAbsent`/`closeSessions`), `WatchlistItem` (user+player unique + notify-настройки), `GameServer` (host+port unique), `User` (Steam-вход + telegramChatId/tgLinkCode).
- **Сервисы** (`src/services/`): `steamApiService` (GetPlayerSummaries батчами ≤100 + gameserverip, ResolveVanityURL, распознавание SteamID64/ссылки/vanity во вводе), `a2sScanner` (gamedig type 'rust', матчинг игроков со watchlist по SteamID64 → фоллбэк по нормализованному нику), `serverNameService` (кэш имён серверов по ip:port из GetServerList — работает без UDP), `telegramService` (long-polling бот), `notifyService` (рассылка событий по настройкам), `trackerService` (цикл раз в TRACK_INTERVAL_MS: сначала A2S-скан всех серверов, потом Steam-опрос; открытие/закрытие сессий; POST /api/track/run запускает цикл вручную — используй его для проверки, а не ожидание интервала).
- **API**: `/api/health`, `/api/auth/*` (passport-steam, требует STEAM_API_KEY), `/api/players` (CRUD watchlist, ?history=1), `/api/servers` (добавление с живой A2S-проверкой, POST /:id/scan), `/api/track/run|status`.

## Сетевые/платформенные готчи (проверено на этой машине)
- **Исходящий UDP закрыт, кроме DNS (53)** — живые A2S-запросы из этой среды невозможны. A2S-логика проверяется моком: `scripts/mock-rust-server.js` (UDP A2S_INFO/A2S_PLAYER/A2S_RULES с challenge) + `scripts/mock-steam-api.js` (HTTP Steam Web API) + `scripts/smoke-test.js`. На машине с открытым UDP сервер будет работать с реальными серверами без изменений кода.
- **Steam master-сервер (hl2master.steampowered.com) выведен Valve из эксплуатации** (NXDOMAIN). Живые IP серверов брать из каталога `api.gamemonitoring.net/servers?game=252490` (см. find-servers).
- **gamedig v5**: опции называются `maxRetries`/`socketTimeout`/`attemptTimeout` (НЕ maxAttempts), передавать `givenPortOnly: true`. gamedig НЕ парсит SteamID игроков (A2S_PLAYER их не содержит — стандартный формат: index+name+score+duration), поэтому матчинг по нику (`matchedBy: 'nickname'`); поле `steamid` в парсере оставлено как защитный фоллбэк (`p.raw?.steamid`).
- **mongodb-memory-server** остаётся как последний fallback. Основной локальный режим: db.js **сам спавнит персистентный mongod** (бинарник из кэша `~/.cache/mongodb-binaries`, данные в `backend/.mongo-data`) — данные и сессии переживают перезапуски локально.
- **Сессии входа** хранятся в MongoDB (`connect-mongo`, пересоздаются из mongoose-клиента в app.js), кука на 30 дней. На хостинге это обязательное условие — иначе разлогинивает при каждом перезапуске/засыпании.
- **Деплой**: чек-лист в `DEPLOY.md` (Atlas + Render/Vercel или Oracle VPS одним процессом — бэкенд умеет раздавать `frontend/dist`). `NODE_ENV=production` отключает dev-вход и in-memory fallback.
- При правках trackerService: in-memory документы игроков используются и после A2S-скана (pollSteam читает `p.currentServer`) — при сбросе состояния обновлять и БД, и документ (см. фикс в scanAllServers).


## Окружение и готчи
- **Платформа: Windows (win32), shell — Git Bash.** Все команды и пути должны работать в этой среде.
- Секреты только через env: `STEAM_API_KEY`, `MONGO_URI`, `SESSION_SECRET` (+ пример `.env.example`). Не коммитить ключи.
- Фронтенд и бэкенд — разные порты в dev: настроить CORS и прокси Vite на API.
- Steam Web API имеет лимиты запросов: интервал опроса и батчинг SteamID учитывать заранее.
- A2S — UDP: возможны таймауты/потеря пакетов, у запросов должны быть таймауты и ретраи.
- Rust AppID всегда `252490` — не перепутать с другими играми.
