import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import passport from '../config/passport'
import UserModel, { User } from '../models/UserModel'
import { signToken } from '../utils/jwt'
import { requireAuth } from '../middleware/auth'
import { OAuth2Client } from 'google-auth-library'
import pool from '../db/pool'
import { RowDataPacket, ResultSetHeader } from 'mysql2'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth – Mobile (Capacitor plugin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /auth/google/mobile
 *
 * Supports three authentication modes:
 *
 *  1. Email + password bypass
 *     Body: { email, password }
 *     Looks up the user by email and validates the bcrypt password.
 *     Works for any user who has a password set in the DB.
 *
 *  2. Demo account bypass (no password needed)
 *     Body: { email: 'lobjectiviste@gmail.com' }
 *     Skips all verification — for Google Play reviewer access.
 *
 *  3. Native Google Sign-In
 *     Body: { idToken } or { serverAuthCode }
 *     Verifies the token with Google's SDK.
 */
router.post('/google/mobile', async (req: Request, res: Response) => {
  const {
    idToken,
    serverAuthCode,
    email:    bodyEmail,
    password: bodyPassword,
  } = req.body as {
    idToken?:        string
    serverAuthCode?: string
    email?:          string
    password?:       string
  }

  // ── Mode 1: Email + password login ────────────────────────────────────────
  if (bodyEmail && bodyPassword) {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM user WHERE email = ? LIMIT 1',
        [bodyEmail]
      )
      const user = rows[0] as User | undefined

      if (!user || !user.password) {
        res.status(401).json({ message: 'Email ou mot de passe incorrect.' })
        return
      }

      const valid = await bcrypt.compare(bodyPassword, user.password)
      if (!valid) {
        res.status(401).json({ message: 'Email ou mot de passe incorrect.' })
        return
      }

      const token = signToken(user)
      res.json({ token, user: UserModel.sanitize(user) })
    } catch (err) {
      console.error('Email/password login error:', err)
      res.status(500).json({ message: 'Erreur serveur.' })
    }
    return
  }

  // ── Mode 2: Demo account bypass (email only, no password) ─────────────────
  /* if (bodyEmail === 'lobjectiviste@gmail.com') {
    try {
      const user  = await UserModel.upsertGoogleUser({
        name:  'Demo Account',
        email: 'lobjectiviste@gmail.com',
      })
      const token = signToken(user)
      res.json({ token, user: UserModel.sanitize(user) })
    } catch (err) {
      console.error('Demo bypass error:', err)
      res.status(500).json({ message: 'Erreur compte démo.' })
    }
    return
  } */

  // ── Mode 3: Native Google Sign-In (idToken or serverAuthCode) ─────────────
  if (!idToken && !serverAuthCode) {
    res.status(400).json({
      message: 'idToken, serverAuthCode, ou email+password requis.',
    })
    return
  }

  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage'
    )

    let email: string
    let name:  string

    if (serverAuthCode) {
      const { tokens } = await client.getToken(serverAuthCode)
      if (!tokens.id_token) throw new Error('No id_token in exchange response')

      const ticket  = await client.verifyIdToken({
        idToken:  tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID!,
      })
      const payload = ticket.getPayload()!
      email = payload.email!
      name  = payload.name || email
    } else {
      const ticket  = await client.verifyIdToken({
        idToken:  idToken!,
        audience: process.env.GOOGLE_CLIENT_ID!,
      })
      const payload = ticket.getPayload()!
      email = payload.email!
      name  = payload.name || email
    }

    const user  = await UserModel.upsertGoogleUser({ name, email })
    const token = signToken(user)
    res.json({ token, user: UserModel.sanitize(user) })
  } catch (err) {
    console.error('Mobile Google auth error:', err)
    res.status(401).json({ message: 'Authentification Google invalide.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Google OAuth – Web (browser redirect flow)
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
)

router.get(
  '/google/callback',
  passport.authenticate('google', {
    session:         false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google`,
  }),
  (req: Request, res: Response) => {
    const user  = req.user as User
    const token = signToken(user)
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?token=${token}&shopId=${user.shopId}&premiumExpireAt=${user.premiumExpireAt}`
    )
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// Email / Password login (casher — web login page)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    res.status(400).json({ message: 'Email et mot de passe requis.' })
    return
  }

  const user = await UserModel.findByEmail(email)
  if (!user || !user.password) {
    res.status(401).json({ message: 'Email ou mot de passe incorrect.' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ message: 'Email ou mot de passe incorrect.' })
    return
  }

  const token = signToken(user)
  res.json({ token, user: UserModel.sanitize(user) })
})

// ─────────────────────────────────────────────────────────────────────────────
// Register (casher self-registration)
// ─────────────────────────────────────────────────────────────────────────────

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
    type:     'casher',
    shopId:   null,
  })

  const user  = await UserModel.findById(id)
  const token = signToken(user!)
  res.status(201).json({ token, user: UserModel.sanitize(user!) })
})

// ─────────────────────────────────────────────────────────────────────────────
// Change password (authenticated)
// PATCH /auth/password
// Body: { currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/password', requireAuth, async (req: Request | any, res: Response) => {
  let { currentPassword, newPassword } = req.body as {
    currentPassword?: string
    newPassword?:     string
  }

  if (!currentPassword ) currentPassword = ''

  if (!newPassword) {
    res.status(400).json({ message: 'Nouveau mot de passe requis.' })
    return
  }
  if (newPassword.length < 6) {
    res.status(400).json({ message: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' })
    return
  }

  try {
    const user = await UserModel.findById(req.user.sub)
    if (!user) { res.status(404).json({ message: 'Utilisateur introuvable.' }); return }

    // If user already has a password, verify current one first
    if (user.password) {
      const valid = await bcrypt.compare(currentPassword, user.password)
      if (!valid) {
        res.status(401).json({ message: 'Mot de passe actuel incorrect.' })
        return
      }
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await pool.execute<ResultSetHeader>(
      'UPDATE user SET password = ? WHERE id = ?',
      [hashed, req.user.sub]
    )

    res.json({ ok: true, message: 'Mot de passe mis à jour.' })
  } catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Me (token introspection)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req: Request | any, res: Response) => {
  const user = await UserModel.findById(req.user!.sub)
  if (!user) { res.status(404).json({ message: 'Utilisateur introuvable.' }); return }
  res.json({ user: UserModel.sanitize(user) })
})

export default router