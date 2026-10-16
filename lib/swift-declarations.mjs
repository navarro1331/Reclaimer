import {readDeclarationBitstream} from './swift-declarations-bitstream.mjs';
import {projectSwiftModule} from './swift-declaration-projector.mjs';
import {declarationBudget} from './swift-declaration-budget.mjs';

export function recoverSwiftDeclarations(bytes,{signal,tick,maxRecords=20000,budget}={}) {
 const request=budget??declarationBudget({signal,tick,maxRecords});request.charge('bytes',bytes.length);
 let offset=0;const modules=[];
 while(offset<bytes.length){signal?.throwIfAborted();const remaining=bytes.subarray(offset),parsed=readDeclarationBitstream(remaining,{signal,tick:()=>request.record(),maxRecords,allowTrailingModules:true,budget:request});if(!parsed.bytes)throw new Error('Swift serialized module has no bounded extent');modules.push(projectSwiftModule(parsed,remaining.subarray(0,parsed.bytes),{offset,signal,budget:request}));offset+=parsed.bytes;if(offset%4)throw new Error('Embedded Swift module is not aligned');}
 signal?.throwIfAborted();
 return {modules,declarations:selectEmbeddedDeclarations(modules),budget_used:{...request.used},limitations:['Selected serialized declaration grammars are qualified for exact Swift module formats 0.871, 0.903 and 0.944. Other minors remain unsupported. Representable nominal and genuine top-level declarations are projected; member and extension facts retain explicit raw dispositions.','Function, generic, dependent member, metatype and source-level collection type recovery is finite. SIL, opaque/archetype, pack expansion, inline array and lifetime dependence grammars remain partial or unsupported.','A decoded serialized declaration does not establish linked artifact membership, runtime use or source-file authority. Paths stored by a module are never read.']};
}

export function selectEmbeddedDeclarations(modules) {
 const groups=new Map();for(const module of modules){const group=groups.get(module.name)??[];group.push(module);groups.set(module.name,group);}
 for(const group of groups.values()){const hashes=new Set(group.map(m=>m.sha256));if(hashes.size>1){for(const module of group){module.conflicting=true;if(!module.issues.some(i=>i.reason==='Same embedded module identity has conflicting retained bytes'))module.issues.push({reason:'Same embedded module identity has conflicting retained bytes'});}}else for(let i=1;i<group.length;i++)group[i].duplicate=true;}
 return modules.filter(m=>!m.conflicting&&!m.duplicate).flatMap(m=>m.declarations.map(d=>d.declaration));
}
