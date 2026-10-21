import test from 'node:test';
import assert from 'node:assert/strict';
import { trusted, external, validState, inactive, accelerator } from './policy.mjs';
test('only the exact packaged HTTPS origin is privileged',()=>{
 const origin='https://www.blueprint.app.br';
 assert.equal(trusted(origin+'/chat',origin),true);
 for(const url of ['http://www.blueprint.app.br','https://www.blueprint.app.br.evil.test','https://user@www.blueprint.app.br','file:///tmp/a','https://blueprint.app.br']) assert.equal(trusted(url,origin),false);
 assert.equal(external('javascript:alert(1)'),false);assert.equal(external('file:///C:/secret'),false);assert.equal(external('https://example.com'),true);
});
test('IPC state and native accelerator validation reject malformed and duplicate actions',()=>{
 assert.equal(validState(inactive),true);assert.equal(validState({...inactive,available:'true'}),false);
 assert.equal(validState({...inactive,bindings:{microphone:'Alt+F8',listening:'Alt+F8',all:''}}),false);
 assert.equal(accelerator('Alt+F8'),'Alt+F8');assert.equal(accelerator('Ctrl+Semicolon'),'Ctrl+;');assert.equal(accelerator('Alt+F4'),'');
});
