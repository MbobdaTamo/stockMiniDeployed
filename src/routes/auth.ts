import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import passport from '../config/passport'
import UserModel, { User } from '../models/UserModel'
import { signToken } from '../utils/jwt'
import { requireAuth } from '../middleware/auth'
import { OAuth2Client } from 'google-auth-library'

const router = Router()

// ─── Google OAuth ──────────────────────────────────────────────────────────
// ─── Google OAuth – Mobile (Capacitor plugin) ──────────────────────────────

/**
 * POST /auth/google/mobile
 * Called by the Capacitor @capawesome/capacitor-google-sign-in plugin.
 * Body: { idToken } or { serverAuthCode }
 */
router.post('/google/mobile', async (req: Request, res: Response) => {
  const { idToken, serverAuthCode } = req.body as {
    idToken?: string
    serverAuthCode?: string
  }

  if (!idToken && !serverAuthCode) {
    res.status(400).json({ message: 'idToken ou serverAuthCode requis.' })
    return
  }

  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage' // required for mobile serverAuthCode exchange
    )

    let email: string
    let name: string

    if (serverAuthCode) {
      // Exchange serverAuthCode → get tokens from Google
      const { tokens } = await client.getToken(serverAuthCode)
      if (!tokens.id_token) throw new Error('No id_token in exchange response')

      const ticket = await client.verifyIdToken({
        idToken:  tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID!,
      })
      const payload = ticket.getPayload()!
      email = payload.email!
      name  = payload.name || email
    } else {
      // Verify idToken directly (simpler, slightly less secure)
      const ticket = await client.verifyIdToken({
        idToken:  idToken!,
        audience: process.env.GOOGLE_CLIENT_ID!,
      })
      const payload = ticket.getPayload()!
      email = payload.email!
      name  = payload.name || email
    }

    // Reuse your existing upsert logic — same as passport.ts
    const user  = await UserModel.upsertGoogleUser({ name, email })
    const token = signToken(user)

    res.json({ token, user: UserModel.sanitize(user) })
  } catch (err) {
    console.error('Mobile Google auth error:', err)
    res.status(401).json({ message: 'Authentification Google invalide.' })
  }
})


/**
 * GET /auth/google
 * Redirects the browser to Google's consent screen.
 * The frontend calls: window.location.href = `${API}/auth/google`
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
)

/**
 * GET /auth/google/callback
 * Google redirects here after the user consents.
 * We sign a JWT and redirect to the frontend with it in the query string
 * (the frontend stores it in localStorage and removes it from the URL).
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?error=google` }),
  (req: Request, res: Response) => {
    const user  = req.user as User
    const token = signToken(user)
    // Redirect to frontend — token in query param, frontend grabs and stores it
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&shopId=${user.shopId}&premiumExpireAt=${user.premiumExpireAt}`)
  }
)

// ─── Email / Password login (casher) ──────────────────────────────────────

/**
 * POST /auth/login
 * Body: { email, password }
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    res.status(400).json({ message: 'Email et mot de passe requis.' })
    return
  }

  const user = await UserModel.findByEmail(email)
  if (!user || !user.password) {
    res.status(401).json({ message: '11Email ou mot de passe incorrect.' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ message: '1Email ou mot de passe incorrect.' })
    return
  }

  const token = signToken(user)
  res.json({ token, user: UserModel.sanitize(user) })
})

// ─── Register (casher self-registration) ──────────────────────────────────

/**
 * POST /auth/register
 * Body: { name, login, email, password, type? }
 * Only creates 'casher' accounts — admin creation requires an existing admin token.
 */
router.post('/register', async (req: Request, res: Response) => {
  const { name, login, email, password } = req.body as {
    name?: string; login?: string; email?: string; password?: string
  }

  if (!name || !login || !email || !password) {
    res.status(400).json({ message: 'Tous les champs sont requis.' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères.' })
    return
  }

  const existingEmail = await UserModel.findByEmail(email)
  if (existingEmail) {
    res.status(409).json({ message: 'Cet email est déjà utilisé.' })
    return
  }

  const existingLogin = await UserModel.findByLogin(login)
  if (existingLogin) {
    res.status(409).json({ message: 'Cet identifiant est déjà utilisé.' })
    return
  }

  const hashed = await bcrypt.hash(password, 12)
  const id     = await UserModel.create({
    name,
    login,
    email,
    password: hashed,
    type:     'casher',  // self-registration is always casher
    shopId:   null,
  })

  const user  = await UserModel.findById(id)
  const token = signToken(user!)
  res.status(201).json({ token, user: UserModel.sanitize(user!) })
})

// ─── Me (token introspection) ──────────────────────────────────────────────

/**
 * GET /auth/me
 * Returns the currently authenticated user's profile.
 * Requires: Authorization: Bearer <token>
 */
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.sub)
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable.' }); return }
  res.json({ user: UserModel.sanitize(user) })
})

export default router