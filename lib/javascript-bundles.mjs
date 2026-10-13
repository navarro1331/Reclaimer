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
