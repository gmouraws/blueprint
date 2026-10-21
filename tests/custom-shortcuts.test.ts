import test from 'node:test';
import assert from 'node:assert/strict';
import { validBinding, bindingFromEvent, validateShortcuts } from '../src/lib/client/shortcuts';
import { validWindowsRelease } from '../src/lib/windows-release';
test('custom bindings preserve old combinations and support ordered modifiers/function keys',()=>{
 for(const binding of ['Ctrl+Shift+M','Alt+F8','F9','Ctrl+Delete','Ctrl+Alt+Period','Shift+Meta+K']) assert.equal(validBinding(binding),true,binding);
 for(const binding of ['Control','Ctrl+Shift','M','Alt+F4','Ctrl+Ctrl+M','Shift+Ctrl+M','Escape','Ctrl+Shift+T','Ctrl+Unknown']) assert.equal(validBinding(binding),false,binding);
 assert.equal(bindingFromEvent({key:'F8',ctrlKey:false,altKey:true,shiftKey:false,metaKey:false}),'Alt+F8');
 assert.deepEqual(validateShortcuts({microphone:'Alt+F8',listening:'Alt+F8',all:'F9'}),{microphone:'Alt+F8',listening:'',all:'F9'});
});
test('download remains absent without an approved production release',()=>{
 assert.equal(validWindowsRelease(null),false);
 assert.equal(validWindowsRelease({version:'0.1.0',url:'https://example.com/setup.exe',checksumUrl:'https://example.com/sums',sha256:'a'.repeat(64),profile:'production',approved:true}),false);
});
