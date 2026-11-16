import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createPreview, markPreviewReady, previewRoot, readReadyPreview, releasePreview } from "../src/lib/services/restore/preview-snapshot.ts"

test("concurrent previews publish only complete identities and failed cleanup cannot remove the other request", async () => {
  const temp=await mkdtemp(join(tmpdir(),"lusiad-previews-"))
  try {
    let failedRoot=""
    const [success,failed] = await Promise.allSettled([
      createPreview(temp,async(snapshotId,root)=>{
        await mkdir(join(root,"working-copy"));await writeFile(join(root,"working-copy/Own.java"),"own")
        await assert.rejects(()=>readReadyPreview(temp,snapshotId,11,1))
        await markPreviewReady(temp,{snapshotId,projectId:11,changeId:1,commitId:2,changeType:"update",reqBody:{path:"Own.java"}})
        return snapshotId
      }),
      createPreview(temp,async(_id,root)=>{failedRoot=root;await writeFile(join(root,"partial"),"incomplete");throw Error("replay failure")}),
    ])
    assert.equal(success.status,"fulfilled");assert.equal(failed.status,"rejected")
    const id=success.value
    await assert.rejects(()=>readFile(join(failedRoot,"partial")),{code:"ENOENT"})
    await assert.rejects(()=>readReadyPreview(temp,id,22,1),/identity/)
    await assert.rejects(()=>readReadyPreview(temp,id,11,3),/identity/)
    assert.equal(await readFile(join(previewRoot(temp,id),"working-copy/Own.java"),"utf8"),"own")
    await releasePreview(temp,id,11)
    await assert.rejects(()=>readReadyPreview(temp,id,11),{code:"ENOENT"})
    assert.throws(()=>previewRoot(temp,"../real-project"),/Invalid/)
  } finally {await rm(temp,{recursive:true,force:true})}
})
