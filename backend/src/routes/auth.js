import fs from 'node:fs';
import { Router } from 'express';
import passport from 'passport';
import env from '../config/env.js';
import { steamAuthEnabled } from '../config/passport.js';
import User from '../models/User.js';
import { getPlayerSummaries } from '../services/steamApiService.js';

const router = Router();
const LOG = 'auth-debug.log';

function debugLog(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' | ')}`;
  console.log('[auth]', ...parts);
  try {
    fs.appendFileSync(LOG, line + '\n');
  } catch {
    /* файл недоступен — не критично */
  }
}

/**
 * Ручная проверка OpenID-подписи (check_authentication) современным fetch —
 * страховка на случай капризов древнего openid-пакета внутри passport-steam.
 * Steam подтверждает подпись ответом "is_valid:true".
 */
async function manualOpenIdVerify(query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, x));
    else if (v != null) params.append(k, String(v));
  }
  params.set('openid.mode', 'check_authentication');
  const res = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const isValid = /is_valid\s*:\s*true/i.test(text);
  const claimed = String(query['openid.claimed_id'] || '');
  const steamId64 = (claimed.match(/(7656\d{13})$/) || [])[1] || null;
  return { isValid, steamId64, snippet: text.slice(0, 300) };
}

async function finishLogin(req, res, steamId64) {
  // подтягиваем анкету для ника/аватара
  let username = '';
  let avatar = '';
  let profileUrl = '';
  try {
    const [summary] = await getPlayerSummaries([steamId64]);
    if (summary) {
      username = summary.nickname || '';
      avatar = summary.avatar || '';
      profileUrl = summary.profileUrl || '';
    }
  } catch (e) {
    debugLog('summary fetch failed', e.message);
  }

  const user = await User.findOneAndUpdate(
    { steamId64 },
    { steamId64, username, avatar, profileUrl },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await new Promise((resolve) => {
    req.login(user, () => resolve());
  });
  debugLog('LOGIN OK', 'user=' + steamId64 + ' ' + username);
  res.redirect(`${env.clientOrigin}/dashboard?auth=ok`);
}

/** GET /api/auth/steam — редирект на Steam OpenID. */
router.get('/steam', (req, res, next) => {
  if (!steamAuthEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'STEAM_API_KEY не настроен — Steam-вход недоступен',
    });
  }
  debugLog('start auth', 'ip=' + req.ip);
  passport.authenticate('steam')(req, res, next);
});

/** GET /api/auth/steam/return — коллбек OpenID с подробной диагностикой + фоллбэк-верификация. */
router.get('/steam/return', async (req, res, next) => {
  if (!steamAuthEnabled()) {
    return res.status(503).json({ success: false, error: 'STEAM_API_KEY не настроен' });
  }
  debugLog('return from steam', 'keys=' + Object.keys(req.query).join(','));

  const fail = (reason) => {
    debugLog('LOGIN FAILED', 'reason=' + reason);
    res.redirect(`${env.clientOrigin}/?auth=failed&reason=` + encodeURIComponent(reason));
  };

  passport.authenticate('steam', async (err, user, info) => {
    if (err) debugLog('passport error', err && (err.stack || err.message || String(err)));
    if (!err && user) {
      try {
        return await finishLogin(req, res, user.steamId64);
      } catch (e) {
        debugLog('finishLogin threw', e.stack || e.message);
        return fail('finish-error');
      }
    }

    // фоллбэк: проверяем подпись Steam вручную
    try {
      const manual = await manualOpenIdVerify(req.query);
      debugLog(
        'manual verify',
        'valid=' + manual.isValid,
        'steamid=' + (manual.steamId64 || 'null'),
        'steam said: ' + manual.snippet.replace(/\s+/g, ' ').slice(0, 160)
      );
      if (manual.isValid && manual.steamId64) {
        return await finishLogin(req, res, manual.steamId64);
      }
      return fail(manual.isValid ? 'no-steamid' : 'verify-failed');
    } catch (e) {
      debugLog('manual verify threw', e.stack || e.message);
      return fail('manual-verify-error');
    }
  })(req, res, next);
});

/** GET /api/auth/me — текущий пользователь (+ краткий watchlist). */
router.get('/me', async (req, res, next) => {  try {
    debugLog('me check', 'cookie=' + (req.headers.cookie || 'НЕТ'), 'auth=' + Boolean(req.user));
    if (req.user) await req.user.populate('watchlist');
    res.json({
      success: true,
      authenticated: Boolean(req.user),
      data: req.user
        ? {
            ...req.user.toPublic(),
            watchlist: (req.user.watchlist || []).map((p) => ({
              steamId64: p.steamId64,
              nickname: p.nickname,
            })),
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/** ВРЕМЕННЫЙ dev-вход (NODE_ENV !== 'production') — для проверки личных watchlist-ов без Steam. */
router.get('/_dev-login', async (req, res, next) => {
  try {
    if (env.nodeEnv === 'production') {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const user = await User.findOneAndUpdate(
      { steamId64: '76561198000000099' },
      { steamId64: '76561198000000099', username: 'Dev Tester', avatar: '', profileUrl: '' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await new Promise((resolve) => req.login(user, () => resolve()));
    res.json({ success: true, data: user.toPublic() });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/logout */
router.post('/logout', (req, res) => {
  req.logout(() => res.json({ success: true }));
});

export default router;
