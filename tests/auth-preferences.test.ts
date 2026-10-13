import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { authError, createAuthSignal, executeAuth, validateAuth } from '../src/lib/auth.ts';
import type { AuthApi } from '../src/lib/auth.ts';
import { trackerPreferences } from '../src/lib/preferences.ts';
import { emptyStore, mergeRecord, patchRecord } from '../src/lib/model.ts';
import { Repository } from '../src/lib/repository.ts';
import { serviceWorkerSource, staticBuildId } from '../src/lib/service-worker-source.ts';
const input = {email:' person@example.com ',password:' example-password ',confirmation:' example-password ',name:' David '};
test('sign-in does not create an account, preserves password whitespace and waits for a real session', async () => {
  const calls:unknown[]=[];
  const api={signInWithPassword:async(args:unknown)=>{calls.push(args);return {data:{session:{user:{id:'owner'}}},error:null};}} as unknown as AuthApi;
  assert.deepEqual(await executeAuth(api,'signin',input,'https://example.com/'),{signedIn:true,emailSent:false});
  assert.deepEqual(calls,[{email:'person@example.com',password:' example-password '}]);
  await assert.rejects(executeAuth({signInWithPassword:async()=>({data:{session:null},error:null})} as unknown as AuthApi,'signin',input,'/'),/Session/);
});
test('registration validates passwords before calling auth and distinguishes confirmation from immediate login', async () => {
  let calls=0;
  const api={signUp:async(args:unknown)=>{calls++;assert.deepEqual(args,{email:'person@example.com',password:' example-password ',options:{emailRedirectTo:'https://example.com/new/',data:{display_name:'David'}}});return {data:{session:null},error:null};}} as unknown as AuthApi;
  await assert.rejects(executeAuth(api,'signup',{...input,confirmation:'different'},'https://example.com/new/'),/neshodují/); assert.equal(calls,0);
  assert.deepEqual(await executeAuth(api,'signup',input,'https://example.com/new/'),{signedIn:false,emailSent:true});
  assert.equal(calls,1); assert.throws(()=>validateAuth('signup',{...input,password:'short',confirmation:'short'}),/8 znaků/);
});
test('password recovery does not create a session and auth errors stay understandable',async()=>{
  const api={resetPasswordForEmail:async(email:string,args:unknown)=>{assert.equal(email,'person@example.com');assert.deepEqual(args,{redirectTo:'https://example.com/new/'});return {error:null};}} as unknown as AuthApi;
  assert.deepEqual(await executeAuth(api,'reset',{...input,password:'',confirmation:''},'https://example.com/new/'),{signedIn:false,emailSent:true});
  assert.match(authError({code:'invalid_credentials'}),/E-mail nebo heslo/); assert.match(authError({status:429}),/za chvíli/);
  const signal=createAuthSignal(false);let changes=0;const unsubscribe=signal.subscribe(()=>changes++);
  signal.set({ready:true,recovery:true});assert.deepEqual(signal.getSnapshot(),{ready:true,recovery:true});unsubscribe();signal.set({recovery:false});assert.equal(changes,1);
});
test('disabling recovery survives reopening, merges independently from nutrition and keeps history',()=>{
  const values=new Map<string,string>(),memory={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};
  const repo=new Repository(memory);repo.activate({id:'owner',email:'owner@example.com'});
  repo.patch('day','daily',{steps:10000,bedTime:'23:00'});repo.patch('goals','goals',{trackRecovery:false,theme:'dark'});
  const reopened=new Repository(memory);reopened.activate({id:'owner',email:'owner@example.com'});
  assert.equal(trackerPreferences(reopened.getSnapshot().store).recovery,false);assert.equal(reopened.getSnapshot().store.records.day.payload.steps,10000);
  const original=reopened.getSnapshot().store.records.goals,remote=patchRecord(original,'goals','goals',{calories:2200},'2099-01-01T00:00:00.000Z');
  const store=emptyStore();store.records.goals=mergeRecord(original,remote);assert.equal(trackerPreferences(store).recovery,false);assert.equal(store.records.goals.payload.calories,2200);
  repo.patch('goals','goals',{trackRecovery:true});assert.equal(trackerPreferences(repo.getSnapshot().store).recovery,true);assert.equal(repo.getSnapshot().store.records.day.payload.steps,10000);
});
test('dark mode and trackers default on without importing another account preferences',()=>{
  assert.deepEqual(trackerPreferences(emptyStore()),{training:true,nutrition:true,recovery:true,progress:true,theme:'dark'});
  const repo=new Repository({getItem:()=>null,setItem:()=>{}});repo.patch('goals','goals',{trackRecovery:false,theme:'light'});repo.activate({id:'new-user',email:'new@example.com'});
  assert.equal(trackerPreferences(repo.getSnapshot().store).recovery,true);assert.equal(trackerPreferences(repo.getSnapshot().store).theme,'dark');
});
test('offline worker never intercepts Supabase, mutations, auth queries or unknown same-origin endpoints',()=>{
  const callbacks:Record<string,(event:any)=>unknown>={};const context={URL,self:{registration:{scope:'https://example.com/new/'},addEventListener:(type:string,fn:(event:any)=>unknown)=>{callbacks[type]=fn;}}};
  vm.runInNewContext(serviceWorkerSource('test',['./index.html','./assets/app.js']),context);
  for(const request of [{url:'https://x.supabase.co/rest/v1/user_records',method:'GET',mode:'cors'},{url:'https://example.com/new/api/records',method:'GET',mode:'cors'},{url:'https://example.com/new/index.html?code=secret',method:'GET',mode:'cors'},{url:'https://example.com/old/assets/app.js',method:'GET',mode:'cors'},{url:'https://example.com/new/assets/app.js',method:'POST',mode:'cors'}]) {
    let intercepted=false;callbacks.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,request.url);
  }
});
test('offline activation removes only the new app static caches',async()=>{
  const callbacks:Record<string,(event:any)=>unknown>={},deleted:string[]=[];let done:Promise<unknown>|undefined;
  vm.runInNewContext(serviceWorkerSource('new',['./index.html']),{URL,self:{clients:{claim:async()=>{}},addEventListener:(type:string,fn:(event:any)=>unknown)=>{callbacks[type]=fn;}},caches:{keys:async()=>['fit-plan-local-v98','become-better-next-static-old','become-better-next-static-new'],delete:async(key:string)=>{deleted.push(key);}}});
  callbacks.activate({waitUntil:(promise:Promise<unknown>)=>{done=promise;}});await done;assert.deepEqual(deleted,['become-better-next-static-old']);
});
test('offline cache version changes for HTML and font edits even when filenames stay the same',()=>{
  const original=staticBuildId(['index.html','<html>old</html>','font.woff',new Uint8Array([1,2,3])]);
  assert.equal(original,staticBuildId(['index.html','<html>old</html>','font.woff',new Uint8Array([1,2,3])]));
  assert.notEqual(original,staticBuildId(['index.html','<html>new</html>','font.woff',new Uint8Array([1,2,3])]));
  assert.notEqual(original,staticBuildId(['index.html','<html>old</html>','font.woff',new Uint8Array([1,2,4])]));
});
