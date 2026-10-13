import path from 'node:path';
import { literal,memberName,sourceRange,canonical,fact,id,sha,node,edge,localIdentity,properties,observation } from './javascript-model.mjs';

const unknown=reason=>({kind:'unknown',reason,complete:false});
export function moduleExports(modules,rootHash,appNodes,appEdges,semantics,resolveDependency=null) {
  const records=new Map();
  for(const m of modules) {
    const r={...m,bindings:new Map(),exports:new Map(),stars:[],mutated:new Set(),shadowed:new Set()};records.set(m.file.path,r);
    for(const s of m.ast.program.body) {
      const d=s.declaration??s;
      if(d.type==='VariableDeclaration')for(const v of d.declarations) {
        if(v.id.type==='Identifier') {r.shadowed.add(v.id.name);r.bindings.set(v.id.name,{expr:v.init,constant:d.kind==='const'});}
        else if(v.id.type==='ObjectPattern'){for(const p of v.id.properties)if(p.type==='ObjectProperty'&&p.value.type==='Identifier'){r.shadowed.add(p.value.name);r.bindings.set(p.value.name,{expr:{type:'MemberExpression',object:v.init,property:p.key,computed:p.computed,loc:p.loc},constant:d.kind==='const'});}}
        else if(v.id.type==='ArrayPattern'){for(const [i,p]of v.id.elements.entries())if(p?.type==='Identifier'){r.shadowed.add(p.name);r.bindings.set(p.name,{expr:{type:'MemberExpression',object:v.init,property:{type:'NumericLiteral',value:i},computed:true,loc:p.loc},constant:d.kind==='const'});}}
      }
      if(d.type==='FunctionDeclaration'&&d.id){r.shadowed.add(d.id.name);r.bindings.set(d.id.name,{expr:d,constant:true});}
      if(s.type==='ImportDeclaration')for(const sp of s.specifiers){r.shadowed.add(sp.local.name);r.bindings.set(sp.local.name,{import:s.source.value,name:sp.type==='ImportDefaultSpecifier'?'default':sp.type==='ImportNamespaceSpecifier'?'*':sp.imported.name??sp.imported.value});}
      if(s.type==='ExportDefaultDeclaration')r.exports.set('default',{expr:s.declaration,location:s.declaration});
      if(s.type==='ExportNamedDeclaration') {
        if(d.type==='VariableDeclaration')for(const v of d.declarations)if(v.id.type==='Identifier')r.exports.set(v.id.name,{binding:v.id.name,location:v});
        if(d.type==='FunctionDeclaration')r.exports.set(d.id.name,{binding:d.id.name,location:d});
        for(const sp of s.specifiers)r.exports.set(sp.exported.name??sp.exported.value,s.source?{import:s.source.value,name:sp.local?.name??sp.local?.value??'*',location:sp}:{binding:sp.local.name,location:sp});
      }
      if(s.type==='ExportAllDeclaration')r.stars.push(s.source.value);
    }
    function scan(n,top=false) {
      if(!n?.type)return;
      if(n.type==='AssignmentExpression'||n.type==='UpdateExpression') {
        const left=n.left??n.argument,root=memberName(left).split('.')[0];if(root)r.mutated.add(root);
      }
      if(top&&n.type==='AssignmentExpression'&&!r.shadowed.has('module')&&!r.shadowed.has('exports')) {
        const name=memberName(n.left);
        if(name==='module.exports'){r.exports.set('default',{expr:n.right,location:n});if(n.right.type==='ObjectExpression')for(const p of n.right.properties){const k=p.computed?literal(p.key):{known:true,value:p.key.name??p.key.value};if(k.known&&p.type==='ObjectProperty')r.exports.set(String(k.value),{expr:p.value,location:p});}}
        else if(name.startsWith('module.exports.')||name.startsWith('exports.'))r.exports.set(name.replace(/^(?:module\.)?exports\./,''),{expr:n.right,location:n});
      }
      for(const [key,v]of Object.entries(n))if(!['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key)){if(Array.isArray(v))v.forEach(x=>scan(x,false));else if(v?.type)scan(v,false);}
    }
    for(const s of m.ast.program.body)scan(s.type==='ExpressionStatement'?s.expression:s,true);
  }
  function resolvePath(r,spec,kind='import') {
    if(resolveDependency){const resolved=resolveDependency(r.file.path,spec,kind);return resolved?records.get(resolved.path)??null:null;}
    if(typeof spec!=='string'||!spec.startsWith('.'))return null;
    const p=path.posix.normalize(path.posix.join(path.posix.dirname(r.file.path),spec));if(p==='..'||p.startsWith('../'))return null;
    return [p,...['.js','.mjs','.cjs','.ts','.tsx','.jsx'].map(e=>p+e),`${p}/index.js`].map(p=>records.get(p)).find(Boolean)??null;
  }
  function exportNames(r,seen=new Set()) {
    if(seen.has(r.file.path))return new Set();seen.add(r.file.path);const names=new Set(r.exports.keys());
    for(const spec of r.stars){const other=resolvePath(r,spec);if(other)for(const name of exportNames(other,new Set(seen)))if(name!=='default')names.add(name);}
    return names;
  }
  function exported(r,name,seen=new Set()) {
    const key=`${r.file.path}:export:${name}`;if(seen.has(key))return unknown('Export cycle');seen=new Set(seen).add(key);
    const e=r.exports.get(name);
    if(e)return e.import?imported(r,e.import,e.name,seen):e.binding?binding(r,e.binding,seen):value(r,e.expr,seen);
    const candidates=r.stars.map(spec=>resolvePath(r,spec)).filter(Boolean).filter(other=>exportNames(other).has(name));
    if(candidates.length!==1)return unknown(candidates.length?'Ambiguous star re-export':'Export is not observed');
    return exported(candidates[0],name,seen);
  }
  function imported(r,spec,name,seen,kind='import') {const other=resolvePath(r,spec,kind);return !other?unknown('Import target is unresolved'):name==='*'?{kind:'namespace',record:other}:exported(other,name,seen);}
  function binding(r,name,seen) {
    const key=`${r.file.path}:binding:${name}`;if(seen.has(key))return unknown('Binding cycle');seen=new Set(seen).add(key);
    const b=r.bindings.get(name);if(!b)return unknown('Binding was not declared');if(r.mutated.has(name))return unknown('Binding or one of its properties is assigned');
    if(b.import)return imported(r,b.import,b.name,seen);if(!b.constant)return unknown('Mutable binding');return value(r,b.expr,seen);
  }
  function value(r,n,seen) {
    if(!n)return unknown('Missing expression');
    const l=literal(n);if(l.known)return {kind:'literal',value:l.value};
    if(n.type==='Identifier')return binding(r,n.name,seen);
    if(['TSAsExpression','TSSatisfiesExpression','TSNonNullExpression'].includes(n.type))return value(r,n.expression,seen);
    if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return {kind:'function',ast:n,modulePath:r.file.path};
    if(n.type==='CallExpression'&&memberName(n.callee)==='require'&&!r.shadowed.has('require')){const other=resolvePath(r,literal(n.arguments[0]).value,'require');return !other?unknown('Require target is unresolved'):other.exports.has('default')?exported(other,'default',seen):{kind:'namespace',record:other};}
    if(n.type==='CallExpression'){
      const factory=value(r,n.callee,new Set(seen));
      if(factory.kind!=='function'||factory.ast.async||factory.ast.generator)return unknown('Call result is not a statically characterized synchronous factory');
      const key=`${factory.modulePath}:factory:${factory.ast.start}`;if(seen.has(key))return unknown('Factory return cycle');
      const body=factory.ast.body,statements=body?.type==='BlockStatement'?body.body.filter(s=>s.type!=='EmptyStatement'):null,returned=statements?.length===1&&statements[0].type==='ReturnStatement'?statements[0].argument:body?.type!=='BlockStatement'?body:null;
      if(!returned||!['FunctionExpression','ArrowFunctionExpression'].includes(returned.type))return unknown('Factory does not have one unconditional function-literal result');
      return {...value(records.get(factory.modulePath)??r,returned,new Set(seen).add(key)),returnedFunctionCandidate:true};
    }
    if(n.type==='MemberExpression') {
      const object=value(r,n.object,seen),key=n.computed?literal(n.property):{known:true,value:n.property.name};if(!key.known)return unknown('Computed property key');
      return object.kind==='namespace'?exported(object.record,String(key.value),seen):object.kind==='object'?object.fields.get(String(key.value))??unknown('Property not observed'):unknown('Object target unresolved');
    }
    if(n.type==='ObjectExpression') {
      const fields=new Map();let complete=true;
      for(const p of n.properties) {
        if(p.type==='SpreadElement'){const spread=value(r,p.argument,new Set(seen));if(spread.kind==='object'){for(const [k,v]of spread.fields)fields.set(k,v);complete&&=spread.complete;}else if(spread.kind==='namespace'){for(const key of exportNames(spread.record))fields.set(key,exported(spread.record,key,new Set(seen)));}else complete=false;continue;}
        const key=p.computed?literal(p.key):{known:true,value:p.key.name??p.key.value};if(!key.known){complete=false;continue;}fields.set(String(key.value),p.type==='ObjectMethod'?{kind:'function',ast:p,modulePath:r.file.path}:value(r,p.value,new Set(seen)));
      }
      return {kind:'object',fields,complete,range:sourceRange(n),modulePath:r.file.path};
    }
    if(n.type==='ArrayExpression')return {kind:'object',fields:new Map(n.elements.map((element,i)=>[String(i),element?.type==='SpreadElement'?unknown('Array spread position is not statically fixed'):value(r,element,new Set(seen))])),complete:!n.elements.some(e=>e?.type==='SpreadElement'),range:sourceRange(n),modulePath:r.file.path};
    return unknown(`Unsupported static expression: ${n.type}`);
  }
  function shape(v,range) {
    const fields={};
    function flatten(o,prefix='') {for(const [key,entry]of o.fields){const p=prefix?`${prefix}.${key}`:key;fields[p]=entry.kind==='literal'?{availability:'literal',value:entry.value}:{availability:'unknown',reason:entry.reason??'Value is not a primitive literal'};if(entry.kind==='object')flatten(entry,p);}}
    if(v.kind==='object')flatten(v);
    return {fields,complete:v.kind==='object'&&v.complete,source_range:range??v.range??null,origin_path:v.modulePath??null,value_kind:v.kind,literal_value:v.kind==='literal'?v.value:null};
  }
  // Keep direct AST observations but replace their shapes with artifact-wide static resolution.
  for(const r of records.values())for(const name of exportNames(r)) {
    const v=exported(r,name),definition=r.exports.get(name),location=definition?.location??r.ast.program,existing=appNodes.find(n=>n.kind==='javascript-module'&&properties(n).path===r.file.path&&properties(n).export_name===name),props={path:r.file.path,export_name:name,export_shape:shape(v,sourceRange(location)),resolution:v.kind==='unknown'?'unresolved':'resolved-static'};
    if(existing)existing.observations=[observation(name,props,fact(r.file.sha256,r.file.path,'static-relationship-inference','inferred',{kind:'source-range',source:r.file.path,...sourceRange(location)}))];
    else {const n=node('javascript-module',localIdentity(rootHash,'export',`${r.file.path}:${name}`),name,props,fact(r.file.sha256,r.file.path,'static-relationship-inference','inferred'));appNodes.push(n);appEdges.push(edge(r.appNode,n,'exposes',n.observations[0].evidence));}
  }
  // Imported function aliases are joined only through the exact lexical binding selected by the AST visitor.
  for(const call of semantics.nodes.filter(n=>n.kind==='call-site'&&n.properties.callee_binding_id)) {
    const b=semantics.nodes.find(n=>n.node_id===call.properties.callee_binding_id),r=records.get(call.identity.module_path);if(!r||!b||b.function_node_id!==null||b.properties.initialization_start>=call.properties.source_start)continue;
    let target=binding(r,b.label,new Set());
    const parts=call.properties.callee.split('.');
    if(parts.length>1)for(const part of parts.slice(1)){if(target.kind==='namespace')target=exported(target.record,part);else if(target.kind==='object')target=target.fields.get(part)??unknown('Property not observed');else break;}
    if(target.kind!=='function')continue;
    const f=semantics.nodes.find(n=>n.kind==='function'&&n.identity.module_path===target.modulePath&&canonical(n.identity.source_range)===canonical(sourceRange(target.ast)));if(!f||semantics.relations.some(e=>e.source_node_id===call.node_id&&e.target_node_id===f.node_id&&e.relation==='calls'))continue;
    const context=semantics.evidence_contexts.find(e=>e.context_id===call.evidence.context_id),derived={...context,authority:'static-relationship-inference',state:'inferred',confidence:'medium'};derived.context_id=id('jsrg_evidence',derived);if(!semantics.evidence_contexts.some(c=>c.context_id===derived.context_id))semantics.evidence_contexts.push(derived);
    const evidence={...call.evidence,context_id:derived.context_id},base={source_node_id:call.node_id,target_node_id:f.node_id,relation:'calls',resolution:target.returnedFunctionCandidate?'candidate':'resolved',properties:{cross_module:call.identity.module_path!==f.identity.module_path,...(target.returnedFunctionCandidate?{returned_function_candidate:true}: {})},evidence};semantics.relations.push({...base,relation_id:id('jsrg_relation',base)});
    for(const argument of semantics.relations.filter(e=>e.target_node_id===call.node_id&&e.relation==='consumed-by'&&e.properties.argument_index!==undefined)){const p=semantics.nodes.find(n=>n.kind==='parameter'&&n.function_node_id===f.node_id&&n.properties.index===argument.properties.argument_index);if(p){const rel={source_node_id:argument.source_node_id,target_node_id:p.node_id,relation:'argument-to-parameter',resolution:target.returnedFunctionCandidate?'candidate':'resolved',properties:{cross_module:true},evidence};semantics.relations.push({...rel,relation_id:id('jsrg_relation',rel)});}}
    for(const returned of semantics.nodes.filter(n=>n.kind==='return-site'&&n.function_node_id===f.node_id)){const rel={source_node_id:returned.node_id,target_node_id:call.node_id,relation:'returns-to-call',resolution:'candidate',properties:{cross_module:call.identity.module_path!==f.identity.module_path,conditional_execution_unknown:true},evidence};semantics.relations.push({...rel,relation_id:id('jsrg_relation',rel)});}
    if(!target.returnedFunctionCandidate)semantics.unknowns=semantics.unknowns.filter(u=>!(u.node_id===call.node_id&&u.reason==='dynamic-call'));
  }
  const functionByNode=new Map(semantics.nodes.map(n=>[n.node_id,n.function_node_id]));
  for(const f of semantics.fingerprints){f.components.relation_shape_sha256=sha(semantics.relations.filter(r=>functionByNode.get(r.source_node_id)===f.function_node_id).map(r=>r.relation).sort());f.fingerprint_sha256=sha(f.components);const {fingerprint_id,fingerprint_sha256,...base}=f;f.fingerprint_id=id('jsrg_fingerprint',base);}
}
