import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from '../lib/core.mjs';
import {recoverNativeAotDetailed} from '../lib/native-aot.mjs';
import {recoveryPeModel} from './native-aot-recovery-build.mjs';
import {buildAotExtension} from './native-aot-extension-build.mjs';
import {engine} from '../lib/engine.mjs';

test('actual owned NativeAOT extension specimen associates a two-argument owner and readonly field',{skip:process.env.REAL_RUN_NATIVE_VARIATIONS!=='1',timeout:240000},async t=>{
 const receipt=await buildAotExtension({signal:t.signal}),bytes=await fs.readFile(receipt.retained_target),parsed=recoveryPeModel(bytes),detail=recoverNativeAotDetailed(bytes,parsed.model,digest(bytes),parsed.architecture,{signal:t.signal}),inventory=detail.identity_recovery.modules[0],selected=inventory.types.filter(type=>type.qualified_name.includes('Reclaimer.Owned.Extension'));
 const observations={receipt,types:selected,methods:inventory.methods.filter(method=>method.qualified_name.includes('Reclaimer.Owned.Extension')),fields:inventory.fields.filter(field=>field.qualified_name.includes('Reclaimer.Owned.Extension')),constructed_candidates:inventory.constructed_candidates,diagnostics:inventory.diagnostics,source_preserved:digest(await fs.readFile(receipt.retained_target))===receipt.artifact_sha256};
 await fs.writeFile(path.join(path.dirname(receipt.receipt_path),receipt.run_id+'-reader-observations.json'),JSON.stringify(observations,null,2)+'\n',{flag:'wx'});
 const constructed=selected.find(type=>type.qualified_name==='Reclaimer.Owned.Extension.Duo`2<System.Int32,System.Int64>'&&type.binding_status==='associated');assert.ok(constructed);assert.deepEqual(constructed.generic_arguments.map(argument=>argument.qualified_name),['System.Int32','System.Int64']);assert.ok(constructed.source_bindings.some(binding=>binding.role==='win-x64-dotnet8-relative-generic-argument-composition'));
 const immutable=inventory.fields.find(field=>field.qualified_name==='Reclaimer.Owned.Extension.Ledger.Immutable');assert.equal(immutable.binding_status,'associated');assert.equal(immutable.is_init_only,true);
 const echo=inventory.methods.find(method=>method.qualified_name===constructed.qualified_name+'.Echo');assert.equal(echo.binding_status,'associated');assert.match(echo.target_address,/^0x/);assert.equal(inventory.methods.find(method=>method.qualified_name===constructed.qualified_name+'.Project').target_address,null);
 assert.equal(inventory.fields.find(field=>field.qualified_name==='Reclaimer.Owned.Extension.Ledger.Global').binding_status,'metadata-only');
 const ctx=await engine({signal:t.signal});try{await ctx.call('open_binary',{path:receipt.retained_target});const load=await ctx.call('inspect_native_load_image',{}),datatype=await ctx.call('inspect_native_data_type',{address:constructed.method_table_address});assert.equal(datatype.normalized_result.name,constructed.qualified_name);assert.equal(datatype.normalized_result.metadata_recovery.original_name,null);assert.equal(datatype.raw_result.nativeaot_identity.generic_arguments.length,2);const right=datatype.raw_result.nativeaot_members.fields.find(field=>field.name==='Right');assert.equal(right.offset_bytes,8);assert.equal(right.is_init_only,true);right.is_init_only=false;const again=await ctx.call('inspect_native_data_type',{type:datatype.normalized_result.id});assert.equal(again.raw_result.nativeaot_members.fields.find(field=>field.name==='Right').is_init_only,true);observations.public_queries={load_evidence_id:load.evidence_id,type_evidence_id:datatype.evidence_id,name:datatype.normalized_result.name,original_name:null,readonly_offset:right.offset_bytes};}finally{if(ctx.target){const signal=ctx.signal;ctx.signal=undefined;try{await ctx.call('close_binary',{});}finally{ctx.signal=signal;}}}
 observations.success=true;assert.equal(digest(await fs.readFile(receipt.retained_target)),receipt.artifact_sha256);await fs.writeFile(path.join(path.dirname(receipt.receipt_path),receipt.run_id+'-success.json'),JSON.stringify(observations,null,2)+'\n',{flag:'wx'});
});
