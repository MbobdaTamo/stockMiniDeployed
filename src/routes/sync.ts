import { Router, Request, Response } from 'express'
import fs   from 'fs'
import path from 'path'
import pool from '../db/pool'
import { RowDataPacket } from 'mysql2'
import { requireAuth } from '../middleware/auth'

const router = Router()

// ── Helper: fetch premiumExpireAt for the current user ────────────────────────

async function getPremiumExpireAt(userId: number): Promise<string | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT premiumExpireAt FROM user WHERE id = ? LIMIT 1',
    [userId]
  )
  const row = rows[0]
  if (!row?.premiumExpireAt) return null
  // Return as ISO string
  return new Date(row.premiumExpireAt).toISOString()
}

// ── POST /sync/push ────────────────────────────────────────────────────────────
// Receives the full Dexie export JSON, saves it to disk.
// Returns premiumExpireAt so the frontend can check subscription status.

router.post('/push', requireAuth, async (req: Request | any, res: Response) => {
  try {
    const DB_PATH = path.resolve(process.cwd(), 'data', req.user.shopId)
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

    const payload = JSON.stringify(req.body)
    fs.writeFileSync(DB_PATH, payload, 'utf-8')

    // Fetch premium status to piggyback on the sync response
    const premiumExpireAt = await getPremiumExpireAt(req.user.sub)

    res.json({
      ok:              true,
      savedAt:         new Date().toISOString(),
      sizeKB:          Math.round(Buffer.byteLength(payload) / 1024),
      premiumExpireAt
    })
  } catch (err) {
    console.error('[Sync] Push error:', err)
    res.status(500).json({ ok: false, error: 'Failed to save backup' })
  }
})

// ── GET /sync/pull ─────────────────────────────────────────────────────────────
// Returns the last saved JSON so the client can restore its IndexedDB.

router.get('/pull', requireAuth, (req: Request | any, res: Response) => {
  const DB_PATH = path.resolve(process.cwd(), 'data', req.user.shopId)
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

  if (!fs.existsSync(DB_PATH)) {
    return res.status(404).json({ ok: false, error: 'No backup found' })
  }

  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8')
    res.setHeader('Content-Type', 'application/json')
    res.send(data)
  } catch (err) {
    console.error('[Sync] Pull error:', err)
    res.status(500).json({ ok: false, error: 'Failed to read backup' })
  }
})

export default router