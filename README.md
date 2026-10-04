# 🎯 RUST RADAR — система слежки за врагами в Rust

Веб-сервис мониторинга активности игроков в Rust (AppID 252490) — аналог
Battlemetrics + Steam Tracker. Следит за «врагами» по SteamID64 и в реальном
времени сообщает: зашёл ли игрок в Rust, на каком именно сервере он сидит и
когда его сменил.

![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![React](https://img.shields.io/badge/React-18-blue)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-brightgreen)

## ✨ Возможности

- 🔍 **Поиск игроков** по SteamID64 / ссылке на профиль (vanity-URL резолвится через Steam API)
- 👁 **Кнопка «Отслеживать»** — слежка не включается автоматически, только по решению пользователя
- 🟢 **Три метода слежки, объединённых в один цикл:**
  1. Steam Web API (`GetPlayerSummaries`) — онлайн в Steam и запущена ли Rust
  2. A2S-протокол (gamedig) — опрос игровых серверов по UDP
  3. `gameserverip` — Steam сам сообщает сервер игрока; название резолвится из
     мастер-листа (`GetServerList` + `GetServersAtAddress`) — работает даже без UDP
- ⚡ **Реальное время**: события пушатся на сайт по SSE; адаптивный опрос — 20с,
  пока кто-то из целей в игре, 60с в остальное время
- 🔔 **Уведомления**: тосты + звук на сайте и Telegram-бот — с персональными
  настройками на каждого врага (вход / выход / смена сервера / звук)
- 📊 **История сессий**: время захода/выхода, длительность, графики активности (Recharts)
- 🔐 **Вход через Steam OpenID**, личный watchlist у каждого пользователя
- 🗄 MongoDB: игроки, сессии, watchlist, настройки; сессии логина тоже в базе (переживают перезапуски)
- 🎨 Тёмный «тактический» UI: стекло, неон, анимации (Framer Motion + Animate.css)

## 🛠 Стек

| Слой | Технологии |
|---|---|
| Бэкенд | Node.js, Express, Mongoose, passport-steam, gamedig, connect-mongo |
| Фронтенд | React 18 (Vite), Tailwind CSS v4, Framer Motion, Lucide, Recharts |
| База | MongoDB (локальная / Atlas) |
| Интеграции | Steam Web API, Steam OpenID, Telegram Bot API, A2S (UDP) |

## 📁 Структура

```
/backend   Express API: routes → controllers → services
           services: steamApiService, a2sScanner, serverNameService,
                     trackerService (цикл опроса), telegramService, notifyService
/frontend  React SPA: AuthGate (лендинг ⇄ дашборд), карточки игроков,
           радар-виджет, графики, тосты, панель серверов
/scripts   Моки Steam API и A2S-сервера + smoke-тест (49 проверок)
```

## 🚀 Запуск локально

```bash
# 1. База данных не обязательна — dev-режим сам поднимет локальный mongod
# 2. Бэкенд
cd backend
npm install
cp .env.example .env      # вписать STEAM_API_KEY (https://steamcommunity.com/dev/apikey)
npm run dev               # http://localhost:3001

# 3. Фронтенд
cd ../frontend
npm install
npm run dev               # http://localhost:5173
```

Без Steam-ключа работает демо-режим с моками:

```bash
cd backend && npm run demo   # фейковый Steam + фейковый сервер + 3 тестовых врага
```

## 🧪 Тесты

```bash
cd backend && npm run smoke   # e2e: 49 проверок на моках (Steam API + A2S-сервер)
```

## 🌐 Деплой

Инструкция — в [DEPLOY.md](DEPLOY.md): MongoDB Atlas + Render/Vercel или
Oracle Cloud VPS (один процесс, работает A2S).

## 📌 Примечания

- Steam Web API отдаёт статус игры публично; `gameserverip` доступен не для всех
  профилей — для 100% покрытия серверов нужен VPS с открытым UDP.
- Секреты только через `.env` (в git не попадают).
