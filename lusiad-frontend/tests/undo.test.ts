import test from 'node:test'
import assert from 'node:assert/strict'
import { readResourceStates, resourcePostimages } from '../src/lib/services/undo/resource-image.ts'
import { requireUndoState, requireUndoProposal, requireUndoReceipt, requireUndoResult } from '../src/lib/services/undo/undo-contract.ts'
import { reconstructInitialBaseline } from '../src/lib/services/restore/initial-baseline.ts'
import { withUndoCapacity } from '../src/lib/services/undo/undo-capacity.ts'
import { generatedChangeText } from '../src/lib/i18n/change-text.ts'

const id='bfa0060c-24b5-4309-bd89-a8c57714fd71'
const field = { kind:'field',name:'label' }
const side = {path:'A.java',range:null,element:field,context:[]}
const metadata = { version:1,action:'update',kind:'code',before:side,after:side,differences:[] }
const entry = (text:string) => ({kind:'file',content:Buffer.from(text).toString('base64')})
const images = { before:{roots:['source/A.java','target/A.java'],entries:{'source/A.java':entry('source Ω\r\n'),'target/A.java':entry('target\n')}},
  after:{roots:['source/A.java','target/A.java'],entries:{'target/A.java':entry('source Ω\r\n')}} }

test('reversible images reject escapes, aliases, malformed base64 and invented kinds',()=>{
  assert.ok(readResourceStates({resources:images}))
  for(const bad of ['../outside','C:/outside','.git/config','/outside']) assert.throws(()=>readResourceStates({resources:{before:{roots:[bad],entries:{}},after:{roots:[bad],entries:{}}}}))
  assert.throws(()=>readResourceStates({resources:{...images,after:{roots:images.after.roots,entries:{'target/A.java':{kind:'link',content:null}}}}}))
  assert.throws(()=>readResourceStates({resources:{...images,after:{roots:images.after.roots,entries:{'target/A.java':{kind:'file',content:'!!!'}}}}}))
})
test('Git postimages retain overwritten target bytes and absence of the moved source',()=>{
  const states=readResourceStates({resources:images})!
  const expected=new Map<string,string|Buffer|null>([['unrelated.java','unchanged']])
  resourcePostimages(expected,states)
  assert.equal(expected.get('source/A.java'),null)
  assert.deepEqual(expected.get('target/A.java'),Buffer.from('source Ω\r\n'))
  assert.equal(expected.get('unrelated.java'),'unchanged')
})
test('initial baseline reverses a resource move including the overwritten target without changing final files',()=>{
  const final=new Map([['target/A.java',Buffer.from('source Ω\n')],['keep.java',Buffer.from('keep')]])
  const result=reconstructInitialBaseline('D:/fixture',final,[{id:1,scope:'dir',change_type:'file_move',req_body:{recordVersion:3,resources:images}}])
  assert.deepEqual(result.files.get('source/A.java'),Buffer.from('source Ω\r\n'))
  assert.deepEqual(result.files.get('target/A.java'),Buffer.from('target\n'))
  assert.equal(final.has('source/A.java'),false)
  const corrupt=new Map(final);corrupt.set('target/A.java',Buffer.from('not recorded'))
  assert.throws(()=>reconstructInitialBaseline('D:/fixture',corrupt,[{id:1,scope:'dir',change_type:'file_move',req_body:{resources:images}}]))
})
test('status validates cursor, counts and presentation facts without accepting an error as success',()=>{
  const state={status:'ok',version:1,epoch:id,revision:2,undoCount:1,redoCount:0,evicted:0,undo:{id,path:'A.java',originalChangeId:1,metadata},redo:null}
  assert.equal(requireUndoState(state,'test').undoCount,1)
  for(const change of [{status:'partial'},{revision:-1},{undoCount:0},{error:'failure'},{redoCount:1}]) assert.throws(()=>requireUndoState({...state,...change},'test'))
})
test('proposal/receipt require the exact cursor and request id; missing files never mean an empty approval',()=>{
  const cursor={direction:'undo' as const,epoch:id,revision:2,requestId:id}
  const body={...cursor,status:'ok',version:1,logicalId:id,path:'A.java',metadata,files:[{path:'A.java',beforeKind:'file',afterKind:'file',beforeText:'class A{}',afterText:'class A{'}]}
  assert.equal(requireUndoProposal(body,'test',cursor).files.length,1)
  assert.throws(()=>requireUndoProposal({...body,revision:3},'test',cursor))
  assert.throws(()=>requireUndoProposal({...body,files:[{path:'../A.java'}]},'test',cursor))
  assert.throws(()=>requireUndoProposal({...body,files:undefined},'test',cursor))
  assert.throws(()=>requireUndoReceipt({status:'ok',operationId:id,operationOrder:1,changeId:1,recordVersion:2},'test',id))
})
test('undo/redo titles are deterministic PT/EN and preserve identifiers',()=>{
  const body={changeMetadata:metadata,navigation:{direction:'undo'}}
  assert.match(generatedChangeText(body,'pt-BR')!.title,/^Desfazer:.*label/)
  assert.match(generatedChangeText({...body,navigation:{direction:'redo'}},'en')!.title,/^Redo:.*label/)
})
test('unchanged correction preserves the cursor without claiming a receipt or an applied event',()=>{
  const cursor={direction:'undo' as const,epoch:id,revision:2,requestId:id}
  const state={status:'ok',version:1,epoch:id,revision:2,undoCount:1,redoCount:0,evicted:0,undo:{id,path:'A.java',originalChangeId:1,metadata},redo:null}
  const body={status:'ok',noOp:true,requestId:id,state}
  assert.equal(requireUndoResult(body,'test',cursor).noOp,true)
  assert.throws(()=>requireUndoResult({...body,changeId:1},'test',cursor))
  assert.throws(()=>requireUndoResult({...body,state:{...state,revision:3}},'test',cursor))
  assert.throws(()=>requireUndoResult({...body,error:'failure'},'test',cursor))
})
test('only a pre-write capacity refusal can trigger one explicitly approved retry',async()=>{
  const previous=globalThis.window;let confirmations=0
  Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{confirm:()=>{confirmations++;return true}}})
  try {
    const calls:boolean[]=[]
    const result=await withUndoCapacity(async allow=>{calls.push(allow);return allow?{status:'ok'}:{backendError:{code:'undo_capacity',message:'too large'}}},'question')
    assert.equal(result.status,'ok');assert.deepEqual(calls,[false,true]);assert.equal(confirmations,1)
    await assert.rejects(withUndoCapacity(async()=>({backendError:{code:'operation_pending',message:'not confirmed'}}),'question'),/not confirmed/)
    assert.equal(confirmations,1)
    window.confirm=()=>false;let writes=0
    await assert.rejects(withUndoCapacity(async allow=>{if(allow)writes++;return {backendError:{code:'undo_capacity',message:'too large'}}},'question'),/too large/)
    assert.equal(writes,0)
  } finally {Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:previous})}
})
