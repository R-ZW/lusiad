package com.lusiad.backend.service.diagnostics;

import com.sun.source.util.JavacTask;
import com.sun.source.util.TaskEvent;
import com.sun.source.util.TaskListener;
import com.lusiad.backend.service.psi.EditCoordinator;
import javax.tools.*;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.*;

/** javac parse + attribution only. No generation, processors, plugin options or project execution. */
public final class JavaCompilerDiagnostics {
    public record Position(int startOffset, int endOffset, int startLine, int startColumn, int endLine, int endColumn) {}
    public record Problem(String severity, String code, String message, String file, String revision, Position range) {}
    public record FileRevision(String file, String revision, int sourceLength, boolean test) {}
    public record Result(String status, int version, String source, String requestId, String contextRevision,
                         String runtime, int release, List<FileRevision> files, List<Problem> diagnostics,
                         String file, String baseRevision, String revision, String proposedContent) {}
    public record Overlay(String file, String baseRevision, String proposedContent) {}
    private JavaCompilerDiagnostics() {}

    public static Result analyze(JavaAnalysisContext.Snapshot snapshot, String requestId, Overlay overlay, Runnable checkpoint) throws IOException {
        checkpoint.run();
        JavaCompiler compiler = RuntimeJavaCompiler.get();
        if (compiler == null) throw new JavaAnalysisContext.Failure("java_compiler_unavailable", "Run runtime does not provide javac");
        SortedMap<String, JavaAnalysisContext.Source> inputs = new TreeMap<>(snapshot.sources());
        if (overlay != null) {
            var original = inputs.get(overlay.file());
            if (original == null || !original.revision().equals(overlay.baseRevision()))
                throw new JavaAnalysisContext.Failure("revision_conflict", "Proposal source differs from the captured project; reload before analyzing");
            inputs.put(overlay.file(), new JavaAnalysisContext.Source(overlay.file(), overlay.proposedContent(), EditCoordinator.hash(overlay.proposedContent()), original.test()));
        }
        List<Problem> diagnostics = new ArrayList<>();
        compile(compiler, snapshot, inputs.values().stream().filter(s -> !s.test()).toList(), diagnostics, checkpoint);
        // Tests see production sources. Production was checked separately without seeing tests.
        if (inputs.values().stream().anyMatch(JavaAnalysisContext.Source::test)) compile(compiler, snapshot, List.copyOf(inputs.values()), diagnostics, checkpoint);
        checkpoint.run();
        var unique = diagnostics.stream().distinct().toList();
        return new Result("ok", 1, "javac", requestId, snapshot.revision(), Runtime.version().toString(), snapshot.settings().release(),
                inputs.values().stream().map(s -> new FileRevision(s.file(), s.revision(), s.content().length(), s.test())).toList(), unique,
                overlay == null ? null : overlay.file(), overlay == null ? null : overlay.baseRevision(),
                overlay == null ? null : EditCoordinator.hash(overlay.proposedContent()), overlay == null ? null : overlay.proposedContent());
    }

