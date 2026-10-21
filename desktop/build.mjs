import { readFile, writeFile, copyFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { build, Platform, Arch } from 'electron-builder';
import sharp from 'sharp';
const profile = process.argv.includes('--production') ? 'production' : 'preview';
const origins = { production: 'https://www.blueprint.app.br', preview: 'https://blueprint-git-codex-windows-room-gmouraws-8238s-projects.vercel.app' };
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const sourceProfile = await readFile('profile.json');
try {
await writeFile('profile.json', JSON.stringify({ name: profile, origin: origins[profile] }));
await copyFile('../src/lib/shared/keybindings.mjs', 'keybindings.mjs');
const png = await sharp(await readFile('../src/app/icon.svg')).resize(256,256).png().toBuffer();
await writeFile('icon.png', png);
// ICO embeds the existing PNG mark; no new visual identity.
const header = Buffer.alloc(22); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await writeFile('icon.ico', Buffer.concat([header,png]));
await mkdir('dist',{recursive:true});
await build({ targets: Platform.WINDOWS.createTarget('nsis', Arch.x64), config: { appId: `br.app.blueprint.room.${profile}`, productName: `Blueprint Room${profile==='preview'?' Preview':''}`, artifactName: `Blueprint-Room-${profile}-\${version}-x64-setup.\${ext}`, publish: null }, publish: 'never' });
const files = (await readdir('dist')).filter(name => name.endsWith('.exe') && name === `Blueprint-Room-${profile}-${version}-x64-setup.exe`);
await writeFile(`dist/SHA256SUMS-${profile}.txt`, (await Promise.all(files.map(async name => `${createHash('sha256').update(await readFile('dist/'+name)).digest('hex')}  ${name}`))).join('\n')+'\n');
} finally {
  await writeFile('profile.json', sourceProfile);
}


