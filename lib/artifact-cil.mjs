import { bounds, digest } from './artifact-binary.mjs';

const ops=new Map();
const put=(code,name,kind='none',size=0)=>ops.set(code,{name,kind,size});
[['nop',0],['break',1],['ldnull',0x14],['dup',0x25],['pop',0x26],['ret',0x2a],['conv.r.un',0x76],['throw',0x7a],['ldlen',0x8e],['ckfinite',0xc3],['endfinally',0xdc],['stind.i',0xdf],['conv.u',0xe0]].forEach(([n,c])=>put(c,n));
for(let i=0;i<4;i++){put(2+i,`ldarg.${i}`);put(6+i,`ldloc.${i}`);put(10+i,`stloc.${i}`);}put(0x15,'ldc.i4.m1');for(let i=0;i<9;i++)put(0x16+i,`ldc.i4.${i}`);
['ldarg.s','ldarga.s','starg.s','ldloc.s','ldloca.s','stloc.s'].forEach((n,i)=>put(0xe+i,n,'variable',1));
put(0x1f,'ldc.i4.s','integer',1);put(0x20,'ldc.i4','integer',4);put(0x21,'ldc.i8','integer',8);put(0x22,'ldc.r4','float',4);put(0x23,'ldc.r8','float',8);
['br','brfalse','brtrue','beq','bge','bgt','ble','blt','bne.un','bge.un','bgt.un','ble.un','blt.un'].forEach((n,i)=>{put(0x2b+i,n+'.s','branch',1);put(0x38+i,n,'branch',4);});put(0x45,'switch','switch');
['ldind.i1','ldind.u1','ldind.i2','ldind.u2','ldind.i4','ldind.u4','ldind.i8','ldind.i','ldind.r4','ldind.r8','ldind.ref','stind.ref','stind.i1','stind.i2','stind.i4','stind.i8','stind.r4','stind.r8','add','sub','mul','div','div.un','rem','rem.un','and','or','xor','shl','shr','shr.un','neg','not','conv.i1','conv.i2','conv.i4','conv.i8','conv.r4','conv.r8','conv.u4','conv.u8'].forEach((n,i)=>put(0x46+i,n));
[['jmp',0x27],['call',0x28],['calli',0x29],['callvirt',0x6f],['cpobj',0x70],['ldobj',0x71],['ldstr',0x72],['newobj',0x73],['castclass',0x74],['isinst',0x75],['unbox',0x79],['ldfld',0x7b],['ldflda',0x7c],['stfld',0x7d],['ldsfld',0x7e],['ldsflda',0x7f],['stsfld',0x80],['stobj',0x81],['box',0x8c],['newarr',0x8d],['ldelema',0x8f],['ldelem',0xa3],['stelem',0xa4],['unbox.any',0xa5],['refanyval',0xc2],['mkrefany',0xc6],['ldtoken',0xd0]].forEach(([n,c])=>put(c,n,'token',4));
['conv.ovf.i1.un','conv.ovf.i2.un','conv.ovf.i4.un','conv.ovf.i8.un','conv.ovf.u1.un','conv.ovf.u2.un','conv.ovf.u4.un','conv.ovf.u8.un','conv.ovf.i.un','conv.ovf.u.un'].forEach((n,i)=>put(0x82+i,n));
['ldelem.i1','ldelem.u1','ldelem.i2','ldelem.u2','ldelem.i4','ldelem.u4','ldelem.i8','ldelem.i','ldelem.r4','ldelem.r8','ldelem.ref','stelem.i','stelem.i1','stelem.i2','stelem.i4','stelem.i8','stelem.r4','stelem.r8','stelem.ref'].forEach((n,i)=>put(0x90+i,n));
['conv.ovf.i1','conv.ovf.u1','conv.ovf.i2','conv.ovf.u2','conv.ovf.i4','conv.ovf.u4','conv.ovf.i8','conv.ovf.u8'].forEach((n,i)=>put(0xb3+i,n));
['conv.u2','conv.u1','conv.i','conv.ovf.i','conv.ovf.u','add.ovf','add.ovf.un','mul.ovf','mul.ovf.un','sub.ovf','sub.ovf.un'].forEach((n,i)=>put(0xd1+i,n));put(0xdd,'leave','branch',4);put(0xde,'leave.s','branch',1);
[['arglist',0],['ceq',1],['cgt',2],['cgt.un',3],['clt',4],['clt.un',5],['localloc',0xf],['endfilter',0x11],['volatile.',0x13],['tail.',0x14],['cpblk',0x17],['initblk',0x18],['rethrow',0x1a],['refanytype',0x1d],['readonly.',0x1e]].forEach(([n,c])=>put(0xfe00+c,n));
[['ldftn',6],['ldvirtftn',7],['initobj',0x15],['constrained.',0x16],['sizeof',0x1c]].forEach(([n,c])=>put(0xfe00+c,n,'token',4));['ldarg','ldarga','starg','ldloc','ldloca','stloc'].forEach((n,i)=>put(0xfe09+i,n,'variable',2));put(0xfe12,'unaligned.','integer',1);put(0xfe19,'no.','integer',1);

