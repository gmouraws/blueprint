// Local one-off registration. Never persist or print credentials/provider bodies.
import { pathToFileURL } from 'node:url';
class RegistrationError extends Error {}
// Never render arbitrary provider text: even an error body can contain credentials.
const discordMessages = new Map([
  [10002, 'Unknown application'], [10004, 'Unknown guild'],
  [20012, 'Not authorized for this application'], [50001, 'Missing access'],
  [50013, 'Missing permissions'], [50035, 'Invalid form body'],
]);
function networkCategory(error) {
  const errors = [error]; const codes = new Set();
  for (let i = 0; i < errors.length && i < 12; i++) {
    const item = errors[i]; if (!item || typeof item !== 'object') continue;
    codes.add(item.code); codes.add(item.name);
    if (item.cause) errors.push(item.cause);
    if (Array.isArray(item.errors)) errors.push(...item.errors.slice(0, 8));
  }
  if (['TimeoutError', 'AbortError', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].some(code => codes.has(code))) return 'timeout';
  if (['ENOTFOUND', 'EAI_AGAIN'].some(code => codes.has(code))) return 'DNS resolution';
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].some(code => codes.has(code))) return 'TLS certificate validation';
  if (['ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET'].some(code => codes.has(code))) return 'connection failure';
  return 'network/transport failure';
}
export function registrationDiagnostic(error) {
  return error instanceof RegistrationError ? error.message : 'Discord registration failed: unexpected local error (details withheld).';
}
export async function registerDiscordCommand(env = process.env, request = fetch) {
  for (const name of ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID']) if (!/^\d{17,20}$/.test(env[name] ?? '')) throw new RegistrationError(`Missing or invalid ${name}`);
  if (!env.DISCORD_BOT_TOKEN?.trim() || /\s/.test(env.DISCORD_BOT_TOKEN)) throw new RegistrationError('Missing or invalid DISCORD_BOT_TOKEN');
  let result;
  try {
    result = await request(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 1, name: 'blueprint', description: 'Abrir o espaço privado de transmissão do Blueprint', options: [] }) });
  } catch (error) { throw new RegistrationError(`Discord registration failed: ${networkCategory(error)} (no HTTP response).`); }
  let command;
  try { command = await result.json(); }
  catch (error) { throw new RegistrationError(`Discord registration failed (HTTP ${result.status}): ${error instanceof SyntaxError ? 'non-JSON response' : networkCategory(error) + ' reading response'}.`); }
  if (!result.ok) {
    const code = Number.isSafeInteger(command?.code) && command.code >= 0 ? command.code : null;
    const knownMessage = discordMessages.get(code);
    throw new RegistrationError(`Discord registration failed (HTTP ${result.status}, Discord code ${code ?? 'unavailable'}): ${knownMessage ?? 'provider message withheld'}.`);
  }
  if (command?.name !== 'blueprint' || command.type !== 1 || command.application_id !== env.DISCORD_APPLICATION_ID || command.guild_id !== env.DISCORD_GUILD_ID) throw new RegistrationError(`Discord registration failed (HTTP ${result.status}): unexpected command identity; registration not confirmed.`);
  return { registered: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerDiscordCommand().then(() => console.log('Guild /blueprint registered. Unrelated commands were not modified.')).catch(error => { console.error(registrationDiagnostic(error)); process.exitCode = 1; });
}
