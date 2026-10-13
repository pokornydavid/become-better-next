export function serviceWorkerSource(version: string, assets: string[]) {
  return `const CACHE=${JSON.stringify('become-better-next-static-' + version)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('become-better-next-static-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url),scope=new URL(self.registration.scope);
  if(request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  if(request.mode==='navigate'){
    // Recovery links and auth callbacks must reach the network. Never retain
    // query strings or responses containing account/authentication information.
    event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match(new URL('index.html',scope).href))));return;
  }
  if(url.search||!ASSETS.some(asset=>new URL(asset,scope).href===url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(request))||fetch(request)));
});`;
}
export function staticBuildId(parts: (string | Uint8Array)[]) {
  let a=2166136261,b=333555777;
  for(const part of parts) {
    for(let i=0;i<part.length;i++){const byte=typeof part==='string'?part.charCodeAt(i):part[i];a=Math.imul(a^byte,16777619);b=Math.imul(b^byte,2246822519);}
    a=Math.imul(a^255,16777619);b=Math.imul(b^255,2246822519);
  }
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
