import {bounds} from './artifact-binary.mjs';

// JVMS 6 opcode order, 0x00 through 0xc9. Reserved implementation opcodes are
// deliberately not interpreted as class-file instructions.
const names=`nop aconst_null iconst_m1 iconst_0 iconst_1 iconst_2 iconst_3 iconst_4 iconst_5 lconst_0 lconst_1 fconst_0 fconst_1 fconst_2 dconst_0 dconst_1 bipush sipush ldc ldc_w ldc2_w iload lload fload dload aload iload_0 iload_1 iload_2 iload_3 lload_0 lload_1 lload_2 lload_3 fload_0 fload_1 fload_2 fload_3 dload_0 dload_1 dload_2 dload_3 aload_0 aload_1 aload_2 aload_3 iaload laload faload daload aaload baload caload saload istore lstore fstore dstore astore istore_0 istore_1 istore_2 istore_3 lstore_0 lstore_1 lstore_2 lstore_3 fstore_0 fstore_1 fstore_2 fstore_3 dstore_0 dstore_1 dstore_2 dstore_3 astore_0 astore_1 astore_2 astore_3 iastore lastore fastore dastore aastore bastore castore sastore pop pop2 dup dup_x1 dup_x2 dup2 dup2_x1 dup2_x2 swap iadd ladd fadd dadd isub lsub fsub dsub imul lmul fmul dmul idiv ldiv fdiv ddiv irem lrem frem drem ineg lneg fneg dneg ishl lshl ishr lshr iushr lushr iand land ior lor ixor lxor iinc i2l i2f i2d l2i l2f l2d f2i f2l f2d d2i d2l d2f i2b i2c i2s lcmp fcmpl fcmpg dcmpl dcmpg ifeq ifne iflt ifge ifgt ifle if_icmpeq if_icmpne if_icmplt if_icmpge if_icmpgt if_icmple if_acmpeq if_acmpne goto jsr ret tableswitch lookupswitch ireturn lreturn freturn dreturn areturn return getstatic putstatic getfield putfield invokevirtual invokespecial invokestatic invokeinterface invokedynamic new newarray anewarray arraylength athrow checkcast instanceof monitorenter monitorexit wide multianewarray ifnull ifnonnull goto_w jsr_w`.split(' ');
if(names.length!==202)throw new Error('Owned JVM opcode table has an invalid extent');
const variable=new Set([0x15,0x16,0x17,0x18,0x19,0x36,0x37,0x38,0x39,0x3a,0xa9]);
const classOps=new Set([0xbb,0xbd,0xc0,0xc1,0xc5]);

