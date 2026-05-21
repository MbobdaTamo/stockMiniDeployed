import { Router, Request, Response } from 'express'
import fs   from 'fs'
import path from 'path'
import { requireAuth } from '../middleware/auth'

const router  = Router()


// ── POST /sync/push ────────────────────────────────────────────────────────
// Receives the full Dexie export JSON and saves it to disk
router.post('/push', requireAuth, (req: Request | any, res: Response) => {
  try {
    // req.body is already the parsed JSON (via express.json())
    // but Dexie export is a big JSON string — write it as-is
    const DB_PATH = path.resolve(process.cwd(), 'data', req.user.shopId)
    // Make sure the data/ directory exists
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

    const payload = JSON.stringify(req.body)
    fs.writeFileSync(DB_PATH, payload, 'utf-8')

    res.json({
      ok:       true,
      savedAt:  new Date().toISOString(),
      sizeKB:   Math.round(Buffer.byteLength(payload) / 1024),
    })
  } catch (err) {
    console.error('[Sync] Push error:', err)
    res.status(500).json({ ok: false, error: 'Failed to save backup' })
  }
})

// ── GET /sync/pull ─────────────────────────────────────────────────────────
// Returns the last saved JSON so the client can restore its IndexedDB
router.get('/pull', requireAuth, (req: Request | any, res: Response) => {
        const DB_PATH = path.resolve(process.cwd(), 'data', req.user.shopId)
    // Make sure the data/ directory exists
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