package com.jviz.engine;

import com.jviz.model.ExecutionStep;
import com.jviz.model.ExecutionStep.ExceptionInfo;
import com.jviz.model.ExecutionStep.HeapObject;
import com.jviz.model.ExecutionStep.HeapSnapshot;
import com.jviz.model.ExecutionStep.StackFrameInfo;
import com.jviz.model.ExecutionStep.VariableValue;
import com.jviz.service.NarratorService;

import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import java.io.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * JDI-based debug engine that launches a child JVM, single-steps through user code,
 * and captures full memory snapshots at each step.
 *
 * Uses com.sun.jdi (the real JDK Debug Interface) — no regex parsing.
 */
public class JdiDebugEngine implements AutoCloseable {

    private final String className;
    private final Path classPath;
    private final int timeoutSeconds;
    private final NarratorService narrator;

    private VirtualMachine vm;
    private Process process;
    private final AtomicBoolean killed = new AtomicBoolean(false);
    private final AtomicBoolean timedOut = new AtomicBoolean(false);
    private final List<ExecutionStep> trace = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger stepCounter = new AtomicInteger(0);

    // Track objects we've seen on the heap across steps (objectId -> last snapshot)
    private final Map<Long, HeapObject> heapRegistry = new ConcurrentHashMap<>();
    // Track string pool entries (interned strings share the same underlying mirror)
    private final Set<Long> stringPoolIds = ConcurrentHashMap.newKeySet();

    private final StringBuilder stdoutCapture = new StringBuilder();
    private final StringBuilder stderrCapture = new StringBuilder();

    // Classroom Guardrail: Maximum recorded steps to prevent heap exhaustion
    private static final int MAX_RECORDED_STEPS = 500;

    // Classes to skip during stepping (JDK internals)
    private static final Set<String> SKIP_PREFIXES = Set.of(
        "java.", "javax.", "sun.", "com.sun.", "jdk.", "module "
    );

    public JdiDebugEngine(String className, Path classPath, int timeoutSeconds, NarratorService narrator) {
        this.className = className;
        this.classPath = classPath;
        this.timeoutSeconds = timeoutSeconds;
        this.narrator = narrator;
    }

    /**
     * Launch, step, and collect the full trace. Returns when execution completes,
     * times out, or is killed.
     */
    public ExecutionResult execute() {
        try {
            launchVm();
            collectTrace();
        } catch (VMDisconnectedException e) {
            // Normal termination
        } catch (Exception e) {
            stderrCapture.append("Engine error: ").append(e.getMessage()).append("\n");
        } finally {
            cleanup();
        }
        return new ExecutionResult(
            Collections.unmodifiableList(new ArrayList<>(trace)),
            stdoutCapture.toString(),
            stderrCapture.toString(),
            timedOut.get(),
            killed.get()
        );
    }

    /**
     * Kill the child JVM immediately.
     */
    public void kill() {
        killed.set(true);
        if (vm != null) {
            try { vm.exit(1); } catch (Exception ignored) {}
        }
        if (process != null) {
            process.destroyForcibly();
        }
    }

    // ─── VM Launch ──────────────────────────────────────────────────────────────

    private void launchVm() throws Exception {
        LaunchingConnector connector = Bootstrap.virtualMachineManager()
            .defaultConnector();

        Map<String, Connector.Argument> args = connector.defaultArguments();
        args.get("main").setValue(className);
        // Low-memory flags for target JVM inside 512MB container
        args.get("options").setValue("-cp " + classPath.toString() + " -Xms16m -Xmx128m -XX:+UseSerialGC");
        // Suspend immediately so we can set breakpoints before anything runs
        args.get("suspend").setValue("true");

        vm = connector.launch(args);
        process = vm.process();

        // Capture stdout/stderr in background threads
        startStreamCapture(process.getInputStream(), stdoutCapture);
        startStreamCapture(process.getErrorStream(), stderrCapture);
    }

    // ─── Event Loop ─────────────────────────────────────────────────────────────

