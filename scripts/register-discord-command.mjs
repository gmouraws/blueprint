// Local one-off registration. Never persist or print credentials/provider bodies.
import { pathToFileURL } from 'node:url';
export async function registerDiscordCommand(env = process.env, request = fetch) {
  for (const name of ['DISCORD_APPLICATION_ID', 'DISCORD_GUILD_ID']) if (!/^\d{17,20}$/.test(env[name] ?? '')) throw Error(`Missing or invalid ${name}`);
  if (!env.DISCORD_BOT_TOKEN?.trim() || /\s/.test(env.DISCORD_BOT_TOKEN)) throw Error('Missing or invalid DISCORD_BOT_TOKEN');
  const result = await request(`https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/guilds/${env.DISCORD_GUILD_ID}/commands`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 1, name: 'blueprint', description: 'Abrir o espaço privado de transmissão do Blueprint', options: [] }) });
  if (!result.ok) throw Error(`Discord registration failed (HTTP ${result.status})`);
  const command = await result.json();
  if (command.name !== 'blueprint' || command.type !== 1 || command.application_id !== env.DISCORD_APPLICATION_ID || command.guild_id !== env.DISCORD_GUILD_ID) throw Error('Unexpected Discord command response');
  return { registered: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  registerDiscordCommand().then(() => console.log('Guild /blueprint registered. Unrelated commands were not modified.')).catch(error => { console.error(error.message?.startsWith('Missing or invalid ') || error.message?.startsWith('Discord registration failed (HTTP ') ? error.message : 'Discord registration failed; check configuration and network.'); process.exitCode = 1; });
}
