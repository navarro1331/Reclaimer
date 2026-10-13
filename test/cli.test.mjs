import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCommand,jsonFields,cliRouteCatalog } from '../lib/cli-routes.mjs';
import { tools,validate } from '../lib/contracts.mjs';
import cliContracts from '../lib/cli-contracts.json' with {type:'json'};

const hash='1'.repeat(64);
function schemaValue(schema,root=schema,depth=0) {
  if(depth>80)throw new Error('Unbounded public schema');
  if(schema.$ref)return schemaValue({...root.$defs[schema.$ref.split('/').at(-1)],...Object.fromEntries(Object.entries(schema).filter(([k])=>k!=='$ref'))},root,depth+1);
  if(schema.const!==undefined)return schema.const;if(schema.default!==undefined)return structuredClone(schema.default);if(schema.enum)return schema.enum[0];
  if(schema.anyOf||schema.oneOf)return schemaValue((schema.anyOf??schema.oneOf)[0],root,depth+1);
  if(schema.type==='object'||schema.properties) {
    const required=schema.required??[],out={};for(const key of required)out[key]=schemaValue(schema.properties[key],root,depth+1);
    if(!required.length&&schema.minProperties)for(const key of Object.keys(schema.properties??{}).slice(0,schema.minProperties))out[key]=schemaValue(schema.properties[key],root,depth+1);
    return out;
  }
  if(schema.type==='array')return Array.from({length:schema.minItems??0},()=>schemaValue(schema.items,root,depth+1));
  if(schema.type==='integer'||schema.type==='number')return Math.max(schema.minimum??0,(schema.exclusiveMinimum??-1)+1);
  if(schema.type==='boolean')return false;if(schema.type==='null')return null;
  if(schema.type==='string') {
    if(schema.pattern?.includes('[a-f0-9]{64}')){const prefix=/\^([A-Za-z_]+)_\[/.exec(schema.pattern)?.[1];return prefix?`${prefix}_${hash}`:hash;}
    if(schema.pattern?.includes('0x'))return schema.pattern.includes('{8}')?'0x00000001':'0x0001';
    if(schema.pattern?.includes('\\d{4}')||schema.pattern?.includes('T(?'))return '2026-10-12T12:00:00Z';
    return 'fresh'.padEnd(schema.minLength??0,'x');
  }
  return {};
}
function routeOperation(name){return cliRouteCatalog.find(c=>c.name===name).operation;}
function commandFixture(def) {
  const name=def.name,op=routeOperation(name),tool=tools.get(op),api=tool?schemaValue(tool.inputSchema):null,args=schemaValue(def.schema?.args??{type:'object'}),options=schemaValue(def.schema?.options??{type:'object'});
  if(args.path!==undefined)args.path='fresh.bin';if(args.endpoint!==undefined)args.endpoint='http://127.0.0.1:9222';if(args.address!==undefined)args.address='0x1000';
  if(['decompile','function','instructions'].includes(name))options.procedure='0x1000';
  if(name==='capture-native-ui-scenario')options.steps=JSON.stringify(schemaValue(tool.inputSchema.properties.steps,tool.inputSchema));
  if(name==='search')args.pattern='fresh';if(name==='trace')args.query='fresh';
  for(const field of jsonFields(name).args) {
    if(field==='inputJson'||field==='scenario')args[field]=JSON.stringify(api);
    else if(field==='beforeJson')args[field]=JSON.stringify(schemaValue(tool.inputSchema.properties.before,tool.inputSchema));
    else if(field==='afterJson')args[field]=JSON.stringify(schemaValue(tool.inputSchema.properties.after,tool.inputSchema));
    else if(field==='traceSpec')continue;
    else if(field==='left'||field==='right')args[field]=JSON.stringify(schemaValue(tools.get(name==='compare'?'compare_functions':op).inputSchema.properties[field],tools.get(name==='compare'?'compare_functions':op).inputSchema));
  }
  return {args,options};
}
test('all 95 CLI routes prepare valid protocol requests or explicit local/prerequisite plans',()=> {
  assert.equal(cliContracts.commands.length,95);const failures=[];
  for(const definition of cliContracts.commands) {
    try {
      const {args,options}=commandFixture(definition),route=prepareCommand(definition.name,args,options);
      if(route.operation===null){assert.equal(route.parameters.command,definition.name);continue;}
      if(route.openTarget)assert.equal(validate('open_binary','input',route.openTarget).valid,true);
      if(route.preCalls){for(const call of route.preCalls)assert.equal(validate(call.operation,'input',call.parameters).valid,true);assert.deepEqual(route.preCalls.map(c=>c.assign),['left','right']);}
      else {const valid=validate(route.operation,'input',route.parameters);assert.equal(valid.valid,true,JSON.stringify(valid.errors));}
    }catch(error){failures.push({command:definition.name,message:error.message,details:error.details});}
  }
  assert.deepEqual(failures,[]);
});
test('endpoint routes distinguish CDP and V8 while preserving explicit origin limits',()=> {
  const web=prepareCommand('inspect-web-page',{endpoint:'http://127.0.0.1:9222',targetId:'fresh'}, {allowedOrigins:['https://fresh.example'],includeScriptSources:true});
  assert.equal(web.parameters.cdp_endpoint,'http://127.0.0.1:9222');assert.deepEqual(web.parameters.allowed_origins,['https://fresh.example']);assert.equal(web.parameters.include_script_sources,true);
  const v8=prepareCommand('observe-javascript-runtime',{endpoint:'http://127.0.0.1:9229',targetId:'runtime'}, {runtimeKind:'node',observationMs:25});assert.equal(v8.parameters.inspector_endpoint,'http://127.0.0.1:9229');assert.equal(v8.parameters.runtime_kind,'node');assert.equal(v8.parameters.observation_ms,25);
});
test('native selection and container inner paths remain separate from opened target identity',()=> {
  const native=prepareCommand('decompile',{path:'fresh.exe',address:'0x1000'},{procedure:'namedEntry',provider:'ghidra',snapshot:'fresh.snapshot'});assert.equal(native.parameters.procedure,'namedEntry');assert.deepEqual(native.openTarget,{path:'fresh.exe',provider_id:'ghidra',snapshot_path:'fresh.snapshot'});
  const plist=prepareCommand('inspect-plist',{path:'fresh.app'},{relativePath:'Contents/Info.plist'});assert.deepEqual(plist.openTarget,{path:'fresh.app'});assert.equal(plist.parameters.path,'Contents/Info.plist');
  const archive=prepareCommand('inspect-keyed-archive',{path:'fresh.app',archive:'Resources/scene.nib'},{root:'root'});assert.equal(archive.parameters.path,'Resources/scene.nib');assert.equal(archive.parameters.root,'root');
});
test('nested firmware ranges and source maps preserve exact argument values',()=> {
  const extract=prepareCommand('extract-firmware',{path:'fresh.fw',outputDirectory:'fresh-out'},{offset:8,length:32,maxDepth:2,maxOutputFiles:10});assert.deepEqual(extract.parameters.range,{offset:8,length:32});assert.equal(extract.parameters.max_output_files,10);
  const source=prepareCommand('trace-web-source-location',{manifestPath:'fresh.json',scriptIndex:2,sourceMapPath:'fresh.map',sourceMapUrl:'https://fresh.example/code.map',line:10,column:3});assert.deepEqual(source.parameters.source_map,{path:'fresh.map',url:'https://fresh.example/code.map'});assert.deepEqual(source.parameters.generated_position,{line:10,column:3});
  const imports=prepareCommand('trace-web-module-imports',{manifestPath:'fresh.json',scriptIndex:0},{importMapPath:'imports.json',importMapBaseUrl:'https://fresh.example/'});assert.deepEqual(imports.parameters.import_map,{path:'imports.json',base_url:'https://fresh.example/'});
});
test('preparation rejects malformed JSON, unknown argc/options and unsupported partial combinations',()=> {
  assert.throws(()=>prepareCommand('analyze',{path:'fresh',extra:'bad'}),/args do not satisfy/);assert.throws(()=>prepareCommand('analyze',{path:'fresh'},{unknown:true}),/options do not satisfy/);
  assert.throws(()=>prepareCommand('compare-source-to-bundle',{inputJson:'{ malformed'}),/resolved JSON/);
  assert.throws(()=>prepareCommand('extract-firmware',{path:'fresh',outputDirectory:'out'},{offset:4}),/explicit length/);
  assert.throws(()=>prepareCommand('trace-web-module-imports',{manifestPath:'fresh',scriptIndex:0},{importMapPath:'fresh'}),/together/);
  assert.throws(()=>prepareCommand('capture-native-ui-scenario',{path:'fresh'},{pid:10,windowId:20}),/valid public MCP request/);
  assert.throws(()=>prepareCommand('observe-native-ui',{path:'fresh'},{pid:10,windowId:20,steps:'[]'}),/no corresponding MCP field/);
});
test('JSON preparation is pure and caller inputs remain unchanged',()=> {
  const args={path:'fresh.js'},options={artifactFormat:'directory'},before=JSON.stringify({args,options}),a=prepareCommand('analyze-javascript-application',args,options),b=prepareCommand('analyze-javascript-application',args,options);
  assert.deepEqual(a,b);assert.equal(JSON.stringify({args,options}),before);assert.equal(a.parameters.input_path,'fresh.js');assert.equal(a.parameters.integrity_policy,'fail');assert.deepEqual(jsonFields('observe-native-calls'),{args:['inputJson'],options:[]});
});
