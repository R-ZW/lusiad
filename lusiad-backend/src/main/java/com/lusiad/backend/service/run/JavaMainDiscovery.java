package com.lusiad.backend.service.run;

import com.lusiad.backend.service.diagnostics.JavaAnalysisContext;
import com.lusiad.backend.service.diagnostics.RuntimeJavaCompiler;
import com.sun.source.tree.*;
import com.sun.source.util.JavacTask;
import javax.tools.*;
import java.io.StringWriter;
import java.net.URI;
import java.util.*;

/** Finds launchable declarations in the captured sources, without reading the IDE project. */
public final class JavaMainDiscovery {
    public record MainClass(String className, String file, boolean test) {}
    private JavaMainDiscovery() {}

    public static List<MainClass> find(JavaAnalysisContext.Snapshot snapshot) throws Exception {
        JavaCompiler compiler = RuntimeJavaCompiler.get();
        if (compiler == null) throw new JavaAnalysisContext.Failure("java_compiler_unavailable", "The Run JDK does not provide javac");
        List<MainClass> result = new ArrayList<>();
        try (StandardJavaFileManager manager = compiler.getStandardFileManager(null, Locale.ROOT, java.nio.charset.StandardCharsets.UTF_8)) {
            for (var source : snapshot.sources().values()) {
                var input = new SimpleJavaFileObject(new URI("memory", null, "/" + source.file(), null), JavaFileObject.Kind.SOURCE) {
                    @Override public CharSequence getCharContent(boolean ignored) { return source.content(); }
                };
                JavacTask task = (JavacTask) compiler.getTask(new StringWriter(), manager, null,
                        List.of("-proc:none", "--release", Integer.toString(snapshot.settings().release())), null, List.of(input));
                for (CompilationUnitTree unit : task.parse()) {
                    String packageName = unit.getPackageName() == null ? "" : unit.getPackageName().toString();
                    for (Tree declaration : unit.getTypeDecls()) if (declaration instanceof ClassTree type)
                        visit(type, packageName, false, source.file(), source.test(), result);
                }
            }
        }
        result.sort(Comparator.comparing(MainClass::className).thenComparing(MainClass::file));
        return List.copyOf(result);
    }

    private static void visit(ClassTree type, String prefix, boolean nested, String file, boolean test, List<MainClass> result) {
        String name = type.getSimpleName().toString();
        if (name.isBlank()) return;
        String binary = prefix.isBlank() ? name : prefix + (nested ? "$" : ".") + name;
        boolean launchable = type.getMembers().stream().anyMatch(member -> member instanceof MethodTree method && main(method));
        if (launchable) result.add(new MainClass(binary, file, test));
        for (Tree member : type.getMembers()) if (member instanceof ClassTree inner)
            visit(inner, binary, true, file, test, result);
    }

    private static boolean main(MethodTree method) {
        var flags = method.getModifiers().getFlags();
        if (!method.getName().contentEquals("main") || !flags.contains(javax.lang.model.element.Modifier.PUBLIC)
                || !flags.contains(javax.lang.model.element.Modifier.STATIC) || method.getReturnType() == null
                || method.getReturnType().getKind() != Tree.Kind.PRIMITIVE_TYPE
                || ((PrimitiveTypeTree) method.getReturnType()).getPrimitiveTypeKind() != javax.lang.model.type.TypeKind.VOID
                || method.getParameters().size() != 1) return false;
        Tree parameter = method.getParameters().get(0).getType();
        if (!(parameter instanceof ArrayTypeTree array)) return false;
        String component = array.getType().toString();
        return component.equals("String") || component.equals("java.lang.String");
    }
}