    private static void compile(JavaCompiler compiler, JavaAnalysisContext.Snapshot snapshot, List<JavaAnalysisContext.Source> sources,
                                List<Problem> problems, Runnable checkpoint) throws IOException {
        if (sources.isEmpty()) return;
        DiagnosticListener<JavaFileObject> listener = diagnostic -> {
            checkpoint.run();
            if (diagnostic.getKind() != Diagnostic.Kind.ERROR) return;
            MemorySource source = diagnostic.getSource() instanceof MemorySource memory ? memory : null;
            // Global compiler errors have no source location; they still count and must never disappear.
            var range = source == null ? null : position(source.input.content(), diagnostic.getStartPosition(), diagnostic.getEndPosition());
            problems.add(new Problem("error", diagnostic.getCode(), diagnostic.getMessage(Locale.ENGLISH),
                    source == null ? null : source.input.file(), source == null ? null : source.input.revision(), range));
        };
        try (StandardJavaFileManager standard = compiler.getStandardFileManager(listener, Locale.ENGLISH, StandardCharsets.UTF_8)) {
            standard.setLocationFromPaths(StandardLocation.CLASS_PATH, snapshot.classpath());
            standard.setLocationFromPaths(StandardLocation.SOURCE_PATH, List.of());
            standard.setLocationFromPaths(StandardLocation.ANNOTATION_PROCESSOR_PATH, List.of());
            standard.setLocationFromPaths(StandardLocation.MODULE_PATH, snapshot.modulePath());
            var manager = new ForwardingJavaFileManager<StandardJavaFileManager>(standard) {
                @Override public JavaFileObject getJavaFileForOutput(Location location, String className, JavaFileObject.Kind kind, FileObject sibling) throws IOException {
                    throw new IOException("Class output is disabled");
                }
                @Override public FileObject getFileForOutput(Location location, String packageName, String relativeName, FileObject sibling) throws IOException {
                    throw new IOException("File output is disabled");
                }
                @Override public Iterable<JavaFileObject> list(Location location, String packageName, Set<JavaFileObject.Kind> kinds, boolean recurse) throws IOException {
                    checkpoint.run();
                    // Dependency roots contain binaries only. Never discover implicit Java source files there.
                    kinds = new HashSet<>(kinds); kinds.remove(JavaFileObject.Kind.SOURCE);
                    return super.list(location, packageName, kinds, recurse);
                }
                @Override public JavaFileObject getJavaFileForInput(Location location, String className, JavaFileObject.Kind kind) throws IOException {
                    checkpoint.run();
                    if (kind == JavaFileObject.Kind.SOURCE) return null;
                    return super.getJavaFileForInput(location, className, kind);
                }
            };
            List<String> options = new ArrayList<>(List.of("-proc:none", "-implicit:none", "-Xlint:none", "-Xmaxerrs", "1000", "--release", Integer.toString(snapshot.settings().release())));
            boolean modular = sources.stream().anyMatch(s -> Path.of(s.file()).getFileName().toString().equals("module-info.java"));
            if (!modular && !snapshot.modulePath().isEmpty()) options.addAll(List.of("--add-modules", "ALL-MODULE-PATH"));
            var task = (JavacTask) compiler.getTask(new StringWriter(), manager, listener, options, null, sources.stream().map(MemorySource::new).toList());
            task.addTaskListener(new TaskListener() {
                @Override public void started(TaskEvent event) { checkpoint.run(); }
                @Override public void finished(TaskEvent event) { checkpoint.run(); }
            });
            task.parse(); checkpoint.run(); task.analyze(); checkpoint.run(); // Deliberately never generate() / call().
            if (problems.size() >= 1000) throw new JavaAnalysisContext.Failure("java_analysis_incomplete", "Compiler diagnostic limit reached; correct the reported context before checking again");
        }
    }

    private static final class MemorySource extends SimpleJavaFileObject {
        final JavaAnalysisContext.Source input;
        MemorySource(JavaAnalysisContext.Source input) { super(uri(input.file()), Kind.SOURCE); this.input = input; }
        @Override public CharSequence getCharContent(boolean ignoreEncodingErrors) { return input.content(); }
        private static URI uri(String file) {
            try { return new URI("memory", null, "/" + file, null); }
            catch (java.net.URISyntaxException invalid) { throw new IllegalArgumentException("Invalid source path", invalid); }
        }
    }
    static Position position(String content, long first, long last) {
        if (first < 0 || first > content.length()) return null;
        int start = (int) first, end = last < first ? start : (int) Math.min(last, content.length());
        int[] a = coordinates(content, start), b = coordinates(content, end);
        return new Position(start, end, a[0], a[1], b[0], b[1]);
    }
    private static int[] coordinates(String text, int offset) {
        int line = 1, begin = 0;
        for (int index = 0; index < offset; index++) {
            if (text.charAt(index) == '\r') { if (index + 1 < offset && text.charAt(index + 1) == '\n') index++; line++; begin = index + 1; }
            else if (text.charAt(index) == '\n') { line++; begin = index + 1; }
        }
        return new int[]{line, offset - begin + 1};
    }
}
