import path from 'node:path';

/** Bounded static package routing over retained inventory, without consulting the host module loader. */
export function dependencyResolver(files,{conditions=[]}={}){
  const retained=new Map(files.map(f=>[f.path,f])),manifests=new Map(),configs=new Map();
  for(const file of files)if(/(?:^|\/)package\.json$/.test(file.path))try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes));if(value&&typeof value==='object'&&!Array.isArray(value))manifests.set(path.posix.dirname(file.path),value);}catch{}
  const inside=p=>p!== '..'&&!p.startsWith('../')&&!path.posix.isAbsolute(p);
  for(const file of files)if(/(?:^|\/)tsconfig\.json$/.test(file.path))try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(file.bytes));if(value&&typeof value==='object'&&!Array.isArray(value)&&value.extends===undefined)configs.set(path.posix.dirname(file.path),value);}catch{}
  function existing(p,extensions=true){if(!inside(p))return null;if(retained.has(p))return {path:p,basis:'exact-inventory-path'};if(extensions)for(const suffix of ['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.node','/index.js'])if(retained.has(p+suffix))return {path:p+suffix,basis:'static-extension-candidate'};return null;}
  function scope(from){let dir=path.posix.dirname(from);while(true){if(manifests.has(dir))return {dir,pkg:manifests.get(dir)};if(dir==='.')return null;dir=path.posix.dirname(dir);}}
  const targetValid=value=>typeof value==='string'&&value.startsWith('./')&&!value.includes('\\')&&!/[?#%]/.test(value)&&!value.slice(2).split('/').some(p=>['..','.','node_modules'].includes(p));
  let work=0;const ambiguous=Symbol('condition-unresolved');
  function route(value,kind,depth=0,isImports=false){
    if(++work>20000||depth>64)throw Object.assign(new Error('Static package target resolution exceeds its work or depth budget'),{code:'capacity'});
    if(typeof value==='string')return targetValid(value)||isImports&&!value.startsWith('.')&&!/[\\%?:]/.test(value)&&!path.posix.isAbsolute(value)?value:undefined;
    if(Array.isArray(value)){for(const entry of value){const found=route(entry,kind,depth+1,isImports);if(found!==undefined&&found!==null)return found;}return null;}
    if(value===null||!value||typeof value!=='object')return null;
    for(const [condition,target]of Object.entries(value)){
      if(condition==='default'||condition===kind||conditions.includes(condition))return route(target,kind,depth+1,isImports);
      // Unknown conditions may be enabled by a host/bundler; preserve that ambiguity instead of skipping them.
      if(condition!== (kind==='require'?'import':'require'))return ambiguous;
    }
    return null;
  }
  function tableRoute(table,key,kind){
    if(typeof table==='string'||table===null||Array.isArray(table))return key==='.'?route(table,kind):null;
    if(!table||typeof table!=='object')return null;
    const keys=Object.keys(table);if(keys.every(k=>!k.startsWith('.'))&&key==='.')return route(table,kind);
    if(Object.hasOwn(table,key))return route(table[key],kind,0,key.startsWith('#'));
    const patterns=keys.filter(k=>k.includes('*')&&k.indexOf('*')===k.lastIndexOf('*')).map(k=>{const [start,end]=k.split('*');return key.startsWith(start)&&key.endsWith(end)&&key.length>=start.length+end.length?{key:k,start,end}:null;}).filter(Boolean).sort((a,b)=>b.start.length-a.start.length||b.key.length-a.key.length);
    if(!patterns.length)return null;const {key:pattern,start,end}=patterns[0],target=route(table[pattern],kind,0,key.startsWith('#')),match=key.slice(start.length,key.length-end.length);
    return typeof target==='string'?target.replaceAll('*',match):null;
  }
  function targetAt(dir,target){
    if(!targetValid(target))return null;
    return existing(path.posix.join(dir,target),false);
  }
  function packageTarget(dir,pkg,subpath,kind){
    if(pkg?.exports!==undefined){const found=targetAt(dir,tableRoute(pkg.exports,subpath?`./${subpath}`:'.',kind));return found?{...found,basis:'declared-package-export'}:null;}
    if(subpath)return existing(path.posix.join(dir,subpath));
    const main=typeof pkg?.main==='string'?existing(path.posix.join(dir,pkg.main)):null;
    return main?{...main,basis:'declared-package-main'}:existing(path.posix.join(dir,'index.js'),false);
  }
  function resolve(from,spec,kind='import',seen=new Set()){
    if(++work>20000||seen.size>64)throw Object.assign(new Error('Static dependency resolution budget exceeded'),{code:'capacity'});
    if(typeof spec!=='string'||!spec||spec.includes('\0')||spec.includes('\\')||/^[a-z][a-z0-9+.-]*:|^\//i.test(spec))return null;
    if(spec.startsWith('.'))return existing(path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)));
    const current=scope(from);
    if(spec.startsWith('#')){const key=`${current?.dir}:${spec}`;if(!current||seen.has(key))return null;seen.add(key);const selected=tableRoute(current.pkg.imports,spec,kind);if(typeof selected!=='string')return null;return selected.startsWith('./')?targetAt(current.dir,selected):resolve(path.posix.join(current.dir,'__imports__.js'),selected,kind,seen);}
    let configDir=path.posix.dirname(from);
    while(true){if(configs.has(configDir)){const opts=configs.get(configDir).compilerOptions,paths=opts?.paths;if(paths&&typeof paths==='object'&&!Array.isArray(paths)){const keys=Object.keys(paths).filter(k=>k===spec||k.split('*').length===2&&spec.startsWith(k.split('*')[0])&&spec.endsWith(k.split('*')[1])).sort((a,b)=>(b===spec)-(a===spec)||b.split('*')[0].length-a.split('*')[0].length);const key=keys[0];if(key&&Array.isArray(paths[key])&&paths[key].length<=256){const [prefix,suffix]=key.split('*'),match=key.includes('*')?spec.slice(prefix.length,suffix?spec.length-suffix.length:undefined):'';for(const target of paths[key]){if(typeof target!=='string'||target.includes('\\')||path.posix.isAbsolute(target)||/[?#%]/.test(target))continue;const base=typeof opts.baseUrl==='string'?opts.baseUrl:'.',found=existing(path.posix.normalize(path.posix.join(configDir,base,target.replaceAll('*',match))));if(found)return {...found,basis:'declared-typescript-path-candidate'};}}}break;}if(configDir==='.')break;configDir=path.posix.dirname(configDir);}
    const pieces=spec.split('/'),name=spec.startsWith('@')?pieces.slice(0,2).join('/'):pieces[0],subpath=pieces.slice(spec.startsWith('@')?2:1).join('/');
    if(!name||pieces.some(p=>p==='..'||p==='.'||p===''))return null;
    if(current?.pkg.name===name&&current.pkg.exports!==undefined)return packageTarget(current.dir,current.pkg,subpath,kind);
    let directory=path.posix.dirname(from);
    while(true){const dir=path.posix.join(directory,'node_modules',name);if(manifests.has(dir)||[...retained.keys()].some(p=>p.startsWith(`${dir}/`)))return packageTarget(dir,manifests.get(dir),subpath,kind);if(directory==='.')return null;directory=path.posix.dirname(directory);}
  }
  return (from,spec,kind)=>{work=0;return resolve(from,spec,kind);};
}
