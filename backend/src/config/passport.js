import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';
import User from '../models/User.js';
import env from './env.js';

export function configurePassport() {
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    try {
      done(null, await User.findById(id));
    } catch (err) {
      done(err);
    }
  });

  passport.use(
    'steam',
    new SteamStrategy(
      {
        returnURL: `${env.appUrl}/api/auth/steam/return`,
        realm: env.appUrl,
        apiKey: env.steamApiKey,
      },
      async (identifier, profile, done) => {
        try {
          const steamId64 = profile.id;
          const user = await User.findOneAndUpdate(
            { steamId64 },
            {
              steamId64,
              username: profile.displayName || '',
              avatar:
                profile.photos?.[2]?.value || profile.photos?.[0]?.value || '',
              profileUrl: profile._json?.profileurl || '',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );

  return passport;
}

export const steamAuthEnabled = () => Boolean(env.steamApiKey);