export function decodeJvmCode(bytes,{resolve,budget,baseOffset=0,maxLocals}={}){
 const instructions=[],references=[],branches=[];let at=0,issue=null;
 const need=(offset,size)=>bounds(bytes,offset,size),u2=offset=>{need(offset,2);return bytes.readUInt16BE(offset);},i2=offset=>{need(offset,2);return bytes.readInt16BE(offset);},i4=offset=>{need(offset,4);return bytes.readInt32BE(offset);};
 const ref=(index,kind,offset)=>{const target=resolve(index,kind),value={kind:kind==='field'?'field-reference':kind==='class'?'type-reference':kind==='dynamic'?'dynamic-call-site':'method-reference',constant_pool_index:index,bytecode_offset:offset,target};budget?.output(value);references.push(value);return target;};
 const target=(offset,delta)=>{const value=offset+delta;if(value<0||value>=bytes.length)throw new Error('JVM branch target escapes Code attribute');branches.push(value);return value;};
 while(at<bytes.length){budget?.work();budget?.take('records');const offset=at,opcode=bytes[at++],name=names[opcode],operands={};if(!name){issue='Reserved or unknown JVM opcode 0x'+opcode.toString(16);break;}
  if(opcode===0x10){need(at,1);operands.value=bytes.readInt8(at++);}
  else if(opcode===0x11){operands.value=i2(at);at+=2;}
  else if([0x12,0x13,0x14].includes(opcode)){need(at,opcode===0x12?1:2);const index=opcode===0x12?bytes[at++]:u2(at);if(opcode!==0x12)at+=2;operands.constant_pool_index=index;operands.constant=resolve(index,opcode===0x14?'wide-constant':'constant');if(operands.constant.kind==='class')ref(index,'class',offset);}
  else if(variable.has(opcode)){need(at,1);operands.local_index=bytes[at++];}
  else if(opcode===0x84){need(at,2);operands.local_index=bytes[at++];operands.increment=bytes.readInt8(at++);}
  else if(opcode>=0x99&&opcode<=0xa8||opcode===0xc6||opcode===0xc7){operands.target=target(offset,i2(at));at+=2;}
  else if(opcode===0xc8||opcode===0xc9){operands.target=target(offset,i4(at));at+=4;}
  else if(opcode===0xaa||opcode===0xab){
   while(at%4){need(at,1);if(bytes[at++]!==0)throw new Error('JVM switch padding is nonzero');}
   operands.default=target(offset,i4(at));at+=4;operands.cases=[];
   if(opcode===0xaa){const low=i4(at),high=i4(at+4);at+=8;if(high<low||high-low+1>65535)throw new Error('JVM tableswitch range exceeds bound');need(at,(high-low+1)*4);for(let key=low;key<=high;key++){budget?.work();operands.cases.push({key,target:target(offset,i4(at))});at+=4;}}
   else{const count=i4(at);at+=4;if(count<0||count>65535)throw new Error('JVM lookupswitch count exceeds bound');need(at,count*8);let prior=null;for(let i=0;i<count;i++){budget?.work();const key=i4(at);if(prior!==null&&key<=prior)throw new Error('JVM lookupswitch keys are not increasing');prior=key;operands.cases.push({key,target:target(offset,i4(at+4))});at+=8;}}
  }
  else if(opcode>=0xb2&&opcode<=0xb8){const index=u2(at);at+=2;operands.constant_pool_index=index;operands.target=ref(index,opcode<=0xb5?'field':opcode===0xb6?'method':'method-or-interface',offset);}
  else if(opcode===0xb9||opcode===0xba){const index=u2(at);at+=2;need(at,2);operands.constant_pool_index=index;const count=bytes[at++],zero=bytes[at++];if(zero||opcode===0xba&&count||opcode===0xb9&&!count)throw new Error('Invalid JVM invocation trailing operands');operands.target=ref(index,opcode===0xb9?'interface-method':'dynamic',offset);if(opcode===0xb9){if(count!==operands.target.signature.parameter_slots+1)throw new Error('JVM invokeinterface count contradicts descriptor slots');operands.argument_slots=count;}}
  else if(classOps.has(opcode)){const index=u2(at);at+=2;operands.constant_pool_index=index;operands.target=ref(index,'class',offset);if(opcode===0xc5){need(at,1);operands.dimensions=bytes[at++];if(!operands.dimensions||operands.dimensions>(operands.target.descriptor.match(/^\[+/)?.[0].length??0))throw new Error('Invalid JVM multianewarray dimensions');}else if(opcode===0xbb&&operands.target.descriptor.startsWith('['))throw new Error('JVM new references an array class');}
  else if(opcode===0xbc){need(at,1);operands.array_type=bytes[at++];if(operands.array_type<4||operands.array_type>11)throw new Error('Invalid JVM newarray primitive type');}
  else if(opcode===0xc4){need(at,1);const modified=bytes[at++];if(!variable.has(modified)&&modified!==0x84)throw new Error('Unsupported JVM wide instruction');operands.modified_opcode=names[modified];operands.local_index=u2(at);at+=2;if(modified===0x84){operands.increment=i2(at);at+=2;}}
  if(maxLocals!==undefined){let local=operands.local_index,width=[0x16,0x18,0x37,0x39].includes(opcode)||opcode===0xc4&&['lload','dload','lstore','dstore'].includes(operands.modified_opcode)?2:1;if(opcode>=0x1a&&opcode<=0x2d){local=(opcode-0x1a)%4;width=[1,3].includes(Math.floor((opcode-0x1a)/4))?2:1;}else if(opcode>=0x3b&&opcode<=0x4e){local=(opcode-0x3b)%4;width=[1,3].includes(Math.floor((opcode-0x3b)/4))?2:1;}if(local!==undefined&&local+width>maxLocals)throw new Error('JVM local instruction escapes max_locals');}
  const row={bytecode_offset:offset,file_offset:baseOffset+offset,size:at-offset,opcode:name,operands};budget?.output(row);instructions.push(row);
 }
 if(!issue){const starts=new Set(instructions.map(row=>row.bytecode_offset));if(branches.some(to=>!starts.has(to)))throw new Error('JVM branch targets an instruction operand');}
 return {status:issue?'partial':'decoded',instructions,references,issue};
}
