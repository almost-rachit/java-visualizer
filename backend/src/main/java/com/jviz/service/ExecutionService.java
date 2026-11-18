package com.jviz.service;

import com.jviz.engine.JdiDebugEngine;
import com.jviz.model.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/**
 * Orchestrates compilation → JDI execution → trace collection.
 * Manages active sessions and enforces a classroom concurrency limiter (Semaphore(3)).
 */
@Service
public class ExecutionService {

    private final CompilationService compilationService;
    private final NarratorService narratorService;

    @Value("${jviz.execution.timeout-seconds:5}")
    private int timeoutSeconds;

    @Value("${jviz.execution.work-dir:/tmp/jviz-workdir}")
    private String workDirBase;

    // Active engines keyed by session ID, so the Stop endpoint can kill them
    private final ConcurrentHashMap<String, JdiDebugEngine> activeSessions = new ConcurrentHashMap<>();

    // Classroom Concurrency Limiter: Max 3 simultaneous child JVMs inside 512MB container
    private final Semaphore executionLimiter = new Semaphore(3, true);

    public ExecutionService(CompilationService compilationService, NarratorService narratorService) {
        this.compilationService = compilationService;
        this.narratorService = narratorService;
    }

    /**
     * Compile and execute Java source code, returning the full trace.
     *
     * @param request the execution request
     * @return ExecutionTrace with compilation result and step-by-step trace
     */
    public ExecutionTrace compileAndExecute(ExecutionRequest request) throws IOException {
        boolean acquired;
        try {
            acquired = executionLimiter.tryAcquire(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return capacityErrorTrace("Server execution interrupted while queueing.");
        }

        if (!acquired) {
            return capacityErrorTrace("Server is at peak classroom capacity (3 concurrent executions). Please try again in a few seconds.");
        }

        try {
            String sessionId = UUID.randomUUID().toString();
            String className = request.className();
            Path workDir = Paths.get(workDirBase, sessionId);

            try {
                // ── Phase 1: Compile ──
                CompileResult compileResult = compilationService.compile(
                    request.sourceCode(), className, workDir
                );

                if (!compileResult.success()) {
                    return new ExecutionTrace(compileResult, List.of(), "", "", false, false);
                }

                // ── Phase 2: Execute with JDI ──
                JdiDebugEngine engine = new JdiDebugEngine(className, workDir, timeoutSeconds, narratorService);
                activeSessions.put(sessionId, engine);

                try {
                    JdiDebugEngine.ExecutionResult result = engine.execute();
                    return new ExecutionTrace(
                        compileResult,
                        result.steps(),
                        result.stdout(),
                        result.stderr(),
                        result.timedOut(),
                        result.killed()
                    );
                } finally {
                    activeSessions.remove(sessionId);
                }

            } finally {
                cleanupWorkDir(workDir);
            }
        } finally {
            executionLimiter.release();
        }
    }

    /**
     * Compile and execute, returning the session ID immediately so the
     * execution can be killed. The trace is returned via a CompletableFuture.
     */
    public CompletableFuture<ExecutionTrace> compileAndExecuteAsync(ExecutionRequest request,
                                                                      String sessionId) {
        return CompletableFuture.supplyAsync(() -> {
            boolean acquired;
            try {
                acquired = executionLimiter.tryAcquire(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return capacityErrorTrace("Server execution interrupted while queueing.");
            }

            if (!acquired) {
                return capacityErrorTrace("Server is at peak classroom capacity (3 concurrent executions). Please try again in a few seconds.");
            }

            try {
                String className = request.className();
                Path workDir = Paths.get(workDirBase, sessionId);

                try {
                    CompileResult compileResult = compilationService.compile(
                        request.sourceCode(), className, workDir
                    );

                    if (!compileResult.success()) {
                        return new ExecutionTrace(compileResult, List.of(), "", "", false, false);
                    }

                    JdiDebugEngine engine = new JdiDebugEngine(className, workDir, timeoutSeconds, narratorService);
                    activeSessions.put(sessionId, engine);

                    try {
                        JdiDebugEngine.ExecutionResult result = engine.execute();
                        return new ExecutionTrace(
                            compileResult, result.steps(), result.stdout(),
                            result.stderr(), result.timedOut(), result.killed()
                        );
                    } finally {
                        activeSessions.remove(sessionId);
                    }
                } finally {
                    cleanupWorkDir(workDir);
                }
            } catch (Exception e) {
                throw new CompletionException(e);
            } finally {
                executionLimiter.release();
            }
        });
    }

    private ExecutionTrace capacityErrorTrace(String msg) {
        CompileResult.CompileError error = new CompileResult.CompileError(
            0, 0,
            "Classroom Capacity Limit Reached",
            msg,
            "WARNING"
        );
        CompileResult res = new CompileResult(
            false,
            List.of(new CompileResult.CompileStage("Concurrency Control", "BUSY", "3 concurrent slots filled")),
            List.of(error),
            null
        );
        return new ExecutionTrace(res, List.of(), "", msg, false, false);
    }

    /**
     * Kill a running session by its ID.
     *
     * @return true if the session was found and killed
     */
    public boolean killSession(String sessionId) {
        JdiDebugEngine engine = activeSessions.remove(sessionId);
        if (engine != null) {
            engine.kill();
            return true;
        }
        return false;
    }

    /**
     * Kill all active executions.
     */
    public int killAll() {
        int count = activeSessions.size();
        activeSessions.forEach((id, engine) -> engine.kill());
        activeSessions.clear();
        return count;
    }

    private void cleanupWorkDir(Path workDir) {
        try {
            if (Files.exists(workDir)) {
                try (var walk = Files.walk(workDir)) {
                    walk.sorted(Comparator.reverseOrder())
                        .forEach(p -> {
                            try { Files.deleteIfExists(p); } catch (IOException ignored) {}
                        });
                }
            }
        } catch (IOException ignored) {}
    }
}
