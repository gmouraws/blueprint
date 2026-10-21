import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const vs=execFileSync('C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe',['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8'}).trim();
if(!vs)throw Error('MSVC x64 build tools and Windows SDK are required');
const out=path.join(here,'dist');mkdirSync(out,{recursive:true});
// Paths originate only in the local toolchain and repository, never renderer input.
const command=`@echo off\r\ncall "${vs}\\VC\\Auxiliary\\Build\\vcvars64.bat" >nul\r\nif errorlevel 1 exit /b 1\r\ncl /nologo /std:c++17 /O2 /MT /EHsc /W4 /DUNICODE /D_UNICODE "${here}\\process-audio.cpp" /Fe:"${out}\\process-audio.exe" /Fo:"${out}\\process-audio.obj" /link /DYNAMICBASE /NXCOMPAT ole32.lib mmdevapi.lib user32.lib\r\n`;
const file=path.join(out,'build.cmd');writeFileSync(file,command);
const result=spawnSync('cmd.exe',['/d','/c',file],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
if(process.argv.includes('--fixture')){
 const testCommand=command.replaceAll('process-audio.cpp','audio-fixture.cpp').replaceAll('process-audio.exe','audio-fixture.exe').replaceAll('process-audio.obj','audio-fixture.obj').replace('ole32.lib mmdevapi.lib user32.lib','winmm.lib user32.lib');
 const testFile=path.join(out,'fixture.cmd');writeFileSync(testFile,testCommand);
 const test=spawnSync('cmd.exe',['/d','/c',testFile],{stdio:'inherit',windowsHide:true});if(test.status!==0)process.exit(test.status||1);
}
