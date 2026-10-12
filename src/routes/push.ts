import { Router, Request, Response } from 'express'
import { messaging } from '../utils/firebase'
import { requireAuth } from '../middleware/auth'
import pool from '../db/pool'
import { ResultSetHeader, RowDataPacket } from 'mysql2'

const router = Router()

// ── Ensure push_token table exists ────────────────────────────────────────────
// (also called from migrate.ts — kept here for reference)
//
//   CREATE TABLE IF NOT EXISTS push_token (
//     id        INT AUTO_INCREMENT PRIMARY KEY,
//     userId    INT          NOT NULL,
//     token     VARCHAR(512) NOT NULL,
//     UNIQUE KEY uq_token (token),
//     FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
//   );

// ─────────────────────────────────────────────────────────────────────────────
// POST /push/register
// Body: { token: string }
// Saves the FCM token and subscribes it to the daily-reminder topic.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/register', requireAuth, async (req: Request | any, res: Response) => {
   console.log('registering ton notification ----------------')
  const { token } = req.body as { token?: string }
  if (!token) { res.status(400).json({ message: 'token requis.' }); return }

  const userId = req.user.sub

  try {
    // Upsert — ignore duplicate tokens
    await pool.execute<ResultSetHeader>(
      `INSERT INTO push_token (userId, token)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE userId = VALUES(userId)`,
      [userId, token]
    )

    // Subscribe to the daily-reminder FCM topic
    await messaging.subscribeToTopic([token], 'daily-reminder')

    res.json({ ok: true })
  } catch (err) {
    console.error('[Push] Register error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /push/unregister
// Body: { token: string }
// Removes the token and unsubscribes from the topic.
// ─────────────────────────────────────────────────────────────────────────────

router.post('/unregister', requireAuth, async (req: Request | any, res: Response) => {
  const { token } = req.body as { token?: string }
  if (!token) { res.status(400).json({ message: 'token requis.' }); return }

  const userId = req.user.sub

  try {
    await pool.execute(
      'DELETE FROM push_token WHERE userId = ? AND token = ?',
      [userId, token]
    )

    // Unsubscribe from topic
    await messaging.unsubscribeFromTopic([token], 'daily-reminder')

    res.json({ ok: true })
  } catch (err) {
    console.error('[Push] Unregister error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /push/send/:userId  (superAdmin only — for testing)
// Body: { title, body }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/send/:userId', requireAuth, async (req: Request | any, res: Response) => {
  if (req.user.type !== 'superAdmin') {
    res.status(403).json({ message: 'Accès refusé.' }); return
  }

  const { title, body } = req.body as { title?: string; body?: string }
  const targetUserId    = Number(req.params.userId)

  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT token FROM push_token WHERE userId = ?',
      [targetUserId]
    )
    if (!rows.length) { res.status(404).json({ message: 'Aucun token pour cet utilisateur.' }); return }

    const tokens = rows.map((r: any) => r.token as string)

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      android: { priority: 'high', notification: { channelId: 'stockware_reminders' } },
    })

    res.json({ ok: true, successCount: response.successCount, failureCount: response.failureCount })
  } catch (err) {
    console.error('[Push] Send error:', err)
    res.status(500).json({ message: 'Erreur serveur.' })
  }
})

export default router