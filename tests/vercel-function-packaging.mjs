import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,mkdtemp,mkdir,copyFile,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Vercel operation function retains its fixed-error module and duration dependency',async()=>{
 const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
 const ignore=(await readFile(path.join(root,'.vercelignore'),'utf8')).split(/\r?\n/);
 assert.ok(!ignore.includes('server/'),'a parent exclusion cannot be re-included by a child rule');
 assert.ok(ignore.includes('server/*'));
 assert.ok(ignore.includes('!server/upload-errors.mjs'));
 assert.ok(ignore.indexOf('server/*')<ignore.indexOf('!server/upload-errors.mjs'));
 const include=config.functions['api/operations.js'].includeFiles;
 for(const name of ['server/upload-errors.mjs','shared/video-policy.js']){assert.ok(include.includes(name));assert.ok((await stat(path.join(root,name))).isFile());}
 const {publicUploadError}=await import('../server/upload-errors.mjs');
 assert.equal(typeof publicUploadError,'function');
});
test('isolated function package starts without any other backend source',async()=>{
 const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));
 const directory=await mkdtemp(path.join(os.tmpdir(),'ego-vercel-package-'));
 try{
  for(const file of ['api/operations.js',...config.functions['api/operations.js'].includeFiles]){
   const target=path.join(directory,file);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,file),target);
  }
  await writeFile(path.join(directory,'package.json'),' {"type":"module"}');
  const module=await import(pathToFileURL(path.join(directory,'api/operations.js')));
  assert.equal(typeof module.default,'function');
 }finally{await rm(directory,{recursive:true,force:true});}
});
