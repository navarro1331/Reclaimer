// Finite record dialects. Each entry is separately qualified by owned producer
// bytes and the corresponding official release's ModuleFormat/record table.
const profiles=new Map([
 [871,Object.freeze({minor:871,release:'6.0.3',legacy:true,functionParameterFields:12,sendingParameter:11,isolationOffset:3,parameterFields:15,defaultArgument:11,actorIsolationMax:6,inheritedDivisor:8})],
 [903,Object.freeze({minor:903,release:'6.1.3',legacy:false,functionParameterFields:11,sendingParameter:10,isolationOffset:3,parameterFields:15,defaultArgument:11,actorIsolationMax:6,inheritedDivisor:8})],
 [944,Object.freeze({minor:944,release:'6.2',legacy:false,functionParameterFields:13,sendingParameter:11,isolationOffset:4,parameterFields:17,defaultArgument:13,actorIsolationMax:7,inheritedDivisor:128})]
]);
export function swiftDeclarationProfile(version){return version.major===0?profiles.get(version.minor)??null:null;}
export function swiftDeclarationRecord(record,profile){
 if(profile.minor===944){const code=record.code===21?41:record.code>=22&&record.code<=40?record.code-1:record.code;return code===record.code?record:{...record,code,serialized_code:record.code};}
 if(!profile.legacy)return record;
 // 0.871 retained a parenthesized type record and began declarations at 40.
 // Preserve the actual wire code; only the private dispatch key is adapted.
 const code=record.code===5?40:record.code>=6&&record.code<=38?record.code-1:record.code>=40&&record.code<=65?record.code+10:record.code;
 return code===record.code?record:{...record,code,serialized_code:record.code};
}
