import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/passport'           // register Google strategy
import authRouter from './routes/auth'

const app  = express()
const PORT = Number(process.env.PORT) || 3000

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// ── 404 ──────────────────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ message: 'Route introuvable.' }))

// ── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ message: 'Erreur interne du serveur.' })
})

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀  Auth server running on http://localhost:${PORT}`)
})

export default app
