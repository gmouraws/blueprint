import { cleanChat } from '../src/lib/server/chat-store';
try { await cleanChat(); console.log('Expired chat messages removed from the configured environment.'); }
catch { console.error('Chat cleanup failed; verify the selected environment and database configuration.'); process.exitCode = 1; }
