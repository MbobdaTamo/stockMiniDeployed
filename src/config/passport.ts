import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import UserModel from '../models/UserModel'

passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error('No email from Google profile'), undefined)

        const name = profile.displayName || profile.emails?.[0]?.value || 'Admin'
        const user = await UserModel.upsertGoogleUser({ name, email })

        done(null, user)
      } catch (err) {
        done(err as Error, undefined)
      }
    }
  )
)

// We don't use sessions — passport just needs these stubs
passport.serializeUser((user: any, done) => done(null, user))
passport.deserializeUser((user: any, done) => done(null, user))

export default passport
