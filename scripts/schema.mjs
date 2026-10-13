import { tools, outputSchema, resolveSchema } from '../lib/contracts.mjs';
const [name, side='normalized', ...path] = process.argv.slice(2);
const root = tools.get(name)[side==='input'?'inputSchema':'outputSchema'];
let node = side==='normalized'?outputSchema(name):root;
for(const key of path) {
 node=resolveSchema(node,root);
 if(key==='oneOf'||key==='anyOf')node=node.oneOf??node.anyOf;
 else {while(node[key]===undefined&&(node.oneOf||node.anyOf))node=resolveSchema((node.oneOf??node.anyOf)[0],root);node=node[key];}
}
function expand(value, depth=0){
 if(!value||typeof value!=='object'||depth>16)return value;
 if(Array.isArray(value))return value.map(v=>expand(v,depth+1));
 value=resolveSchema(value,root);
 return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='$defs').map(([k,v])=>[k,expand(v,depth+1)]));
}
console.log(JSON.stringify(expand(node),null,2));
