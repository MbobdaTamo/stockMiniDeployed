import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/passport'           // register Google strategy
import authRouter from './routes/auth'
import syncRouter from './routes/sync'
import adminRouter from './routes/admin'
import path from 'path'
import { startDailyReminderJob } from './jobs/dailyReminder'
import pushRouter from './routes/push'


const app  = express()
const PORT = Number(process.env.PORT) || 3000

// ── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use(express.json({ limit: '10mb' }))
// Serve Vue app
app.use(express.static(path.join(__dirname, '..','public')))

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/sync', syncRouter)

app.use('/admin', adminRouter)

app.use('/push', pushRouter)
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


// Start cron after DB is ready
startDailyReminderJob()
//____________________ catching errors _________________________

process.on('uncaughtException', err => {
  console.log(`Uncaught Exception: ${err.message}`)
  //process.exit(0)
})
export default app
