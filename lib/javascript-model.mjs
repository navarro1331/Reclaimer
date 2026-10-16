import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from '@babel/parser';
import * as asar from '@electron/asar';

export const LIMITS = { files: 4096, bytes: 64 * 1024 * 1024, fileBytes: 16 * 1024 * 1024, astNodes: 200000, depth: 256, traceNodes: 4096 };
export const FAMILIES = ['boundary','call-flow','child-process','closure','configuration','data-flow','event','object-flow','promise-ownership','request','resource-lifecycle','timer'];
const ownershipBudgets=new WeakMap();
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sha = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : canonical(value)).digest('hex');
export const id = (prefix, value) => `${prefix}_${sha(value)}`;
export const coverage = (status = 'complete', omitted = 0, truncated = false, limits = []) => ({ status, truncated, omitted_count: omitted, limits });
export const sourceRange = n => n?.loc ? { start: { line:n.loc.start.line, column:n.loc.start.column }, end: { line:n.loc.end.line, column:n.loc.end.column } } : null;
export const unknown = detail => ({ available:false, reason:'not-observed', detail });
export function fact(hash, logicalPath, authority = 'artifact-bytes', state = 'observed', location = null, evidenceIds = []) {
  return { authority, state, confidence:state === 'observed' ? 'exact' : state === 'inferred' ? 'medium' : 'unknown',
    artifact:hash ? { available:true, artifact_id:id('art',hash), sha256:hash } : unknown('No artifact bytes supplied'),
    location:location ? { available:true, value:location } : logicalPath ? { available:true, value:{kind:'artifact-path',path:logicalPath} } : unknown('No location supplied'),
    extractor:{name:'real-independent-javascript',version:'1.0.0',operation:'static-graph',executable_sha256:null},
    coverage:coverage(),limitations:[],evidence_ids:evidenceIds };
}
export function observation(label, properties, evidence, source_map_reference = null) {
  const base = { label:label || null, source_map_reference, properties, evidence };
  return {...base, observation_id:id('jag_observation',base), identifier_strategy:{strategy:'semantic-content-sha256',stability:'observation-exact'}};
}
export function node(kind, identity, label, properties, evidence, mapRef = null) {
  return {node_id:id('jag_node',{kind,identity}),kind,identity,observations:[observation(label,properties,evidence,mapRef)]};
}
export function edge(source, target, relation, evidence, properties = {}) {
  const base = {source_node_id:typeof source === 'string' ? source : source.node_id,target_node_id:typeof target === 'string' ? target : target.node_id,relation,properties,evidence};
  return {...base,edge_id:id('jag_edge',base),identifier_strategy:{strategy:'semantic-content-sha256',stability:'relationship-exact'}};
}
export function graph(roots, nodes, edges, cov = coverage(), limitations = []) {
  const retained=new Map();for(const n of nodes){const previous=retained.get(n.node_id);retained.set(n.node_id,previous?{...n,observations:[...new Map([...previous.observations,...n.observations].map(o=>[o.observation_id,o])).values()]}:n);}
  const base={schema:'JavaScriptApplicationGraph',root_node_ids:roots,nodes:[...retained.values()],edges:[...new Map(edges.map(e=>[e.edge_id,e])).values()],coverage:cov,limitations};
  return {...base,graph_id:id('jag',base)};
}
export function localIdentity(rootHash, namespace, key) { return {strategy:'artifact-local-key',stability:'artifact-version',artifact_sha256:rootHash,namespace,key}; }
export const properties = n => Object.assign({},...n.observations.map(o=>o.properties));
export const logical = n => n.identity.path ?? properties(n).path ?? n.identity.original_source ?? null;
export function application(e) {
  const result=e?.normalized_result ?? e;
  if (!result?.graph?.nodes || !result.graph.graph_id) throw Object.assign(new Error('Application evidence must contain a complete application-graph payload'),{code:'INVALID_APPLICATION_EVIDENCE'});
  return result;
}
export function literal(n) {
  if (!n) return {known:false};
  if (['StringLiteral','NumericLiteral','BooleanLiteral'].includes(n.type)) return {known:true,value:n.value};
  if (n.type === 'NullLiteral') return {known:true,value:null};
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return {known:true,value:n.quasis.map(q=>q.value.cooked ?? q.value.raw).join('')};
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'NumericLiteral') return {known:true,value:-n.argument.value};
  return {known:false};
}
export function memberName(n) {
  if (!n) return '';
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (['MemberExpression','OptionalMemberExpression'].includes(n.type)) return `${memberName(n.object)}.${n.computed ? literal(n.property).value ?? '?' : memberName(n.property)}`;
  return '';
}
function safeName(name) {
  const p=name.replaceAll('\\','/').replace(/^\/+/, '');
  if (!p || p.includes('\0') || p.split('/').some(s=>s==='..') || /^[A-Za-z]:/.test(p)) throw Object.assign(new Error(`Unsafe archive member: ${name}`),{code:'UNSAFE_ARCHIVE_PATH'});
  return p;
}
export async function inventory(inputPath, format = 'auto', integrityPolicy = 'fail', signal = null) {
  const absolute=path.resolve(inputPath), st=await fs.lstat(absolute);
  if (st.isSymbolicLink()) throw Object.assign(new Error('Root symlinks are not followed'),{code:'SYMLINK_ROOT'});
  const actual=format === 'auto' ? st.isDirectory() ? 'directory' : 'asar' : format;
  if ((actual==='directory')!==st.isDirectory()) throw Object.assign(new Error('Requested container format does not match the input'),{code:'FORMAT_MISMATCH'});
  const files=[],limitations=[],contradictions=[]; let total=0,omitted=0, truncated=false;
  async function add(p,b,extra={}) {
    signal?.throwIfAborted();
    if(files.length>=LIMITS.files || b.length>LIMITS.fileBytes || total+b.length>LIMITS.bytes){omitted++;truncated=true;return;}
    total+=b.length;files.push({path:p,bytes:b,sha256:sha(b),...extra});
  }
  let rootHash;
  if(actual==='directory') {
    async function walk(dir,depth=0) {
      if(depth>LIMITS.depth){omitted++;truncated=true;return;}
      for(const ent of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
        signal?.throwIfAborted();
        const full=path.join(dir,ent.name),rel=path.relative(absolute,full).replaceAll('\\','/');
        if(ent.isSymbolicLink()){limitations.push(`Symlink not followed: ${rel}`);omitted++;continue;}
        if(ent.isDirectory())await walk(full,depth+1);
        else if(ent.isFile()) {
          if(files.length>=LIMITS.files){omitted++;truncated=true;continue;}
          try {const s=await fs.stat(full);if(s.size>LIMITS.fileBytes || total+s.size>LIMITS.bytes){omitted++;truncated=true;continue;}await add(rel,await fs.readFile(full,signal?{signal}:undefined));}
          catch(error){if(signal?.aborted)throw error;limitations.push(`Unreadable file ${rel}: ${error.code ?? error.name}`);omitted++;}
        }
      }
    }
    await walk(absolute);
    rootHash=sha(files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes.length})));
  } else {
    if(st.size>512*1024*1024)throw Object.assign(new Error('ASAR root exceeds the 512 MiB input limit'),{code:'RESOURCE_LIMIT'});
    rootHash=sha(await fs.readFile(absolute,signal?{signal}:undefined));
    for(const name of asar.listPackage(absolute).sort()) {
      signal?.throwIfAborted();
      const p=safeName(name), meta=asar.statFile(absolute,p,false);
      if(meta.files)continue;
      if(meta.link){limitations.push(`ASAR link not followed: ${p}`);omitted++;continue;}
      if(meta.size>LIMITS.fileBytes || files.length>=LIMITS.files || total+meta.size>LIMITS.bytes){omitted++;truncated=true;continue;}
      // Unpacked members are read only after proving their physical path remains below the explicit companion root.
      if(meta.unpacked) {
        const root=await fs.realpath(`${absolute}.unpacked`),member=await fs.realpath(path.join(root,p));
        if(path.relative(root,member).startsWith('..') || path.isAbsolute(path.relative(root,member)))throw Object.assign(new Error(`Unpacked ASAR member escapes companion root: ${p}`),{code:'SYMLINK_ESCAPE'});
      }
      const b=asar.extractFile(absolute,p),observed=sha(b),declared=meta.integrity?.algorithm === 'SHA256' ? meta.integrity.hash?.toLowerCase() : null;
      if(declared && declared!==observed) {
        const contradiction={contradiction_id:id('ic',{p,declared,observed}),occurrence_id:id('occ',{rootHash,p}),parent_artifact_id:id('art',rootHash),logical_path:p,declared_sha256:declared,observed_sha256:observed,entry_kind:'file',unpacked:!!meta.unpacked,trust:'observed-untrusted',provenance:'container-integrity-metadata-versus-observed-bytes',limitations:['Declared ASAR integrity disagrees with observed bytes']};
        contradictions.push(contradiction);if(integrityPolicy==='fail')throw Object.assign(new Error(`ASAR integrity mismatch: ${p}`),{code:'INTEGRITY_MISMATCH',contradiction});
      }
      await add(p,b,{unpacked:!!meta.unpacked});
    }
  }
  if(omitted)limitations.push(`Inventory omitted ${omitted} entries; digest covers retained directory entries only when input is a directory`);
  return {absolute,format:actual,rootHash,files,limitations,contradictions,total,coverage:coverage(omitted?'partial':'complete',omitted,truncated,truncated?[{name:'files',value:LIMITS.files,unit:'items'},{name:'bytes',value:LIMITS.bytes,unit:'bytes'}]:[])};
}
export function parseSource(text, filename) {
  return parse(text,{sourceType:'unambiguous',allowReturnOutsideFunction:true,errorRecovery:true,sourceFilename:filename,plugins:['jsx',...(/\.(?:ts|tsx)$/.test(filename)?['typescript']:[])]});
}
function children(n) {
  return Object.entries(n).filter(([k])=>!['loc','start','end','extra','comments','tokens','errors','leadingComments','trailingComments','innerComments'].includes(k)).flatMap(([k,v])=>Array.isArray(v)?v.filter(x=>x?.type).map(x=>[k,x]):v?.type?[[k,v]]:[]);
}
function astShape(n) {
  if (!n || typeof n!=='object')return n;
  if(Array.isArray(n))return n.map(astShape);
  return Object.fromEntries(Object.entries(n).filter(([k])=>!['loc','start','end','extra','comments','tokens','errors','leadingComments','trailingComments','innerComments'].includes(k)).map(([k,v])=>[k,k==='name' && n.type==='Identifier'?'$binding':astShape(v)]));
}
export function exportShape(n, bindings, seen = new Set(), prefix='') {
  if(!n)return {fields:{},complete:false,source_range:null};
  if(n.type==='Identifier') { if(seen.has(n.name))return {fields:{},complete:false,source_range:sourceRange(n)};seen.add(n.name);return exportShape(bindings.get(n.name),bindings,seen,prefix); }
  if(n.type==='TSAsExpression' || n.type==='TSSatisfiesExpression')return exportShape(n.expression,bindings,seen,prefix);
  const fields={};let complete=n.type==='ObjectExpression';
  if(n.type==='ObjectExpression')for(const p of n.properties) {
    if(p.type==='SpreadElement') {const s=exportShape(p.argument,bindings,new Set(seen),prefix);Object.assign(fields,s.fields);complete&&=s.complete;continue;}
    const key=p.computed?literal(p.key):{known:true,value:p.key.name??p.key.value};
    if(!key.known){complete=false;continue;}
    const k=prefix?`${prefix}.${key.value}`:String(key.value),v=literal(p.value);
    fields[k]=v.known?{availability:'literal',value:v.value}:{availability:'unknown',reason:'Value is not a static primitive literal'};
    if(p.value?.type==='ObjectExpression'){const s=exportShape(p.value,bindings,new Set(seen),k);Object.assign(fields,s.fields);complete&&=s.complete;}
  }
  return {fields,complete,source_range:sourceRange(n)};
}

