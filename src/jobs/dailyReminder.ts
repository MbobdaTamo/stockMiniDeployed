import cron    from 'node-cron'
import { messaging } from '../utils/firebase'

// ── Send to a FCM topic ───────────────────────────────────────────────────────

async function sendReminder(hour: string): Promise<void> {
  const isEvening = hour === '18'
  try {
    const response = await messaging.send({
      topic: 'daily-reminder',
      notification: {
        title: isEvening ? '📊 Récapitulatif du jour' : '☀️ Bonne journée !',
        body:  isEvening
          ? 'Pensez à enregistrer vos transactions du jour dans Easycaisse.'
          : 'Commencez la journée en consultant votre solde de caisse.',
      },
      data: {
        type: 'daily_reminder',
        hour,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'stockware_reminders',
        },
      },
    })
    console.log(`[FCM] Daily reminder (${hour}h) sent:`, response)
  } catch (e) {
    console.error(`[FCM] Daily reminder (${hour}h) error:`, e)
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export function startDailyReminderJob(): void {
  // 9:00 AM — morning reminder
  cron.schedule('0 9 * * *', () => sendReminder('9'), {
    timezone: 'Africa/Douala',
  })

  // 6:00 PM — evening recap
  cron.schedule('0 18 * * *', () => sendReminder('18'), {
    timezone: 'Africa/Douala',
  })

  console.log('[Cron] Daily reminder jobs scheduled (9AM / 6PM Africa/Douala)')
}