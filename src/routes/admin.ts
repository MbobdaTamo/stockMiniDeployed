import { Router, Request, Response } from 'express'
import path from 'path'
import fs   from 'fs'
import pool from '../db/pool'
import { RowDataPacket, ResultSetHeader } from 'mysql2'
import { requireAuth } from '../middleware/auth'

const router = Router()

// ─────────────────────────────────────────────────────────────────────────────
// Guard: superAdmin only
// ─────────────────────────────────────────────────────────────────────────────

function requireSuperAdmin(req: Request | any, res: Response, next: Function) {
  requireAuth(req, res, () => {
    if (req.user?.type !== 'superAdmin') {
      res.status(403).json({ message: 'Accès réservé aux super-administrateurs.' })
      return
    }
    next()
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/version
// Public — returns the content of version.json
// ─────────────────────────────────────────────────────────────────────────────

router.get('/version', (_req: Request, res: Response) => {
  try {
    const versionPath = path.resolve(process.cwd(), 'version.json')
    const content     = fs.readFileSync(versionPath, 'utf-8')
    res.json(JSON.parse(content))
  } catch {
    res.status(500).json({ message: 'Version file not found.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/users
// Returns all users with their DB size on disk
// ─────────────────────────────────────────────────────────────────────────────

router.get('/users', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        id, name, type, login, email, shopId,
        premiumExpireAt
      FROM user
      ORDER BY id DESC
    `)

    const DATA_DIR = path.resolve(process.cwd(), 'data')

    const users = rows.map((u: any) => {
      let dbSizeKB = null
      if (u.shopId) {
        const dbPath = path.join(DATA_DIR, String(u.shopId))
        try {
          if (fs.existsSync(dbPath)) {
            const stat = fs.statSync(dbPath)
            dbSizeKB   = Math.round(stat.size / 1024)
          }
        } catch { /* file not accessible */ }
      }
      return {
        id:              u.id,
        name:            u.name,
        type:            u.type,
        login:           u.login,
        email:           u.email,
        shopId:          u.shopId,
        premiumExpireAt: u.premiumExpireAt
                           ? new Date(u.premiumExpireAt).toISOString()
                           : null,
        isPremium:       u.premiumExpireAt
                           ? new Date(u.premiumExpireAt) > new Date()
                           : false,
        dbSizeKB
      }
    })

    res.json({ users })
  } catch (err) {
    console.error('[Admin] GET /users error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/users/:id/premium
// Update premiumExpireAt for a specific user
// Body: { premiumExpireAt: string (ISO) | null }
// ─────────────────────────────────────────────────────────────────────────────

router.patch('/users/:id/premium', requireSuperAdmin, async (req: Request, res: Response) => {
  const userId         = Number(req.params.id)
  const { premiumExpireAt } = req.body as { premiumExpireAt: string | null }

  if (isNaN(userId)) {
    res.status(400).json({ message: 'ID invalide.' })
    return
  }

  try {
    const value = premiumExpireAt
      ? new Date(premiumExpireAt).toISOString().slice(0, 19).replace('T', ' ')
      : null

    await pool.execute<ResultSetHeader>(
      'UPDATE user SET premiumExpireAt = ? WHERE id = ?',
      [value, userId]
    )

    res.json({
      ok:              true,
      userId,
      premiumExpireAt: premiumExpireAt ?? null,
      isPremium:       premiumExpireAt
                         ? new Date(premiumExpireAt) > new Date()
                         : false,
    })
  } catch (err) {
    console.error('[Admin] PATCH /users/:id/premium error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/users/:id/db
// Deletes the saved DB file for a user's shop (does NOT delete the user)
// ─────────────────────────────────────────────────────────────────────────────

router.delete('/admin/users/:id/db', requireSuperAdmin, async (req: Request, res: Response) => {
  const userId = Number(req.params.id)

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT shopId FROM user WHERE id = ? LIMIT 1', [userId]
    )
    const shopId = rows[0]?.shopId
    if (!shopId) { res.status(404).json({ message: 'Utilisateur ou boutique introuvable.' }); return }

    const dbPath = path.resolve(process.cwd(), 'data', String(shopId))
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
      res.json({ ok: true, message: 'Backup supprimé.' })
    } else {
      res.json({ ok: true, message: 'Aucun backup à supprimer.' })
    }
  } catch (err) {
    console.error('[Admin] DELETE /admin/users/:id/db error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/stats
// Global statistics
// ─────────────────────────────────────────────────────────────────────────────

router.get('/stats', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const [[totals]]   = await pool.execute<RowDataPacket[]>('SELECT COUNT(*) as total FROM user')
    const [[premiums]] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM user WHERE premiumExpireAt > NOW()'
    )
    const [[expired]]  = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM user WHERE premiumExpireAt <= NOW() OR premiumExpireAt IS NULL'
    )

    // Total disk usage
    const DATA_DIR = path.resolve(process.cwd(), 'data')
    let   totalKB  = 0
    try {
      const files = fs.readdirSync(DATA_DIR)
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(DATA_DIR, f))
          totalKB += stat.size
        } catch { /* skip */ }
      }
      totalKB = Math.round(totalKB / 1024)
    } catch { /* data dir may not exist yet */ }

    res.json({
      totalUsers:   (totals as any).total,
      premiumUsers: (premiums as any).total,
      expiredUsers: (expired as any).total,
      totalDiskKB:  totalKB,
    })
  } catch (err) {
    console.error('[Admin] GET /stats error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

export default router