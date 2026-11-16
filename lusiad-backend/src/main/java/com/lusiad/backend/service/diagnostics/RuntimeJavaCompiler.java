package com.lusiad.backend.service.diagnostics;

import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;
import java.util.ServiceLoader;

/** Same JDK compiler through its public SPI. IntelliJ's custom system loader may hide ToolProvider services. */
public final class RuntimeJavaCompiler {
    private RuntimeJavaCompiler() {}
    public static JavaCompiler get() {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler != null) return compiler;
        return ServiceLoader.load(ModuleLayer.boot(), JavaCompiler.class).stream()
                .filter(provider -> "jdk.compiler".equals(provider.type().getModule().getName()))
                .findFirst().map(ServiceLoader.Provider::get).orElse(null);
    }
}
