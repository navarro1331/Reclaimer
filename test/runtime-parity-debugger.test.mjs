import { runtimePython } from './runtime-provider-prerequisites.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {objectiveCRegexPython} from '../lib/process-debugger.mjs';

test('owned Objective-C breakpoint regex accepts selector-only instance/class requests and preserves caller literals',async t=>{
 const python=await runtimePython(t);if(!python)return;
 const program='import re,json\n'+objectiveCRegexPython+String.raw`
cases=[
 ({'selector':'toggle:'}, '-[Alpha toggle:]', True),
 ({'selector':'toggle:'}, '+[Beta toggle:]', True),
 ({'selector':'toggle:'}, '-[Alpha toggleMore:]', False),
 ({'selector':'toggle:'}, '-[Alpha Beta toggle:]', False),
 ({'selector':'toggle:', 'method_type':'instance'}, '-[Alpha toggle:]', True),
 ({'selector':'toggle:', 'method_type':'instance'}, '+[Alpha toggle:]', False),
 ({'selector':'toggle:', 'method_type':'class'}, '+[Alpha toggle:]', True),
 ({'selector':'toggle:', 'method_type':'class'}, '-[Alpha toggle:]', False),
 ({'selector':'literal.*:', 'class_name':'Owned.Widget', 'method_type':'class'}, '+[Owned.Widget literal.*:]', True),
 ({'selector':'literal.*:', 'class_name':'Owned.Widget', 'method_type':'class'}, '+[OwnedXWidget literalABC:]', False),
 ({'selector':'toggle:', 'class_name':'Alpha'}, '-[Alpha toggle:]', True),
 ({'selector':'toggle:', 'class_name':'Alpha'}, '-[Beta toggle:]', False)
]
for request,name,expected in cases:
 pattern=objective_c_breakpoint_regex(request)
 assert bool(re.fullmatch(pattern,name))==expected, (request,name,pattern,expected)
print(json.dumps({'matching_assertions':len(cases),'live_objective_c_provider':False}))
`;
 const result=spawnSync(python.executable,[...python.args,'-c',program],{shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:65536,env:process.platform==='win32'?{SystemRoot:process.env.SystemRoot??'C:\\Windows'}:{}});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{matching_assertions:12,live_objective_c_provider:false});
});
