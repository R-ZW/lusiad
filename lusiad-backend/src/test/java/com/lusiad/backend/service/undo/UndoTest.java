package com.lusiad.backend.service.undo;

import com.google.gson.*;
import com.lusiad.backend.service.psi.EditCoordinator;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import java.nio.file.*;
import java.util.*;
import static org.junit.Assert.*;

/** Disposable real disk plus Run-local cursor; these checks are not UI/SQL E2E. */
public class UndoTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    @Before public void reset() { UndoRegistry.clear(); }
    private static JsonObject metadata(String path) { return com.lusiad.backend.service.change.ChangeMetadata.paths("file_move", path, "destination/"+path); }
    private Path root() throws Exception { return temporary.newFolder().toPath(); }
    private static ResourceImage image(String path, String text) { return ResourceImage.file(path, text.getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    private static Map<String,String> request(String... pairs) { Map<String,String> values = new HashMap<>(); for (int i=0;i<pairs.length;i+=2) values.put(pairs[i],pairs[i+1]); return values; }

    @Test public void overwriteMoveRestoresBothFilesAndKeepsExactCrLfAndBinary() throws Exception {
        Path root = root(); Files.createDirectories(root.resolve("source")); Files.createDirectories(root.resolve("destination"));
        byte[] original = {0,1,2,-1}; Files.write(root.resolve("source/A.java"), original); Files.writeString(root.resolve("destination/A.java"), "old Ω\r\n");
        var plan = ResourceEdits.filesystemPlan(root.toString(), "file_move", request("sourcePath","source/A.java","destPath","destination","overwrite","true"));
        var before = ResourceImage.decode(plan.before()); var after = ResourceImage.decode(plan.after());
        ResourceImage.apply(root.toString(), before, after);
        assertFalse(Files.exists(root.resolve("source/A.java"))); assertArrayEquals(original, Files.readAllBytes(root.resolve("destination/A.java")));
        ResourceImage.apply(root.toString(), after, before);
        assertArrayEquals(original, Files.readAllBytes(root.resolve("source/A.java"))); assertEquals("old Ω\r\n", Files.readString(root.resolve("destination/A.java")));
        ResourceImage.apply(root.toString(), before, after); after.requireCurrent(root.toString());
    }
    @Test public void deletedTreeRestoresEmptyDirectoriesAndRefusesNewDescendantOnRedo() throws Exception {
        Path root = root(); Files.createDirectories(root.resolve("tree/empty")); Files.writeString(root.resolve("tree/A.java"), "class A {}\n");
        var plan = ResourceEdits.filesystemPlan(root.toString(), "dir_delete", request("path","tree","recursive","true"));
        var before = ResourceImage.decode(plan.before()); var after = ResourceImage.decode(plan.after());
        ResourceImage.apply(root.toString(), before, after); assertFalse(Files.exists(root.resolve("tree")));
        ResourceImage.apply(root.toString(), after, before); assertTrue(Files.isDirectory(root.resolve("tree/empty")));
        Files.writeString(root.resolve("tree/new.txt"), "external");
        try { ResourceImage.apply(root.toString(), before, after); fail(); } catch (EditCoordinator.Failure failure) { assertEquals("revision_conflict", failure.code); }
        assertEquals("external",Files.readString(root.resolve("tree/new.txt")));
    }
    @Test public void partialWriteFailureRestoresPreimageInsteadOfPublishingPartialState() throws Exception {
        Path root = root(); Files.writeString(root.resolve("A.java"), "before");
        var before = image("A.java","before"); var after = image("A.java","after");
        try { ResourceImage.apply(root.toString(), before, after, (r,b,a) -> { Files.writeString(root.resolve("A.java"), "after"); throw new java.io.IOException("disk failure"); }); fail(); }
        catch (java.io.IOException expected) { assertEquals("disk failure", expected.getMessage()); }
        before.requireCurrent(root.toString());
    }
    @Test public void interruptedPendingRewindRestoresBothFilesOnlyFromRecordedImages() throws Exception {
        Path root = root(); Files.writeString(root.resolve("A.java"), "before\r\n"); Files.writeString(root.resolve("B.java"), "keep");
        var before = ResourceImage.capture(root.toString(), List.of("A.java", "B.java"));
        Files.writeString(root.resolve("A.java"), "after\n"); Files.delete(root.resolve("B.java"));
        var after = ResourceImage.capture(root.toString(), List.of("A.java", "B.java"));
        Files.writeString(root.resolve("B.java"), "keep"); // Simulate an interrupted two-file publication.
        ResourceImage.recoverBefore(root.toString(), before, after);
        before.requireCurrent(root.toString());
        Files.writeString(root.resolve("A.java"), "external");
        try { ResourceImage.recoverBefore(root.toString(), before, after); fail("External bytes must not be overwritten"); }
        catch (IllegalStateException expected) { assertTrue(expected.getMessage().contains("External write")); }
        assertEquals("external", Files.readString(root.resolve("A.java")));
    }
    @Test public void concurrentExternalContentDuringFailureIsNeverOverwrittenByCompensation() throws Exception {
        Path root = root(); Files.writeString(root.resolve("A.java"), "before");
        try { ResourceImage.apply(root.toString(), image("A.java","before"), image("A.java","after"), (r,b,a) -> { Files.writeString(root.resolve("A.java"),"third-party"); throw new java.io.IOException("disk failure"); }); fail(); }
        catch (java.io.IOException expected) { assertEquals(1, expected.getSuppressed().length); }
        assertEquals("third-party",Files.readString(root.resolve("A.java")));
    }
    @Test public void conflictsOwnDestinationsAndInvalidContextsHaveNoPhysicalEffect() throws Exception {
        Path root = root(); Files.createDirectory(root.resolve("dir")); Files.writeString(root.resolve("dir/A.java"),"a"); Files.writeString(root.resolve("dir/B.java"),"b");
        assertNull(ResourceEdits.filesystemPlan(root.toString(), "file_move",request("sourcePath","dir/A.java","destPath","dir")));
        assertNull(ResourceEdits.filesystemPlan(root.toString(), "file_rename",request("path","dir/A.java","name","A.java")));
        try { ResourceEdits.filesystemPlan(root.toString(), "file_rename",request("path","dir/A.java","name","B.java")); fail(); } catch (IllegalArgumentException expected) { }
        try { ResourceImage.capture(root.toString(),List.of("../escape")); fail(); } catch (IllegalArgumentException expected) { }
        try { ResourceImage.capture(root.toString(),List.of(".git/config")); fail(); } catch (IllegalArgumentException expected) { }
        assertEquals("a", Files.readString(root.resolve("dir/A.java"))); assertEquals("b",Files.readString(root.resolve("dir/B.java")));
    }
    @Test public void snapshotRejectsUnrelatedPathsBadKindsAndCorruptedEncoding() {
        for (String invalid : List.of("{\"roots\":[\"A.java\"],\"entries\":{\"B.java\":{\"kind\":\"file\",\"content\":\"YQ==\"}}}",
                "{\"roots\":[\"A.java\"],\"entries\":{\"A.java\":{\"kind\":\"link\",\"content\":null}}}")) {
            try { ResourceImage.decode(invalid); fail(); } catch (IllegalArgumentException expected) { }
        }
    }
    @Test public void logicalCursorReplaysInOrderAndNewEditClearsRedoWithoutChangingPreviousImages() {
        var a0=image("A.java","0"); var a1=image("A.java","1"); var a2=image("A.java","2");
        String a=UUID.randomUUID().toString(), b=UUID.randomUUID().toString();
        UndoRegistry.acknowledge(1,"root","base",a,1,a0,a1,metadata("A.java"),"A.java",null);
        UndoRegistry.acknowledge(1,"root","base",b,2,a1,a2,metadata("A.java"),"A.java",null);
        var state=UndoRegistry.status(1,"root","base");
        var step=UndoRegistry.top(1,"root","base","undo",state.get("epoch").getAsString(),state.get("revision").getAsLong()); assertEquals(b,step.id());
        JsonObject nav=new JsonObject(); nav.addProperty("epoch",state.get("epoch").getAsString()); nav.addProperty("direction","undo"); nav.addProperty("logicalId",b);
        UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),3,a2,a1,metadata("A.java"),"A.java",nav);
        state=UndoRegistry.status(1,"root","base"); assertEquals(1,state.get("redoCount").getAsInt()); assertEquals(a, state.getAsJsonObject("undo").get("id").getAsString());
        UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),4,a1,image("A.java","new"),metadata("A.java"),"A.java",null);
        assertEquals(0,UndoRegistry.status(1,"root","base").get("redoCount").getAsInt()); assertEquals("0",new String(a0.entries().get("A.java").bytes()));
    }
    @Test public void duplicateAcknowledgementDoesNotAdvanceAndStaleClientIsRejected() {
        var a=image("A.java","a"); var b=image("A.java","b"); var old=UndoRegistry.status(1,"root","base"); String id=UUID.randomUUID().toString();
        UndoRegistry.acknowledge(1,"root","base",id,1,a,b,metadata("A.java"),"A.java",null);
        var state=UndoRegistry.status(1,"root","base"); UndoRegistry.acknowledge(1,"root","base",id,1,a,b,metadata("A.java"),"A.java",null);
        assertEquals(state,UndoRegistry.status(1,"root","base"));
        try { UndoRegistry.top(1,"root","base","undo",old.get("epoch").getAsString(),old.get("revision").getAsLong()); fail(); } catch(EditCoordinator.Failure expected) { assertEquals("undo_conflict", expected.code); }
    }
    @Test public void boundariesRestartAndProjectsNeverReviveAnOldStack() {
        UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),1,image("A.java","a"),image("A.java","b"),metadata("A.java"),"A.java",null);
        assertEquals(0,UndoRegistry.status(2,"root","base").get("undoCount").getAsInt());
        var previous=UndoRegistry.status(1,"root","base"); assertEquals(0,UndoRegistry.status(1,"root","commit").get("undoCount").getAsInt());
        assertNotEquals(previous.get("epoch"),UndoRegistry.status(1,"root","base").get("epoch"));
        String run=UndoRegistry.RUN; UndoRegistry.clear(); assertNotEquals(run,UndoRegistry.RUN); assertEquals(0,UndoRegistry.status(1,"root","base").get("undoCount").getAsInt());
    }
    @Test public void boundedHistoryEvictsOldestAndNoopPreservesRedo() {
        for(int i=0;i<55;i++) UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),i+1,image("A.java",""+i),image("A.java",""+(i+1)),metadata("A.java"),"A.java",null);
        var state=UndoRegistry.status(1,"root","base"); assertEquals(50,state.get("undoCount").getAsInt()); assertEquals(5,state.get("evicted").getAsInt());
        UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),56,image("A.java","55"),image("A.java","55"),metadata("A.java"),"A.java",null);
        assertEquals(state,UndoRegistry.status(1,"root","base"));
    }
    @Test public void historicalLfConversionIsAcceptedOnlyForIdenticalUtf8TextAndNeverForLiveUndo() throws Exception {
        Path root=root(); Files.writeString(root.resolve("A.java"),"class A {}\n");
        var before=image("A.java","class A {}\r\n"); var after=image("A.java","class A { int n; }\r\n");
        try { ResourceImage.apply(root.toString(),before,after); fail(); } catch(EditCoordinator.Failure expected) { }
        ResourceImage.applyHistorical(root.toString(),before,after); after.requireCurrent(root.toString());
    }
    @Test public void lateReadCannotResetOrReviveAConfirmedCursor() {
        UndoRegistry.acknowledge(1,"root","commit-2",UUID.randomUUID().toString(),3,image("A.java","a"),image("A.java","b"),metadata("A.java"),"A.java",null);
        JsonObject current=UndoRegistry.status(1,"root","commit-2");
        assertEquals(0,UndoRegistry.projectedStatus(1,"root","commit-1").get("undoCount").getAsInt());
        assertEquals(current,UndoRegistry.status(1,"root","commit-2"));
        assertEquals(0,UndoRegistry.projectedStatus(1,"root","commit-3").get("undoCount").getAsInt());
        assertEquals(current,UndoRegistry.status(1,"root","commit-2"));
    }
    @Test public void explicitDirectoryReplacementRestoresBothCompleteTreesWithoutMergingThem() throws Exception {
        Path root=root(); Files.createDirectories(root.resolve("source/tree/empty")); Files.createDirectories(root.resolve("destination/tree"));
        Files.writeString(root.resolve("source/tree/A.java"),"source"); Files.writeString(root.resolve("destination/tree/old.bin"),"old target");
        var req=request("sourcePath","source/tree","destPath","destination","overwrite","true");
        var plan=ResourceEdits.filesystemPlan(root.toString(),"dir_move",req);
        var before=ResourceImage.decode(plan.before());var after=ResourceImage.decode(plan.after());
        ResourceImage.apply(root.toString(),before,after);
        assertFalse(Files.exists(root.resolve("source/tree")));assertFalse(Files.exists(root.resolve("destination/tree/old.bin")));assertTrue(Files.isDirectory(root.resolve("destination/tree/empty")));
        ResourceImage.apply(root.toString(),after,before);before.requireCurrent(root.toString());
        assertEquals("old target",Files.readString(root.resolve("destination/tree/old.bin")));assertEquals("source",Files.readString(root.resolve("source/tree/A.java")));
    }
    @Test public void correctionPreservesEncodingNewlinesAndExactBytesForAnUnchangedDraft() throws Exception {
        String old="class Ω {\r\n int n = 1;\r\n}\r\n", next=old.replace("= 1", "= 2");
        for (var charset : List.of(java.nio.charset.StandardCharsets.UTF_8, java.nio.charset.StandardCharsets.UTF_16LE, java.nio.charset.StandardCharsets.UTF_16BE)) {
            byte[] marker=charset.equals(java.nio.charset.StandardCharsets.UTF_8) ? new byte[]{(byte)239,(byte)187,(byte)191}
                    : charset.equals(java.nio.charset.StandardCharsets.UTF_16LE) ? new byte[]{(byte)255,(byte)254} : new byte[]{(byte)254,(byte)255};
            byte[] original=java.nio.ByteBuffer.allocate(marker.length+old.getBytes(charset).length).put(marker).put(old.getBytes(charset)).array();
            var entry=ResourceImage.Entry.file(original);
            assertEquals(entry,UndoService.correctedText(entry,old.replace("\r\n","\n")));
            byte[] expected=java.nio.ByteBuffer.allocate(marker.length+next.getBytes(charset).length).put(marker).put(next.getBytes(charset)).array();
            assertArrayEquals(expected,UndoService.correctedText(entry,next.replace("\r\n","\n")).bytes());
        }
    }
    @Test public void partialStageWriteNeverTruncatesThePreviousDestination() throws Exception {
        Path root=root(), destination=root.resolve("A.java"); Files.writeString(destination,"previous target");
        try {
            ResourceImage.publish(destination,"replacement".getBytes(java.nio.charset.StandardCharsets.UTF_8),(stage,bytes)->{
                Files.write(stage,Arrays.copyOf(bytes,3)); throw new java.io.IOException("interrupted stage write");
            }); fail();
        } catch (java.io.IOException expected) { assertEquals("interrupted stage write",expected.getMessage()); }
        assertEquals("previous target",Files.readString(destination));
        try(var files=Files.list(root)){ assertEquals(List.of(destination),files.toList()); }
    }
    @Test public void rejectedCompensationCannotConsumeTheAcknowledgementHighWaterMark() {
        String original=UUID.randomUUID().toString();
        UndoRegistry.acknowledge(1,"root","base",original,10,image("A.java","a"),image("A.java","b"),metadata("A.java"),"A.java",null);
        JsonObject state=UndoRegistry.status(1,"root","base"), navigation=new JsonObject();
        navigation.addProperty("epoch",state.get("epoch").getAsString()); navigation.addProperty("direction","undo"); navigation.addProperty("logicalId",UUID.randomUUID().toString());
        try { UndoRegistry.acknowledge(1,"root","base",UUID.randomUUID().toString(),11,image("A.java","b"),image("A.java","a"),metadata("A.java"),"A.java",navigation); fail(); }
        catch(IllegalStateException expected){ }
        assertEquals(10,UndoRegistry.lastChange(1,"root","base")); assertEquals(state,UndoRegistry.status(1,"root","base"));
    }
}
