package com.jviz.model;

/**
 * Incoming request to compile and execute Java source code.
 */
public record ExecutionRequest(
    String sourceCode,
    String className  // e.g. "Main"
) {
    public ExecutionRequest {
        if (className == null || className.isBlank()) {
            className = "Main";
        }
    }
}
