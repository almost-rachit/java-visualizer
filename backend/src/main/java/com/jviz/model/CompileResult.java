package com.jviz.model;

import java.util.List;

/**
 * Result from the javax.tools.JavaCompiler pipeline.
 */
public record CompileResult(
    boolean success,
    List<CompileStage> stages,
    List<CompileError> errors,
    String classFilePath   // null if compilation failed
) {
    public record CompileStage(String name, String status, String detail) {}

    public record CompileError(
        long line,
        long column,
        String message,
        String explanation,  // plain-English why
        String kind          // ERROR, WARNING, etc.
    ) {}
}
