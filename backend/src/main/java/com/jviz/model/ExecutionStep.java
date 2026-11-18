package com.jviz.model;

import java.util.List;
import java.util.Map;

/**
 * A single execution step in the chronological trace.
 */
public record ExecutionStep(
    int stepIndex,
    int callDepth,
    String eventType,          // "STEP", "EXCEPTION", "METHOD_ENTRY", "METHOD_EXIT", "VM_DEATH"
    Location location,
    List<StackFrameInfo> callStack,
    HeapSnapshot heap,
    ExceptionInfo exception,   // null unless exception occurred
    String narrative           // plain-English 1-sentence explanation
) {
    public record Location(
        String className,
        String methodName,
        int lineNumber
    ) {}

    public record StackFrameInfo(
        int frameIndex,
        String className,
        String methodName,
        int lineNumber,
        String thisRef,                        // null for static methods
        Map<String, VariableValue> locals
    ) {}

    public record VariableValue(
        String name,
        String type,
        String value,
        String objectId   // null for primitives
    ) {}

    public record HeapSnapshot(
        List<HeapObject> objects,
        List<HeapObject> stringPool
    ) {}

    public record HeapObject(
        String objectId,
        String className,
        Map<String, VariableValue> fields,
        List<String> arrayElements,  // null if not an array
        int arrayLength,             // -1 if not an array
        boolean isStringPoolEntry
    ) {}

    public record ExceptionInfo(
        String exceptionClass,
        String message,
        String plainEnglishCause,
        List<String> stackTrace,
        int crashStepIndex
    ) {}
}
