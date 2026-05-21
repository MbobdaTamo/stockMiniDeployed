import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import './config/passport'           // register Google strategy
import authRouter from './routes/auth'
import syncRouter from './routes/sync'
import path from 'path'

// production
import https from 'https';
import http  from 'http';
import fs from 'fs';

const app  = express()

//const PORT = Number(process.env.PORT) || 3000

// ── Middleware ───────────────────────────────────────────────────────────────
app.set('trust proxy', 1)
console.log(process.env.FRONTEND_URL)
const allowedOrigins = [
  process.env.FRONTEND_URL,        // e.g. https://app.yourdomain.com
  'capacitor://localhost',          // Capacitor Android/iOS
  'https://localhost',               // Capacitor fallback
  'http://localhost:8080',          // local dev
]
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Android WebView often sends none)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`CORS blocked origin: ${origin}`)
      callback(new Error(`CORS blocked: ${origin}`))
    }
  },
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.use(express.json({ limit: '10mb' }))
// Serve Vue app

// ── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/sync', syncRouter)

app.use(express.static(path.join(__dirname, '..','public')))
// ── 404 ──────────────────────────────────────────────────────────────────────

app.use((_req, res) => res.status(404).json({ message: 'Route introuvable.' }))

// ── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ message: 'Erreur interne du serveur.' })
})

// ── Start ─────────────────────────────────────────────────────────────────────

/* app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀  Auth server running on http://localhost:${PORT}`)
})

export default app */




// Start server

const HTTP_PORT = 3012;
const PORT = 3013;

const startServer = async () => {

  try {
    // HTTPS Server Configuration
    const keyCert = '/etc/letsencrypt/live/stockwaremini.sassayer.com/privkey.pem'
    const fullCert = '/etc/letsencrypt/live/stockwaremini.sassayer.com/fullchain.pem'
    const httpsOptions = {
      key: fs.readFileSync(keyCert),
      cert: fs.readFileSync(fullCert)
    };

    // Create HTTPS server
    const httpsServer = https.createServer(httpsOptions, app);
    
    httpsServer.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎉 Invitation Management Server (HTTPS)            ║
║                                                       ║
║   ✅ HTTPS Server running on port ${PORT}              ║
║   Environment: ${process.env.NODE_ENV || 'production'}                       ║
║                                                       ║
║   🔒 Secure: https://stockwaremini.sassayer.com                  ║
║   🏥 Health Check: https://stockwaremini.sassayer.com/health     ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
      `);
    });

    // Optional: HTTP to HTTPS redirect server
    if (process.env.ENABLE_HTTP_REDIRECT === 'true') {
      const httpApp = express();
      httpApp.use('*', (req, res) => {
        res.redirect('https://' + req.headers.host + req.url);
      });
      
      http.createServer(httpApp).listen(HTTP_PORT, () => {
        console.log(`   ↪️  HTTP redirect server on port ${HTTP_PORT}`);
      });
    }

  } catch (error:any) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    console.error('Make sure SSL certificates are available at:');
/*     console.error('  - Key:', keyCert );
    console.error('  - Cert:', fullCert); */
    process.exit(1);
  }
};

startServer();