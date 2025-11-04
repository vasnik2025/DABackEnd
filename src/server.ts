// FIX: Removed reference to "node" types and declared process to resolve build error.
declare var process: any;

declare const require: any;

try {
  require('dotenv/config');
} catch (error) {
  if (process?.env?.NODE_ENV !== 'production') {
    console.warn('[startup] dotenv/config module not found; continuing without .env file support.');
  }
}
import app from './app';
import { getPool } from './config/db';
import { verifyMailConnections } from './utils/emailService';
import { scheduleMembershipMaintenance } from './jobs/membershipMaintenance';
import { scheduleFakePresenceRotation } from './jobs/fakePresenceRotation';

const PORT = Number(process.env.PORT || 8080);

async function start() {
  try {
    console.log('[startup] Connecting to database...');
    await getPool();
    console.log('[startup] Database connected.');

    console.log('[startup] Verifying email service connection...');
    const mailOK = await verifyMailConnections();
    if (mailOK) {
      console.log('[startup] Email service is configured and ready.');
    } else {
      console.warn('[startup] Email service is NOT configured. Emails will not be sent.');
    }


    scheduleMembershipMaintenance();
    console.log('[startup] Membership maintenance scheduler initialised.');
    scheduleFakePresenceRotation();
    console.log('[startup] Fake presence rotation scheduler initialised.');

    app.listen(PORT, () => console.log(`[startup] API listening on :${PORT}`));
  } catch (e) {
    console.error('[startup] Failed to start server:', e);
    (process as any).exit(1);
  }
}

start();






