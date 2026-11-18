package com.jviz.service;

import com.jviz.model.ExecutionStep;
import com.jviz.model.ExecutionStep.*;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Generates plain-English narrative descriptions for each execution step.
 */
@Service
public class NarratorService {

    public String narrate(ExecutionStep step) {
        if (step == null) return "";

        Location loc = step.location();
        String where = loc != null
            ? String.format("at %s.%s() line %d", loc.className(), loc.methodName(), loc.lineNumber())
            : "at unknown location";

        return switch (step.eventType()) {
            case "STEP" -> narrateStep(step, where);
            case "EXCEPTION" -> narrateException(step, where);
            case "METHOD_ENTRY" -> String.format("Entered method %s.%s() (call depth %d)",
                loc != null ? loc.className() : "?", loc != null ? loc.methodName() : "?", step.callDepth());
            case "METHOD_EXIT" -> String.format("Returned from method %s.%s() (call depth %d)",
                loc != null ? loc.className() : "?", loc != null ? loc.methodName() : "?", step.callDepth());
            case "VM_DEATH" -> "Program execution completed.";
            default -> String.format("Execution step %d %s", step.stepIndex(), where);
        };
    }

    private String narrateStep(ExecutionStep step, String where) {
        List<StackFrameInfo> stack = step.callStack();
        HeapSnapshot heap = step.heap();

        if (stack == null || stack.isEmpty()) {
            return "Executing " + where;
        }

        StackFrameInfo topFrame = stack.getFirst();
        Map<String, VariableValue> locals = topFrame.locals();

        // Look for newly allocated objects by scanning heap
        StringBuilder sb = new StringBuilder();

        if (heap != null && heap.objects() != null) {
            for (HeapObject obj : heap.objects()) {
                if (obj.arrayLength() >= 0) {
                    sb.append(String.format("Allocated %s of size %d on the Heap at @%s and stored its reference on the %s stack frame. ",
                        obj.className(), obj.arrayLength(), obj.objectId(),
                        topFrame.methodName()));
                }
            }
        }

        if (!sb.isEmpty()) {
            return sb.toString().trim();
        }

        // Describe locals
        if (locals != null && !locals.isEmpty()) {
            List<String> varDescriptions = new ArrayList<>();
            for (var entry : locals.entrySet()) {
                VariableValue v = entry.getValue();
                if (v.objectId() != null) {
                    varDescriptions.add(String.format("%s %s = ref @%s", v.type(), v.name(), v.objectId()));
                } else {
                    varDescriptions.add(String.format("%s %s = %s", v.type(), v.name(), v.value()));
                }
            }
            return String.format("Executing %s — locals: [%s]", where, String.join(", ", varDescriptions));
        }

        return "Executing " + where;
    }

    private String narrateException(ExecutionStep step, String where) {
        ExceptionInfo ex = step.exception();
        if (ex == null) {
            return "Exception thrown " + where;
        }
        return String.format("%s thrown %s: %s. %s",
            ex.exceptionClass(), where, ex.message(), ex.plainEnglishCause());
    }

    /**
     * Generate a plain-English cause for common exceptions.
     */
    public String explainException(String exceptionClass, String message) {
        return switch (exceptionClass) {
            case "java.lang.NullPointerException" ->
                "You tried to use a reference variable that is currently null (pointing to nothing). "
                + "Make sure the object is instantiated before calling methods or accessing fields on it.";
            case "java.lang.ArrayIndexOutOfBoundsException" ->
                "You tried to access an array element at an index that doesn't exist. "
                + "Arrays are 0-indexed, so valid indices are 0 to length-1. " + (message != null ? "Index was: " + message : "");
            case "java.lang.StackOverflowError" ->
                "The call stack exceeded its maximum size, usually caused by infinite recursion. "
                + "Check that your recursive method has a proper base case that stops the recursion.";
            case "java.lang.ArithmeticException" ->
                "An illegal arithmetic operation occurred, most commonly division by zero.";
            case "java.lang.ClassCastException" ->
                "You tried to cast an object to a type that it is not an instance of. "
                + "Check your type hierarchy and use 'instanceof' before casting.";
            case "java.lang.StringIndexOutOfBoundsException" ->
                "You tried to access a character in a String at an index that is out of range.";
            case "java.lang.NumberFormatException" ->
                "You tried to convert a String to a number, but the String doesn't contain a valid numeric value.";
            case "java.lang.IllegalArgumentException" ->
                "A method received an argument that it cannot accept. Check the method's documentation for valid parameter values.";
            case "java.lang.OutOfMemoryError" ->
                "The JVM ran out of heap memory. Your program may be creating too many objects or holding references that prevent garbage collection.";
            default -> message != null ? message : "A runtime exception occurred.";
        };
    }
}
