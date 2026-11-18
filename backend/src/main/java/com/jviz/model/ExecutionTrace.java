package com.jviz.model;

import java.util.List;

/**
 * Full trace result returned to the frontend.
 */
public record ExecutionTrace(
    CompileResult compilation,
    List<ExecutionStep> steps,
    String stdout,
    String stderr,
    boolean timedOut,
    boolean killed
) {}
