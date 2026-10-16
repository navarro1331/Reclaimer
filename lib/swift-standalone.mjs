import {digest} from './core.mjs';
import {declarationBudget} from './swift-declaration-budget.mjs';
import {recoverSwiftDeclarations} from './swift-declarations.mjs';

const magic=Buffer.from([0xe2,0x9c,0xa8,0x0e]);
export const isStandaloneSwiftModule=bytes=>Buffer.isBuffer(bytes)&&bytes.length>=4&&bytes.subarray(0,4).equals(magic);

// A standalone module is a declaration database, not a linked native image.
// Locations identify selected-file bits and never invent runtime addresses.
export function recoverStandaloneSwiftModule(bytes,{signal,maxRecords=20000}={}){
 signal?.throwIfAborted();if(!isStandaloneSwiftModule(bytes))throw new Error('Standalone Swift serialized module signature is absent');
 const budget=declarationBudget({signal,maxRecords}),parsed=recoverSwiftDeclarations(bytes,{signal,maxRecords,budget}),source={format:'swift-serialized-module',sha256:digest(bytes),size_bytes:bytes.length,runtime_addresses:'unavailable'};budget.output(source);
 for(const module of parsed.modules){
  const moduleLocation={address:null,file_offset:module.section_offset};budget.output(moduleLocation);module.location=moduleLocation;
  for(const row of [...module.declarations,...module.decoded_declarations]){
   signal?.throwIfAborted();const location={address:null,file_offset:module.section_offset+Math.floor(row.bit_offset/8),bit_in_byte:row.bit_offset%8};
   if(location.file_offset<module.section_offset||location.file_offset>=module.section_offset+module.bytes)throw new Error('Standalone Swift declaration binding escapes selected module');
   budget.output(location);row.location=location;
  }
 }
 const issues=parsed.modules.flatMap(module=>module.issues.map(issue=>({facet:'swift-declarations',address:null,...issue}))),limitations=[...parsed.limitations,'Standalone serialized declarations have no native image addresses, ABI dispatch tables, linked target membership or runtime field layouts.'];
 signal?.throwIfAborted();
 return {source_identity:source,source_sha256:source.sha256,objc_classes:[],objc_protocols:[],objc_categories:[],swift_types:[],swift_conformances:[],swift_dispatch_slots:[],swift_ast_modules:parsed.modules,swift_declarations:parsed.declarations,recorded_symbols:[],relative_pointers:[],object_relocations:[],issues,records:budget.used.records,budget_used:{...budget.used},limitations,location:address=>{if(address!==null)throw new Error('Standalone Swift declarations have no native address mapping');return {address:null,file_offset:null};}};
}
