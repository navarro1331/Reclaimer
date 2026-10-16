import { parseSource,LIMITS,literal } from './javascript-model.mjs';

/** Discover literal wrapper tables; extraction retains wrapper context and never invokes a loader. */
export function discoverBundleModules(text,filename,mode){
  if(mode==='structural')return [];
  const ast=parseSource(text,filename);if(ast.errors.length)throw new Error('Bundle discovery requires a fully parsed input');
  const modules=[],seen=new Set();let visited=0;
  const functionLike=n=>n&&['FunctionExpression','ArrowFunctionExpression'].includes(n.type);
  function table(n,reason){
    if(!n||!['ArrayExpression','ObjectExpression'].includes(n.type))return;
    const entries=n.type==='ArrayExpression'?n.elements.map((value,key)=>({value,key:String(key)})):n.properties.filter(p=>p.type==='ObjectProperty').map(p=>({value:p.value,key:p.computed?literal(p.key).value:p.key.name??p.key.value}));
    for(const {key,value}of entries){
      const tuple=value?.type==='ArrayExpression'&&functionLike(value.elements[0])&&value.elements[1]?.type==='ObjectExpression',wrapper=tuple?value.elements[0]:value;
      if(!functionLike(wrapper)||key===undefined||seen.has(wrapper.start))continue;
      // Heuristics require conventional positional CommonJS parameters. Inspection also exposes other literal function tables.
      const parameters=wrapper.params.map(p=>p.type==='Identifier'?p.name:null),commonjs=parameters.includes('module')&&parameters.includes('exports')||parameters.includes('require')&&parameters.includes('exports');
      if(mode==='heuristic'&&!commonjs)continue;
      const dependencies=tuple?Object.fromEntries(value.elements[1].properties.filter(p=>p.type==='ObjectProperty'&&!p.computed&&literal(p.value).known).map(p=>[p.key.name??p.key.value,literal(p.value).value])):{};
      seen.add(wrapper.start);modules.push({key:String(key),start:wrapper.start,end:wrapper.end,contextStart:n.start,contextEnd:n.end,parameters,dependencies,discovery:tuple?'literal-commonjs-tuple':reason,confidence:commonjs?'conventional-wrapper-candidate':'literal-function-table-candidate'});
      if(modules.length>=LIMITS.files)throw new Error('Bundle wrapper discovery reached the module budget');
    }
  }
  function visit(n,depth=0){if(!n?.type)return;if(++visited>LIMITS.astNodes||depth>LIMITS.depth)throw new Error('Bundle wrapper discovery reached the AST budget');
    if(['CallExpression','NewExpression'].includes(n.type))for(const argument of n.arguments)table(argument,'literal-loader-argument');
    if(mode==='inspection'&&n.type==='VariableDeclarator')table(n.init,'literal-assigned-table');
    for(const [key,value]of Object.entries(n))if(!['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(key)){if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,depth+1);}else if(value?.type)visit(value,depth+1);}
  }
  visit(ast.program);return modules;
}

/** Rebuild an explicitly selected, closed synchronous CommonJS table profile. */
export function reconstructCommonJsTable(text,filename,candidates){
 if(!candidates.length||candidates.some(c=>c.contextStart!==candidates[0].contextStart||c.contextEnd!==candidates[0].contextEnd))return null;
 const globals=new Set(['undefined','NaN','Infinity','Math','JSON','Object','Array','Number','String','Boolean','BigInt','RegExp','Error','TypeError','RangeError','Buffer','console']);
 const permitted=new Set(['FunctionExpression','ArrowFunctionExpression','BlockStatement','VariableDeclaration','VariableDeclarator','ExpressionStatement','ReturnStatement','ThrowStatement','IfStatement','Identifier','StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','ObjectExpression','ObjectProperty','ArrayExpression','MemberExpression','CallExpression','AssignmentExpression','BinaryExpression','LogicalExpression','UnaryExpression','ConditionalExpression','EmptyStatement']);
 const rows=[];let work=0;
 for(const candidate of candidates){
  const source=text.slice(candidate.start,candidate.end),ast=parseSource(`(${source});`,filename),fn=ast.program.body[0]?.expression;
  if(!fn||!['FunctionExpression','ArrowFunctionExpression'].includes(fn.type)||fn.async||fn.generator||fn.params.some(p=>p.type!=='Identifier'))return null;
  const names=fn.params.map(p=>p.name);if(![['require','module','exports'],['module','exports','require'],['module','exports']].some(profile=>JSON.stringify(profile)===JSON.stringify(names)))return null;
  const declared=new Set(names);let safe=true;
  function visit(n,parent=null,key='',stage=0){
   if(!n?.type)return;if(++work>LIMITS.astNodes)throw new Error('CommonJS reconstruction AST budget exceeded');
   if(!permitted.has(n.type)||n!==fn&&['FunctionExpression','ArrowFunctionExpression'].includes(n.type)){safe=false;return;}
   if(n.type==='VariableDeclarator'){if(n.id.type!=='Identifier'||stage===0&&declared.has(n.id.name)){safe=false;return;}if(stage===0)declared.add(n.id.name);}
   if(stage===1&&n.type==='Identifier'){
    const property=key==='property'&&parent?.type==='MemberExpression'&&!parent.computed||key==='key'&&parent?.type==='ObjectProperty'&&!parent.computed&&!parent.shorthand;
    if(!property&&!declared.has(n.name)&&!globals.has(n.name))safe=false;
   }
   if(n.type==='MemberExpression'&&n.object?.name==='require')safe=false;
   if(n.type==='CallExpression'&&n.callee?.name==='require'&&(n.arguments.length!==1||!literal(n.arguments[0]).known))safe=false;
   for(const [childKey,value]of Object.entries(n))if(!['loc','extra','comments','leadingComments','trailingComments','innerComments'].includes(childKey)){if(Array.isArray(value)){for(const child of value)if(child?.type)visit(child,n,childKey,stage);}else if(value?.type)visit(value,n,childKey,stage);}
  }
  visit(fn);if(!safe)return null;
  // Declaration collection and reference validation are separate bounded passes.
  const before=new Set(declared);visit(fn,null,'',1);if(!safe||before.size!==declared.size)return null;
  rows.push({key:candidate.key,source,parameters:names,dependencies:candidate.dependencies});
 }
 if(new Set(rows.map(r=>r.key)).size!==rows.length)return null;
 const table=rows.map(r=>`[${JSON.stringify(r.key)}]:{fn:(${r.source}),parameters:${JSON.stringify(r.parameters)},dependencies:JSON.parse(${JSON.stringify(JSON.stringify(r.dependencies))})}`).join(',\n');
 return {profile:'closed-synchronous-commonjs-table-v1',keys:rows.map(r=>r.key),source:`'use strict';\n// Independently generated finite CommonJS loader. Entry-point and execution equivalence are unverified.\nconst table={${table}};\nconst cache=Object.create(null);\nfunction load(id){id=String(id);if(Object.hasOwn(cache,id))return cache[id].exports;if(!Object.hasOwn(table,id))throw new Error('Uncaptured module '+id);const row=table[id],module={exports:{}};cache[id]=module;const require=specifier=>load(Object.hasOwn(row.dependencies,specifier)?row.dependencies[specifier]:specifier);try{row.fn.apply(module.exports,row.parameters.map(name=>name==='require'?require:name==='module'?module:module.exports));return module.exports;}catch(error){delete cache[id];throw error;}}\nmodule.exports={load,keys:Object.keys(table)};\n`};
}
