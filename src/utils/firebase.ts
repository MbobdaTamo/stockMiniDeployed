import { initializeApp, cert, getApps, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { readFileSync } from 'fs'
import path from 'path'

const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, 'firebase-service-account.json'), 'utf-8')
)

let app: App

if (!getApps().length) {
  app = initializeApp({ credential: cert(serviceAccount as any) })
} else {
  app = getApps()[0]
}

export const messaging = getMessaging(app)