    private void collectTrace() throws Exception {
        EventRequestManager erm = vm.eventRequestManager();

        // Set a breakpoint on the main method of the user's class
        // We need to wait for the class to be loaded first
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter(className);
        cpr.enable();

        // Also request exception events
        ExceptionRequest exReq = erm.createExceptionRequest(null, true, true);
        exReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        exReq.enable();

        // Set up timeout
        ScheduledExecutorService timeoutExecutor = Executors.newSingleThreadScheduledExecutor();
        timeoutExecutor.schedule(() -> {
            timedOut.set(true);
            kill();
        }, timeoutSeconds, TimeUnit.SECONDS);

        try {
            vm.resume();
            eventLoop(erm);
        } finally {
            timeoutExecutor.shutdownNow();
        }
    }

    private void eventLoop(EventRequestManager erm) {
        EventQueue queue = vm.eventQueue();

        while (!killed.get() && !timedOut.get()) {
            if (stepCounter.get() >= MAX_RECORDED_STEPS) {
                trace.add(new ExecutionStep(
                    stepCounter.getAndIncrement(), 1, "STEP_LIMIT_EXCEEDED",
                    null, List.of(), null, null,
                    "Execution stopped: reached maximum classroom limit of 500 steps. Tight loop was automatically capped to preserve cloud memory."
                ));
                kill();
                return;
            }
            try {
                EventSet eventSet = queue.remove(500); // 500ms poll
                if (eventSet == null) continue;

                for (Event event : eventSet) {
                    if (killed.get() || timedOut.get()) break;

                    if (event instanceof ClassPrepareEvent cpe) {
                        handleClassPrepare(cpe, erm);
                    } else if (event instanceof BreakpointEvent bpe) {
                        handleStep(bpe.thread(), "STEP");
                        enableStepping(bpe.thread(), erm);
                    } else if (event instanceof StepEvent se) {
                        handleStepEvent(se);
                    } else if (event instanceof ExceptionEvent ee) {
                        handleException(ee);
                    } else if (event instanceof VMDeathEvent || event instanceof VMDisconnectEvent) {
                        // Add final step
                        trace.add(new ExecutionStep(
                            stepCounter.getAndIncrement(), 0, "VM_DEATH",
                            null, List.of(), null, null,
                            "Program execution completed."
                        ));
                        return;
                    }
                }
                eventSet.resume();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (VMDisconnectedException e) {
                break;
            }
        }
    }

    private void handleClassPrepare(ClassPrepareEvent event, EventRequestManager erm) {
        ReferenceType refType = event.referenceType();
        // Set breakpoint at first executable line of main()
        for (Method method : refType.methods()) {
            if (method.name().equals("main") && method.isStatic()) {
                try {
                    List<com.sun.jdi.Location> locations = method.allLineLocations();
                    if (!locations.isEmpty()) {
                        BreakpointRequest bp = erm.createBreakpointRequest(locations.getFirst());
                        bp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
                        bp.enable();
                    }
                } catch (AbsentInformationException e) {
                    // No line info — compiled without -g
                }
                break;
            }
        }
    }

    private void enableStepping(ThreadReference thread, EventRequestManager erm) {
        // Remove any old step requests for this thread
        for (StepRequest sr : erm.stepRequests()) {
            if (sr.thread().equals(thread)) {
                erm.deleteEventRequest(sr);
            }
        }
        StepRequest stepReq = erm.createStepRequest(
            thread, StepRequest.STEP_LINE, StepRequest.STEP_INTO
        );
        // Filter out JDK classes to only step through user code
        stepReq.addClassExclusionFilter("java.*");
        stepReq.addClassExclusionFilter("javax.*");
        stepReq.addClassExclusionFilter("sun.*");
        stepReq.addClassExclusionFilter("com.sun.*");
        stepReq.addClassExclusionFilter("jdk.*");
        stepReq.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        stepReq.enable();
    }

    private void handleStepEvent(StepEvent event) {
        ThreadReference thread = event.thread();
        com.sun.jdi.Location loc = event.location();

        // Skip JDK internal classes
        String locClassName = loc.declaringType().name();
        for (String prefix : SKIP_PREFIXES) {
            if (locClassName.startsWith(prefix)) return;
        }

        handleStep(thread, "STEP");
    }

    // ─── Snapshot Capture ───────────────────────────────────────────────────────

    private void handleStep(ThreadReference thread, String eventType) {
        if (stepCounter.get() >= MAX_RECORDED_STEPS) {
            return;
        }
        try {
            int callDepth = thread.frameCount();
            List<StackFrameInfo> callStack = captureCallStack(thread);
            HeapSnapshot heap = captureHeap(thread);

            ExecutionStep.Location loc = null;
            if (!callStack.isEmpty()) {
                StackFrameInfo top = callStack.getFirst();
                loc = new ExecutionStep.Location(top.className(), top.methodName(), top.lineNumber());
            }

            int idx = stepCounter.getAndIncrement();
            ExecutionStep step = new ExecutionStep(
                idx, callDepth, eventType, loc,
                callStack, heap, null,
                "" // placeholder, fill below
            );

            String narrative = narrator.narrate(step);
            // Reconstruct with narrative
            step = new ExecutionStep(
                step.stepIndex(), step.callDepth(), step.eventType(), step.location(),
                step.callStack(), step.heap(), step.exception(), narrative
            );

            trace.add(step);
        } catch (IncompatibleThreadStateException | VMDisconnectedException e) {
            // Thread not suspended or VM disconnected
        }
    }

    private void handleException(ExceptionEvent event) {
        ThreadReference thread = event.thread();
        ObjectReference exceptionObj = event.exception();

        try {
            String exClass = exceptionObj.referenceType().name();

            // Skip internal JDK exceptions that are caught internally
            for (String prefix : SKIP_PREFIXES) {
                if (exClass.startsWith(prefix) && event.catchLocation() != null) {
                    // This is an internal caught exception — skip it
                    return;
                }
            }

            String exMessage = extractExceptionMessage(exceptionObj);
            String plainCause = narrator.explainException(exClass, exMessage);

            List<String> stackTraceStrings = new ArrayList<>();
            try {
                int frameCount = thread.frameCount();
                for (int i = 0; i < Math.min(frameCount, 20); i++) {
                    StackFrame frame = thread.frame(i);
                    com.sun.jdi.Location loc = frame.location();
                    stackTraceStrings.add(String.format("  at %s.%s(%s:%d)",
                        loc.declaringType().name(), loc.method().name(),
                        loc.sourceName(), loc.lineNumber()));
                }
            } catch (Exception ignored) {}

            int callDepth = thread.frameCount();
            List<StackFrameInfo> callStack = captureCallStack(thread);
            HeapSnapshot heap = captureHeap(thread);

            ExecutionStep.Location loc = null;
            if (!callStack.isEmpty()) {
                StackFrameInfo top = callStack.getFirst();
                loc = new ExecutionStep.Location(top.className(), top.methodName(), top.lineNumber());
            }

            int idx = stepCounter.getAndIncrement();
            ExceptionInfo exInfo = new ExceptionInfo(
                exClass, exMessage, plainCause, stackTraceStrings, idx
            );

            String narrative = String.format("%s thrown: %s. %s", exClass, exMessage, plainCause);

            ExecutionStep step = new ExecutionStep(
                idx, callDepth, "EXCEPTION", loc,
                callStack, heap, exInfo, narrative
            );

            trace.add(step);
        } catch (IncompatibleThreadStateException | VMDisconnectedException e) {
            // Ignore
        }
    }

    // ─── Call Stack Capture ─────────────────────────────────────────────────────

    private List<StackFrameInfo> captureCallStack(ThreadReference thread)
            throws IncompatibleThreadStateException {
        List<StackFrameInfo> frames = new ArrayList<>();
        int frameCount = thread.frameCount();

        for (int i = 0; i < frameCount; i++) {
            StackFrame frame = thread.frame(i);
            com.sun.jdi.Location loc = frame.location();
            String clsName = loc.declaringType().name();

            // Only include user-code frames (skip JDK internals)
            boolean isUserCode = true;
            for (String prefix : SKIP_PREFIXES) {
                if (clsName.startsWith(prefix)) {
                    isUserCode = false;
                    break;
                }
            }
            if (!isUserCode) continue;

            String thisRef = null;
            try {
                ObjectReference thisObj = frame.thisObject();
                if (thisObj != null) {
                    thisRef = "@" + thisObj.uniqueID();
                }
            } catch (Exception ignored) {}

            Map<String, VariableValue> locals = captureLocals(frame);

            frames.add(new StackFrameInfo(
                i, clsName, loc.method().name(), loc.lineNumber(),
                thisRef, locals
            ));
        }
        return frames;
    }

    private Map<String, VariableValue> captureLocals(StackFrame frame) {
        Map<String, VariableValue> locals = new LinkedHashMap<>();
        try {
            List<LocalVariable> visibleVars = frame.visibleVariables();
            for (LocalVariable var : visibleVars) {
                Value value = frame.getValue(var);
                locals.put(var.name(), valueToVariableValue(var.name(), var.typeName(), value));
            }
        } catch (AbsentInformationException | IllegalArgumentException e) {
            // No debug info available or frame invalidated
        }
        return locals;
    }

    // ─── Heap Capture ───────────────────────────────────────────────────────────

    private HeapSnapshot captureHeap(ThreadReference thread) {
        List<HeapObject> objects = new ArrayList<>();
        List<HeapObject> stringPool = new ArrayList<>();

        // Traverse all locals' object references to build the reachable heap
        try {
            int frameCount = thread.frameCount();
            Set<Long> visited = new HashSet<>();

            for (int i = 0; i < frameCount; i++) {
                StackFrame frame = thread.frame(i);
                try {
                    // this object
                    ObjectReference thisObj = frame.thisObject();
                    if (thisObj != null) {
                        traverseObject(thisObj, objects, stringPool, visited, 0);
                    }
                    // local variables
                    for (LocalVariable var : frame.visibleVariables()) {
                        Value val = frame.getValue(var);
                        if (val instanceof ObjectReference objRef) {
                            traverseObject(objRef, objects, stringPool, visited, 0);
                        }
                    }
                } catch (AbsentInformationException ignored) {}
            }
        } catch (IncompatibleThreadStateException ignored) {}

        return new HeapSnapshot(objects, stringPool);
    }

    private void traverseObject(ObjectReference objRef, List<HeapObject> objects,
                                 List<HeapObject> stringPool, Set<Long> visited, int depth) {
        if (objRef == null || depth > 5 || !visited.add(objRef.uniqueID())) return;

        long id = objRef.uniqueID();
        String clsName = objRef.referenceType().name();

        // Skip JDK internal types (except String, arrays, and common collections)
        if (!clsName.startsWith("[") && !clsName.equals("java.lang.String")
                && !clsName.startsWith("java.util.ArrayList")
                && !clsName.startsWith("java.util.HashMap")) {
            boolean isUserClass = true;
            for (String prefix : SKIP_PREFIXES) {
                if (clsName.startsWith(prefix)) {
                    isUserClass = false;
                    break;
                }
            }
            if (!isUserClass) return;
        }

        if (objRef instanceof ArrayReference arrRef) {
            // Array
            List<String> elements = new ArrayList<>();
            for (Value v : arrRef.getValues()) {
                elements.add(valueToString(v));
            }
            HeapObject heapObj = new HeapObject(
                String.valueOf(id), clsName, Map.of(),
                elements, arrRef.length(), false
            );
            objects.add(heapObj);
            heapRegistry.put(id, heapObj);

            // Recurse into object elements
            for (Value v : arrRef.getValues()) {
                if (v instanceof ObjectReference or2) {
                    traverseObject(or2, objects, stringPool, visited, depth + 1);
                }
            }
        } else if (clsName.equals("java.lang.String")) {
            // String — detect pool vs heap
            String strValue = extractStringValue(objRef);
            boolean isPooled = isStringInterned(objRef);

            HeapObject heapObj = new HeapObject(
                String.valueOf(id), "String",
                Map.of("value", new VariableValue("value", "String", strValue, null)),
                null, -1, isPooled
            );

            if (isPooled) {
                stringPool.add(heapObj);
                stringPoolIds.add(id);
            } else {
                objects.add(heapObj);
            }
            heapRegistry.put(id, heapObj);
        } else {
            // Regular object
            Map<String, VariableValue> fields = new LinkedHashMap<>();
            for (Field field : objRef.referenceType().allFields()) {
                if (field.isStatic()) continue;
                try {
                    Value val = objRef.getValue(field);
                    fields.put(field.name(), valueToVariableValue(field.name(), field.typeName(), val));
                    if (val instanceof ObjectReference or2) {
                        traverseObject(or2, objects, stringPool, visited, depth + 1);
                    }
                } catch (Exception ignored) {}
            }

            HeapObject heapObj = new HeapObject(
                String.valueOf(id), clsName, fields, null, -1, false
            );
            objects.add(heapObj);
            heapRegistry.put(id, heapObj);
        }
    }

    // ─── Value Utilities ────────────────────────────────────────────────────────

    private VariableValue valueToVariableValue(String name, String type, Value value) {
        if (value == null) {
            return new VariableValue(name, type, "null", null);
        }
        if (value instanceof PrimitiveValue pv) {
            return new VariableValue(name, type, pv.toString(), null);
        }
        if (value instanceof StringReference sr) {
            return new VariableValue(name, "String", "\"" + sr.value() + "\"",
                String.valueOf(((ObjectReference) value).uniqueID()));
        }
        if (value instanceof ArrayReference ar) {
            return new VariableValue(name, type,
                type + "[" + ar.length() + "]",
                String.valueOf(((ObjectReference) value).uniqueID()));
        }
        if (value instanceof ObjectReference or) {
            return new VariableValue(name, type,
                type + "@" + or.uniqueID(),
                String.valueOf(or.uniqueID()));
        }
        return new VariableValue(name, type, value.toString(), null);
    }

    private String valueToString(Value value) {
        if (value == null) return "null";
        if (value instanceof PrimitiveValue pv) return pv.toString();
        if (value instanceof StringReference sr) return "\"" + sr.value() + "\"";
        if (value instanceof ObjectReference or) return or.referenceType().name() + "@" + or.uniqueID();
        return value.toString();
    }

    private String extractStringValue(ObjectReference stringRef) {
        try {
            // In modern JVMs, String has a 'value' field that is a byte[] and a 'coder' field
            Field valueField = stringRef.referenceType().fieldByName("value");
            if (valueField != null) {
                Value val = stringRef.getValue(valueField);
                if (val instanceof ArrayReference arr) {
                    // Try to get the string via StringReference casting
                    if (stringRef instanceof StringReference sr) {
                        return sr.value();
                    }
                    // Fallback: reconstruct from byte array
                    StringBuilder sb = new StringBuilder();
                    for (Value b : arr.getValues()) {
                        if (b instanceof ByteValue bv) {
                            sb.append((char) bv.value());
                        }
                    }
                    return sb.toString();
                }
            }
            if (stringRef instanceof StringReference sr) {
                return sr.value();
            }
        } catch (Exception e) {
            // fallback
        }
        return stringRef.toString();
    }

    private boolean isStringInterned(ObjectReference stringRef) {
        // A string is "interned" (in the constant pool) if another String with the same
        // value shares the same object ID. We track this heuristically:
        // - Strings created from literals end up in the pool.
        // - We check if we've seen this exact ID before (meaning it's shared/interned).
        // JDI doesn't expose intern info directly, so we use the heuristic that
        // strings with IDs we've previously encountered are likely pool entries.
        return stringPoolIds.contains(stringRef.uniqueID());
    }

    private String extractExceptionMessage(ObjectReference exObj) {
        try {
            // Call toString() or get the detailMessage field
            Field msgField = exObj.referenceType().fieldByName("detailMessage");
            if (msgField != null) {
                Value val = exObj.getValue(msgField);
                if (val instanceof StringReference sr) {
                    return sr.value();
                }
            }
        } catch (Exception ignored) {}
        return exObj.referenceType().name();
    }

    // ─── Stream Capture ─────────────────────────────────────────────────────────

    private void startStreamCapture(InputStream is, StringBuilder capture) {
        Thread.ofVirtual().start(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(is))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    capture.append(line).append("\n");
                }
            } catch (IOException ignored) {}
        });
    }

    // ─── Cleanup ────────────────────────────────────────────────────────────────

    private void cleanup() {
        if (vm != null) {
            try { vm.dispose(); } catch (Exception ignored) {}
        }
        if (process != null) {
            process.destroyForcibly();
        }
    }

    @Override
    public void close() {
        kill();
    }

    // ─── Result Record ──────────────────────────────────────────────────────────

    public record ExecutionResult(
        List<ExecutionStep> steps,
        String stdout,
        String stderr,
        boolean timedOut,
        boolean killed
    ) {}
}