export function analyzeAst(ast, file, rootHash, appNode, appNodes, appEdges, semantics, stats, summary) {
  const contextBase=fact(file.sha256,file.path,'ast-static-analysis');delete contextBase.location;
  const context={...contextBase,context_id:id('jsrg_evidence',{file:file.path,...contextBase})};semantics.evidence_contexts.push(context);
  const bindings=new Map(),exports=[];for(const stmt of ast.program.body) {
    const d=stmt.type==='ExportNamedDeclaration'?stmt.declaration:stmt;
    if(d?.type==='VariableDeclaration')for(const v of d.declarations)if(v.id.type==='Identifier')bindings.set(v.id.name,v.init);
    if(d?.type==='FunctionDeclaration')bindings.set(d.id.name,d);
    if(stmt.type==='ExportDefaultDeclaration')exports.push({name:'default',value:stmt.declaration});
    if(stmt.type==='ExportNamedDeclaration') {
      if(d?.type==='VariableDeclaration')for(const v of d.declarations)if(v.id.type==='Identifier')exports.push({name:v.id.name,value:v.init});
      if(d?.id)exports.push({name:d.id.name,value:d});
      for(const sp of stmt.specifiers ?? [])exports.push({name:sp.exported.name??sp.exported.value,value:sp.local});
    }
  }
  const appFact=n=>fact(file.sha256,file.path,'ast-static-analysis','observed',n?.loc?{kind:'source-range',source:file.path,...sourceRange(n)}:null);
  function sem(kind,n,label,props={},fn=null,role='') {
    const identity={artifact_sha256:file.sha256,module_path:file.path,source_range:sourceRange(n),role_key:role||`${kind}:${n?.start??0}:${label??''}`};
    const value={kind,identity,function_node_id:fn,application_node_ids:[appNode.node_id],label:label||null,properties:props,evidence:{context_id:context.context_id,location:n?.loc?{available:true,value:{kind:'source-range',source:file.path,...sourceRange(n)}}:{available:true,value:{kind:'artifact-path',path:file.path}}},node_id:id('jsrg_node',identity)};
    semantics.nodes.push(value);return value;
  }
  function rel(a,b,relation,n,resolution='resolved',props={}) {
    if(!a||!b)return;const base={source_node_id:a.node_id,target_node_id:b.node_id,relation,resolution,properties:props,evidence:{context_id:context.context_id,location:{available:true,value:n?.loc?{kind:'source-range',source:file.path,...sourceRange(n)}:{kind:'artifact-path',path:file.path}}}};
    semantics.relations.push({...base,relation_id:id('jsrg_relation',base)});
  }
  function gap(n,family,reason,detail,relations=['calls']) {
    const base={node_id:n?.node_id??null,family,relation_kinds:relations,reason,detail,candidate_node_ids:[],evidence:n?.evidence??{context_id:context.context_id,location:{available:true,value:{kind:'artifact-path',path:file.path}}}};semantics.unknowns.push({...base,unknown_id:id('jsrg_unknown',base)});
  }
  const semanticNodeStart=semantics.nodes.length,semanticRelationStart=semantics.relations.length;
  const module=sem('module',ast.program,file.path,{},null,'module');semantics.root_node_ids.push(module.node_id);
  const objects=new WeakMap(), scopes=new WeakMap(), functionNodes=new WeakMap(),calls=[],assignedBindings=new Set();
  function newScope(parent,fn){return {parent,fn,bindings:new Map()};}
  function lookup(scope,name){for(let s=scope;s;s=s.parent)if(s.bindings.has(name))return s.bindings.get(name);return null;}
  function bindPattern(p,scope,fn) {
    if(!p)return;
    if(p.type==='Identifier'){const b=sem('binding',p,p.name,{},fn);scope.bindings.set(p.name,b);objects.set(p,b);}
    else if(p.type==='ObjectPattern')for(const entry of p.properties)bindPattern(entry.type==='RestElement'?entry.argument:entry.value,scope,fn);
    else if(p.type==='AssignmentPattern')bindPattern(p.left,scope,fn);
    else if(p.type==='RestElement')bindPattern(p.argument,scope,fn);
    else if(p.type==='ArrayPattern')for(const entry of p.elements)bindPattern(entry,scope,fn);
  }
  function declare(body,scope,fn) {
    for(let stmt of Array.isArray(body)?body:[]) {
      stmt=stmt.declaration??stmt;
      if(stmt.type==='VariableDeclaration')for(const d of stmt.declarations)bindPattern(d.id,scope,fn);
      if(stmt.type==='FunctionDeclaration' && stmt.id){const f=sem('function',stmt,stmt.id.name,{async:!!stmt.async},fn);scope.bindings.set(stmt.id.name,f);functionNodes.set(stmt,f);}
      if(stmt.type==='ImportDeclaration')for(const s of stmt.specifiers){bindPattern(s.local,scope,fn);const b=scope.bindings.get(s.local.name);if(b)Object.assign(b.properties,{import_source:stmt.source.value,import_name:s.type==='ImportSpecifier'?s.imported.name??s.imported.value:s.type==='ImportNamespaceSpecifier'?'*':'default'});}
    }
  }
  const top=newScope(null,null);declare(ast.program.body,top,null);
  function visit(n,scope,fn,depth=0,key='',parent=null) {
    if(stats.visited_ast_nodes>=LIMITS.astNodes || depth>LIMITS.depth){if(!semantics.unknowns.some(u=>u.evidence.context_id===context.context_id&&u.reason==='resource-limit'))gap(module,'data-flow','resource-limit','AST traversal bound reached',['reads']);return null;}
    stats.visited_ast_nodes++;
    let current=scope,functionId=fn,value=objects.get(n);
    const isFunction=['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod'].includes(n.type);
    if(isFunction) {
      value=functionNodes.get(n)??sem('function',n,n.id?.name??n.key?.name??'anonymous',{async:!!n.async},fn);functionNodes.set(n,value);objects.set(n,value);
      current=newScope(scope,value.node_id);functionId=value.node_id;if(n.id)current.bindings.set(n.id.name,value);
      for(const p of n.params){bindPattern(p,current,functionId);const parameter=sem('parameter',p,p.name??'destructured',{index:n.params.indexOf(p)},functionId);rel(parameter,objects.get(p),'defines',p);const pattern=p.type==='AssignmentPattern'?p.left:p;if(pattern.type==='ObjectPattern')for(const entry of pattern.properties)if(entry.type==='ObjectProperty'){const target=entry.value.type==='AssignmentPattern'?entry.value.left:entry.value,key=entry.computed?literal(entry.key):{known:true,value:entry.key.name??entry.key.value};rel(parameter,objects.get(target),'destructures',entry,key.known?'resolved':'candidate',{property:key.known?String(key.value):null});}if(pattern.type==='ArrayPattern')pattern.elements.forEach((entry,i)=>rel(parameter,objects.get(entry),'destructures',entry,'resolved',{property:String(i)}));}
      declare(n.body?.body,current,functionId);
    } else if(n.type==='BlockStatement' && !isFunction && parent?.body!==n){current=newScope(scope,fn);declare(n.body,current,fn);}
    scopes.set(n,current);
    if(!value && n.type==='Identifier') {
      if((key==='property' && parent?.type?.includes('Member') && !parent.computed)||(key==='key' && parent?.type==='ObjectProperty' && !parent.computed))return null;
      value=sem('expression',n,n.name,{},functionId);const b=lookup(current,n.name);if(b){rel(b,value,'reads',n);if(functionId&&b.kind==='binding'&&b.function_node_id!==functionId)rel(b,semantics.nodes.find(s=>s.node_id===functionId),'captures',n);}
      else if(!['undefined','NaN','Infinity'].includes(n.name))gap(value,'data-flow','unknown-value',`Unresolved lexical identifier: ${n.name}`,['reads']);
    }
    const l=literal(n);
    if(!value && l.known)value=sem('literal',n,String(l.value),{value:l.value},functionId);
    if(!value && ['CallExpression','OptionalCallExpression','NewExpression'].includes(n.type))value=sem('call-site',n,memberName(n.callee)||'dynamic call',{callee:memberName(n.callee),source_start:n.start},functionId);
    if(!value && n.type==='MemberExpression')value=sem('property-slot',n,memberName(n),{name:n.computed?literal(n.property).value??null:n.property.name},functionId);
    if(!value && n.type==='ReturnStatement')value=sem('return-site',n,'return',{},functionId);
    if(!value && n.type==='ObjectExpression')value=sem('expression',n,'object',{shape:exportShape(n,bindings)},functionId);
    if(!value && n.type==='AwaitExpression')value=sem('expression',n,'await',{},functionId);
    if(!value && /(?:Expression|Literal)$/.test(n.type))value=sem('expression',n,n.operator??n.type,{syntax_kind:n.type},functionId);
    if(value)objects.set(n,value);
    for(const [childKey,child]of children(n))visit(child,current,functionId,depth+1,childKey,n);
    if(n.type==='VariableDeclarator'){const b=objects.get(n.id),rhs=objects.get(n.init);rel(rhs,b,'defines',n);if(b)b.properties.initialization_start=n.start;if(b&&rhs?.kind==='function')b.properties.function_target=rhs.node_id;if(n.init?.type==='Identifier'){const source=lookup(current,n.init.name);rel(source,b,'aliases',n);if(b&&source?.kind==='function')b.properties.function_target=source.node_id;else if(b&&source?.properties.function_target)b.properties.function_target=source.properties.function_target;}
      if(n.id.type==='ObjectPattern'&&rhs)for(const entry of n.id.properties)if(entry.type==='ObjectProperty'&&entry.value.type==='Identifier'){const target=objects.get(entry.value),key=entry.computed?literal(entry.key):{known:true,value:entry.key.name??entry.key.value};rel(rhs,target,'destructures',entry,key.known?'resolved':'candidate',{property:key.known?String(key.value):null});}
    }
    if(['BinaryExpression','LogicalExpression','ConditionalExpression','UnaryExpression','ArrayExpression','ObjectExpression','SequenceExpression','TemplateLiteral'].includes(n.type))for(const [,child]of children(n))rel(objects.get(child),value,'consumed-by',n);
    if(n.type==='AssignmentExpression'){const root=memberName(n.left).split('.')[0],bound=lookup(current,root);if(bound)assignedBindings.add(bound.node_id);rel(objects.get(n.right),n.left.type==='Identifier'?bound:objects.get(n.left),n.left.type==='MemberExpression'?'writes-property':'writes',n);if(memberName(n.left).startsWith('exports.'))exports.push({name:memberName(n.left).slice(8),value:n.right});if(memberName(n.left)==='module.exports')exports.push({name:'default',value:n.right});}
    if(n.type==='UpdateExpression'){const bound=lookup(current,memberName(n.argument).split('.')[0]);if(bound)assignedBindings.add(bound.node_id);rel(objects.get(n.argument),bound,'writes',n);}
    if(n.type==='MemberExpression'){rel(objects.get(n.object),value,'reads-property',n);if(n.computed&&!literal(n.property).known)gap(value,'object-flow','dynamic-property','Computed property has no known literal key',['reads-property']);const name=memberName(n);if(name.startsWith('process.env.')||name.startsWith('process.argv')){const src=sem('config-source',n,name,{source:name.startsWith('process.env')?'environment':'argv'},functionId,`config:${n.start}`);rel(src,value,name.startsWith('process.env')?'reads-environment':'reads-argv',n);}}
    if(n.type==='ReturnStatement') {rel(objects.get(n.argument),value,'returns-to-call',n);}
    if(n.type==='AssignmentPattern')rel(objects.get(n.right),objects.get(n.left),'defaults',n,'candidate',{default_execution_unknown:true});
    if(n.type==='AwaitExpression')rel(objects.get(n.argument),value,'awaits',n);
    if(['CallExpression','OptionalCallExpression','NewExpression'].includes(n.type)) {
      const name=memberName(n.callee),binding=n.callee.type==='Identifier'?lookup(current,n.callee.name):null;
      const lexical=binding??(n.callee.type==='MemberExpression'&&n.callee.object.type==='Identifier'?lookup(current,n.callee.object.name):null);if(lexical)value.properties.callee_binding_id=lexical.node_id;
      calls.push({value,n,binding,name});
      n.arguments.forEach((a,i)=>rel(objects.get(a),value,'consumed-by',n,'resolved',{argument_index:i}));
      const effects=[['setTimeout','schedules-timer','timer'],['setInterval','schedules-timer','timer'],['clearTimeout','cancels-timer','timer'],['clearInterval','cancels-timer','timer'],['spawn','spawns','child-process'],['execFile','spawns','child-process'],['fetch','constructs-request','request']];
      for(const [api,relation,kind]of effects)if(name===api||name.endsWith(`.${api}`)){const e=sem(kind,n,name,{api,statically_named:true},functionId,`${kind}:${n.start}`);rel(value,e,relation,n,'candidate');}
      if(/\.(?:on|addEventListener|once)$/.test(name)){const evt=literal(n.arguments[0]),e=sem('event',n,evt.known?String(evt.value):'dynamic event',{name:evt.known?evt.value:null},functionId,`event:${n.start}`);rel(value,e,'registers-listener',n,'candidate');}
      if(name==='eval'||name==='Function')gap(value,'boundary','eval-or-generated-code','Generated code is not executed or statically expanded',['calls']);
      if(name==='require'||n.type==='ImportExpression') {
        const targetPath=literal(n.arguments[0]);if(targetPath.known && typeof targetPath.value==='string')appNode.observations[0].properties.imports.push({specifier:targetPath.value,source_range:sourceRange(n),loader_kind:'require'});
      }
      // Named API observations describe syntax; aliases, monkey-patching and actual execution are not proven.
      const apiNode=(kind,label,props,relation='calls')=>{const an=node(kind,localIdentity(rootHash,kind,`${file.path}:${n.start}:${label}`),label,{path:file.path,source_range:sourceRange(n),...props},appFact(n));appNodes.push(an);appEdges.push(edge(appNode,an,relation,appFact(n)));return an;};
      if(name==='BrowserWindow' || name.endsWith('.BrowserWindow')){summary.browser_windows++;apiNode('browser-window','BrowserWindow',{options:exportShape(n.arguments[0],bindings)});const opts=n.arguments[0]?.properties?.find(p=>p.key?.name==='webPreferences')?.value;if(opts?.type==='ObjectExpression'){summary.explicit_web_preferences++;if(opts.properties.some(p=>p.key?.name==='preload'))summary.preload_entrypoints++;}}
      if(name.endsWith('.exposeInMainWorld')){summary.context_bridge_apis++;const key=literal(n.arguments[0]);const shape=exportShape(n.arguments[1],bindings);summary.exposed_api_members+=Object.keys(shape.fields).length;apiNode('context-bridge-api',key.known?String(key.value):'dynamic API',{shape},'exposes');}
      if(/ipc(?:Renderer|Main)\.(?:send|sendSync|invoke|on|once|handle|handleOnce)$/.test(name)) {
        const channel=literal(n.arguments[0]),op=name.split('.').at(-1),isMain=name.includes('ipcMain');summary.ipc.operations++;
        if(channel.known){summary.ipc.literal_channels++;apiNode('ipc-channel',String(channel.value),{channel:channel.value,operation:op,is_main:isMain},isMain?'handles':'sends');}else summary.ipc.dynamic_channel_operations++;
        if(isMain)summary.ipc.main_handlers++;else if(['send','sendSync','invoke'].includes(op))summary.ipc.renderer_transmissions++;else summary.ipc.renderer_listeners++;
      }
      if(name==='fetch'||name.endsWith('.request')){const endpoint=literal(n.arguments[0]);if(endpoint.known&&typeof endpoint.value==='string')apiNode('endpoint',endpoint.value,{url:endpoint.value});}
      if(/(?:localStorage|sessionStorage)\.(?:setItem|getItem)$/.test(name))apiNode('storage',name,{key:literal(n.arguments[0]).value??null},'persists_to');
    }
    if(n.type==='ImportDeclaration' || n.type==='ExportAllDeclaration' || (n.type==='ExportNamedDeclaration'&&n.source))appNode.observations[0].properties.imports.push({specifier:n.source.value,source_range:sourceRange(n)});
    if(n.type==='ImportExpression'){const l=literal(n.source);if(l.known)appNode.observations[0].properties.imports.push({specifier:l.value,source_range:sourceRange(n)});else gap(module,'boundary','dynamic-call','Dynamic import target cannot be resolved',['calls']);}
    if(isFunction) {
      if(n.type==='ArrowFunctionExpression'&&n.body.type!=='BlockStatement'){const returned=sem('return-site',n.body,'implicit return',{implicit:true},value.node_id,`implicit-return:${n.start}`);rel(objects.get(n.body),returned,'returns-to-call',n.body);}
      const normalized=astShape(n),components={parameter_arity:n.params.length,normalized_ast_sha256:sha(normalized),control_flow_sha256:sha(children(n).map(([k,c])=>[k,c.type])),relation_shape_sha256:sha(semantics.relations.filter(r=>semantics.nodes.find(s=>s.node_id===r.source_node_id)?.function_node_id===value.node_id).map(r=>r.relation).sort()),literal_set_sha256:sha(semantics.nodes.filter(s=>s.kind==='literal'&&s.function_node_id===value.node_id).map(s=>s.properties.value).sort()),effects:n.async?['async']:[]};
      const base={function_node_id:value.node_id,algorithm:'rea.javascript-semantic-function',status:'partial',components,limitations:['Control-flow digest is a syntax summary; full flow-sensitive equivalence is not established'],evidence:value.evidence};semantics.fingerprints.push({...base,fingerprint_id:id('jsrg_fingerprint',base),fingerprint_sha256:sha(components)});
    }
    return value;
  }
  visit(ast.program,top,null);
  // Finite ownership candidates for lexically imported Node APIs and named promises.
  // These edges preserve syntax provenance; they do not assert path execution or closure.
  const resources=new Map(),promises=new Map(),byId=new Map(semantics.nodes.slice(semanticNodeStart).map(n=>[n.node_id,n])),incoming=new Map(),definitions=new Map();
  const ownershipLimit=Symbol('ownership-budget'),ownershipState=ownershipBudgets.get(stats)??{work:0};ownershipBudgets.set(stats,ownershipState);
  const ownershipTick=()=>{if(++ownershipState.work>1000000)throw ownershipLimit;};
  for(const r of semantics.relations.slice(semanticRelationStart)){if(['reads','defines','aliases','awaits'].includes(r.relation)){const list=incoming.get(r.target_node_id)??[];list.push(r);incoming.set(r.target_node_id,list);}if(r.relation==='defines'){const list=definitions.get(r.source_node_id)??[];list.push(r);definitions.set(r.source_node_id,list);}}
  const immutableOrigins=(value,seen=new Set(),depth=0)=>{
    ownershipTick();
    if(!value||depth>32||seen.has(value.node_id)||assignedBindings.has(value.node_id))return [];
    seen.add(value.node_id);const found=[value];
    for(const relation of incoming.get(value.node_id)??[])found.push(...immutableOrigins(byId.get(relation.source_node_id),seen,depth+1));
    return found;
  };
  const owners=(value,resource,n)=>{for(const r of definitions.get(value.node_id)??[]){ownershipTick();rel(byId.get(r.target_node_id),resource,'owns',n,'candidate',{execution_unknown:true});}};
  try {
  for(const {value,n,name} of calls){
    ownershipTick();const lexical=byId.get(value.properties.callee_binding_id),source=lexical?.properties.import_source,imported=lexical?.properties.import_name;
    const api=imported&& !['*','default'].includes(imported)?imported:name.split('.').at(-1);
    const fsApi=['fs','node:fs','fs/promises','node:fs/promises'].includes(source);
    if(fsApi&&!assignedBindings.has(lexical.node_id)&&['openSync','createReadStream','createWriteStream',...(['fs/promises','node:fs/promises'].includes(source)?['open']:[])].includes(api)){
      const resource=sem('resource',n,`${source}:${api}`,{api,import_source:source,execution_unknown:true,closure_proven:false,acquisition_start:n.start},value.function_node_id,`resource:${n.start}`);resources.set(value.node_id,resource);rel(value,resource,'acquires',n,'candidate');owners(value,resource,n);
    }
    const globalPromise=n.callee.type==='Identifier'&&name==='Promise'&&!lexical||n.callee.type==='MemberExpression'&&n.callee.object?.name==='Promise'&&!lexical;
    if(globalPromise&&(n.type==='NewExpression'||['resolve','reject','all','allSettled','race','any'].includes(api))){
      const promise=sem('promise',n,name,{api,execution_unknown:true},value.function_node_id,`promise:${n.start}`);promises.set(value.node_id,promise);rel(value,promise,'creates-promise',n,'candidate');owners(value,promise,n);
      if(n.arguments[0]?.type==='ArrayExpression')for(const argument of n.arguments[0].elements??[])for(const origin of immutableOrigins(objects.get(argument)))if(promises.has(origin.node_id))rel(promises.get(origin.node_id),promise,'aggregates',n,'candidate');
    }
  }
  for(const {value,n,name} of calls){
    ownershipTick();const lexical=byId.get(value.properties.callee_binding_id),source=lexical?.properties.import_source,api=lexical?.properties.import_name&& !['*','default'].includes(lexical.properties.import_name)?lexical.properties.import_name:name.split('.').at(-1);
    const target=n.callee.type==='MemberExpression'?objects.get(n.callee.object):null;
    const candidates=immutableOrigins(['close','closeSync'].includes(api)&&['fs','node:fs'].includes(source)?objects.get(n.arguments[0]):target);
    if(['close','closeSync','destroy','end','dispose'].includes(api))for(const origin of candidates)if(resources.has(origin.node_id)&&resources.get(origin.node_id).properties.acquisition_start<n.start)rel(value,resources.get(origin.node_id),'releases',n,'candidate',{api,execution_unknown:true,resource_closed:false});
    if(['then','catch','finally'].includes(api))for(const origin of candidates)if(promises.has(origin.node_id)){rel(promises.get(origin.node_id),value,'chains',n,'candidate',{api,callback_execution_unknown:true});for(const callback of n.arguments)if(objects.get(callback)?.kind==='function')rel(value,objects.get(callback),'calls',n,'candidate',{promise_callback:true});}
  }
  } catch(cause) {if(cause!==ownershipLimit)throw cause;gap(module,'resource-lifecycle','resource-limit','Finite ownership analysis reached its one million work-step bound',['owns','acquires','releases']);}
  function localTarget(binding,callStart,seen=new Set()){
    if(!binding||assignedBindings.has(binding.node_id)||seen.has(binding.node_id))return null;
    if(binding.properties.initialization_start>=callStart)return null;
    if(binding.kind==='function')return binding;seen.add(binding.node_id);
    const target=semantics.nodes.find(n=>n.node_id===binding.properties.function_target);if(target)return localTarget(target,callStart,seen);
    const alias=semantics.relations.find(r=>r.target_node_id===binding.node_id&&r.relation==='aliases');return alias?localTarget(semantics.nodes.find(n=>n.node_id===alias.source_node_id),callStart,seen):null;
  }
  for(const {value,n,binding,name}of calls){
    const target=localTarget(binding,n.start),initialized=binding?.properties.initialization_start;
    if(target&&(initialized===undefined||initialized<n.start)){
      rel(value,target,'calls',n);appEdges.push(edge(appNode,appNode,'calls',appFact(n),{callee:name,source_range:sourceRange(n)}));
      n.arguments.forEach((a,i)=>rel(objects.get(a),semantics.nodes.find(p=>p.kind==='parameter'&&p.function_node_id===target.node_id&&p.properties.index===i),'argument-to-parameter',n));
      for(const returned of semantics.nodes.filter(p=>p.kind==='return-site'&&p.function_node_id===target.node_id))rel(returned,value,'returns-to-call',n,'candidate',{cross_module:false,conditional_execution_unknown:true});
      if(target.properties.async)rel(target,value,'returns-task',n,'candidate',{async_result:true});
    }else gap(value,'call-flow','dynamic-call',`Call target was not resolved lexically: ${name||'<expression>'}`);
  }
  for(const ex of exports) {
    const shape=exportShape(ex.value,bindings), an=node('javascript-module',localIdentity(rootHash,'export',`${file.path}:${ex.name}`),ex.name,{path:file.path,export_name:ex.name,export_shape:shape},appFact(ex.value));
    appNodes.push(an);appEdges.push(edge(appNode,an,'exposes',appFact(ex.value),{export_name:ex.name}));
  }
  appNode.observations[0].properties.exports=exports.map(e=>e.name);
  // Refresh observation hashes after accumulating AST-derived fields.
  appNode.observations[0]=observation(appNode.observations[0].label,appNode.observations[0].properties,appNode.observations[0].evidence);
  return module;
}