export function decodeCil(b,{maxInstructions=1000000,maxAnchors=50000}={}) {
  const instructions=[],counts={};let at=0,issue=null;
  while(at<b.length){if(instructions.length>=maxInstructions){issue='CIL instruction bound reached';break;}const offset=at;let code=b[at++];if(code===0xfe){if(at===b.length){issue=`Truncated two-byte CIL opcode at ${offset}`;break;}code=(code<<8)|b[at++];}const op=ops.get(code);if(!op){issue=`Unknown CIL opcode 0x${code.toString(16)} at ${offset}`;break;}let operand=null;
    try{if(op.kind==='switch'){bounds(b,at,4);const count=b.readUInt32LE(at);at+=4;if(count>1000000)throw new Error('CIL switch target bound');bounds(b,at,count*4);const end=at+count*4;operand=Array.from({length:count},(_,i)=>end+b.readInt32LE(at+i*4));at=end;}
      else if(op.size){bounds(b,at,op.size);if(op.kind==='token')operand=`0x${b.readUInt32LE(at).toString(16).padStart(8,'0')}`;else if(op.kind==='branch')operand=at+op.size+(op.size===1?b.readInt8(at):b.readInt32LE(at));else if(op.kind==='float'){const n=op.size===4?b.readFloatLE(at):b.readDoubleLE(at);operand=Number.isFinite(n)?n:String(n);}else if(op.kind==='variable')operand=op.size===1?b[at]:b.readUInt16LE(at);else operand=op.size===8?b.readBigInt64LE(at).toString():op.size===1?b.readInt8(at):b.readInt32LE(at);at+=op.size;}
    }catch(error){issue=error.message;break;}
    let kind=op.kind==='integer'||op.kind==='float'?'constant':op.kind;
    if(kind==='token')kind=['jmp','call','callvirt','newobj','ldftn','ldvirtftn'].includes(op.name)?'method':op.name==='calli'?'signature':op.name==='ldstr'?'string':/^(?:ld|st)s?fld/.test(op.name)?'field':op.name==='ldtoken'?'token':'type';
    instructions.push({il_offset:offset,opcode:op.name,operand_kind:kind,operand:operand===null?null:Array.isArray(operand)?JSON.stringify(operand):String(operand)});counts[op.name]=(counts[op.name]??0)+1;
  }
  const complete=at===b.length&&!issue;return{complete,instructions,anchors:instructions.slice(0,maxAnchors),opcode_counts:counts,instruction_count:instructions.length,decoded_instruction_count:instructions.length,truncated_instructions:Math.max(0,instructions.length-maxAnchors),normalized_il_sha256:complete?digest(Buffer.from(JSON.stringify(instructions))):null,issue};
}

/** Decode ECMA-335 small/fat EH tables; operands are IL-relative, not native PCs. */
export function decodeCilExceptions(bytes,start,ilSize,{mapRange,maxSections=64,maxClauses=100000}={}){
 const regions=[];let at=Math.ceil(start/4)*4,sections=0,more=true;const issues=[];
 while(more){if(++sections>maxSections)throw new Error('CIL supplemental section count exceeds bound');bounds(bytes,at,4);mapRange?.(at,4);const kind=bytes[at],fat=!!(kind&0x40),size=fat?bytes.readUIntLE(at+1,3):bytes[at+1];more=!!(kind&0x80);if(size<4)throw new Error('CIL supplemental section size is invalid');bounds(bytes,at,size);mapRange?.(at,size);
  if((kind&0x3f)!==1)issues.push(`Unsupported CIL supplemental section kind ${kind&0x3f}`);
  else {const width=fat?24:12;if((size-4)%width)throw new Error('CIL exception section clause size mismatch');const count=(size-4)/width;if(regions.length+count>maxClauses)throw new Error('CIL exception clause count exceeds bound');for(let i=0;i<count;i++){const p=at+4+i*width,flags=fat?bytes.readUInt32LE(p):bytes.readUInt16LE(p),try_offset=fat?bytes.readUInt32LE(p+4):bytes.readUInt16LE(p+2),try_length=fat?bytes.readUInt32LE(p+8):bytes[p+4],handler_offset=fat?bytes.readUInt32LE(p+12):bytes.readUInt16LE(p+5),handler_length=fat?bytes.readUInt32LE(p+16):bytes[p+7],value=bytes.readUInt32LE(p+(fat?20:8)),mode=flags&7;
   if(![0,1,2,4].includes(mode)||flags&~15)throw new Error('CIL exception clause flags are invalid');if(!try_length||!handler_length||try_offset+try_length>ilSize||handler_offset+handler_length>ilSize)throw new Error('CIL exception region escapes method IL');if(mode===1&&value>=ilSize)throw new Error('CIL filter offset escapes method IL');if(mode===0&&(![1,2,27].includes(value>>>24)||!(value&0xffffff)))throw new Error('CIL catch clause lacks a valid type token');if((mode===2||mode===4)&&value!==0)throw new Error('CIL finally/fault clause reserved operand is nonzero');
   regions.push({flags,try_offset,try_length,handler_offset,handler_length,class_token:mode===0?'0x'+value.toString(16).padStart(8,'0'):null,filter_offset:mode===1?value:null});
  }}at=Math.ceil((at+size)/4)*4;
 }
 return {regions,complete:issues.length===0,issues};
}
