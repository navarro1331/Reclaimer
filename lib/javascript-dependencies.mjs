import path from 'node:path';

/** Bounded static package routing over retained inventory, without consulting the host module loader. */
export function dependencyResolver(files){
  const retained=new Map(files.map(f=>[f.path,f])),manifests=new Map();
  for(const file of files)if(/(?:^|\/)package\.json$/.test(file.path))try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes));if(value&&typeof value==='object'&&!Array.isArray(value))manifests.set(path.posix.dirname(file.path),value);}catch{}
  const inside=p=>p!== '..'&&!p.startsWith('../')&&!path.posix.isAbsolute(p);
  function existing(p,extensions=true){if(!inside(p))return null;if(retained.has(p))return {path:p,basis:'exact-inventory-path'};if(extensions)for(const suffix of ['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.node','/index.js'])if(retained.has(p+suffix))return {path:p+suffix,basis:'static-extension-candidate'};return null;}
  function scope(from){let dir=path.posix.dirname(from);while(true){if(manifests.has(dir))return {dir,pkg:manifests.get(dir)};if(dir==='.')return null;dir=path.posix.dirname(dir);}}
  function route(value,kind){
    if(typeof value==='string')return value;if(value===null||Array.isArray(value)||!value||typeof value!=='object')return null;
    for(const [condition,target]of Object.entries(value)){
      if(condition==='default'||condition===kind)return route(target,kind);
      // Unknown conditions may be enabled by a host/bundler; preserve that ambiguity instead of skipping them.
      if(condition!== (kind==='require'?'import':'require'))return null;
    }
    return null;
  }
  function tableRoute(table,key,kind){
    if(typeof table==='string'||table===null||Array.isArray(table))return key==='.'?route(table,kind):null;
    if(!table||typeof table!=='object')return null;
    const keys=Object.keys(table);if(keys.every(k=>!k.startsWith('.'))&&key==='.')return route(table,kind);
    if(Object.hasOwn(table,key))return route(table[key],kind);
    const patterns=keys.filter(k=>k.includes('*')&&k.indexOf('*')===k.lastIndexOf('*')).map(k=>{const [start,end]=k.split('*');return key.startsWith(start)&&key.endsWith(end)&&key.length>=start.length+end.length?{key:k,start,end}:null;}).filter(Boolean).sort((a,b)=>b.start.length-a.start.length||b.key.length-a.key.length);
    if(!patterns.length)return null;const {key:pattern,start,end}=patterns[0],target=route(table[pattern],kind),match=key.slice(start.length,key.length-end.length);
    return target?.replaceAll('*',match)??null;
  }
  function targetAt(dir,target){
    if(typeof target!=='string'||!target.startsWith('./')||target.includes('\\')||/[?#%]/.test(target)||target.slice(2).split('/').some(p=>['..','.','node_modules'].includes(p)))return null;
    return existing(path.posix.join(dir,target),false);
  }
  function packageTarget(dir,pkg,subpath,kind){
    if(pkg?.exports!==undefined){const found=targetAt(dir,tableRoute(pkg.exports,subpath?`./${subpath}`:'.',kind));return found?{...found,basis:'declared-package-export'}:null;}
    if(subpath)return existing(path.posix.join(dir,subpath));
    const main=typeof pkg?.main==='string'?existing(path.posix.join(dir,pkg.main)):null;
    return main?{...main,basis:'declared-package-main'}:existing(path.posix.join(dir,'index.js'),false);
  }
  function resolve(from,spec,kind='import'){
    if(typeof spec!=='string'||!spec||spec.includes('\0')||spec.includes('\\')||/^[a-z][a-z0-9+.-]*:|^\//i.test(spec))return null;
    if(spec.startsWith('.'))return existing(path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)));
    const current=scope(from);
    if(spec.startsWith('#')){const selected=current&&tableRoute(current.pkg.imports,spec,kind);return current?targetAt(current.dir,selected):null;}
    const pieces=spec.split('/'),name=spec.startsWith('@')?pieces.slice(0,2).join('/'):pieces[0],subpath=pieces.slice(spec.startsWith('@')?2:1).join('/');
    if(!name||pieces.some(p=>p==='..'||p==='.'||p===''))return null;
    if(current?.pkg.name===name&&current.pkg.exports!==undefined)return packageTarget(current.dir,current.pkg,subpath,kind);
    let directory=path.posix.dirname(from);
    while(true){const dir=path.posix.join(directory,'node_modules',name);if(manifests.has(dir)||[...retained.keys()].some(p=>p.startsWith(`${dir}/`)))return packageTarget(dir,manifests.get(dir),subpath,kind);if(directory==='.')return null;directory=path.posix.dirname(directory);}
  }
  return resolve;
}
