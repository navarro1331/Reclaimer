import {decodeManagedAuxSignature} from './artifact-managed-values.mjs';
import {formatBudget} from './artifact-format-budget.mjs';

/** Preserve auxiliary ECMA blob facts separately from the frozen member DTO. */
export function managedAuxiliarySignatures(parsed,{signal,budget=formatBudget({signal})}={}){
 const records=[];
 for(const [table,name,column,kind]of [[17,'StandAloneSig',0,'standalone'],[23,'Property',2,'property'],[27,'TypeSpec',0,'type-spec'],[43,'MethodSpec',1,'method-spec']]){
  for(const row of parsed.tables[table]??[]){budget.work();budget.take('records');signal?.throwIfAborted();const bytes=parsed.blob(row.v[column]);budget.take('string_bytes',bytes.length*2);const decoded=decodeManagedAuxSignature(bytes,{kind,signal,budget}),record={table:name,token:'0x'+((table<<24)|row.row).toString(16).padStart(8,'0'),row_offset:row.offset,blob_index:row.v[column],blob_hex:bytes.toString('hex'),decoded};if(table===23)record.name=parsed.string(row.v[1]);if(table===43){const base=row.v[0],targetTable=base&1?10:6;record.method_token='0x'+((targetTable<<24)|(base>>>1)).toString(16).padStart(8,'0');}budget.output(record);records.push(record);}
 }
 signal?.throwIfAborted();return records;
}
