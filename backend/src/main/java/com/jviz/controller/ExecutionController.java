package com.jviz.controller;

import com.jviz.model.*;
import com.jviz.service.CompilationService;
import com.jviz.service.ExecutionService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * REST controller exposing compile + execute + kill endpoints.
 */
@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "${cors.allowed-origins:*}")
public class ExecutionController {

    private final ExecutionService executionService;
    private final CompilationService compilationService;

    // Track async futures so we can poll results
    private final ConcurrentHashMap<String, CompletableFuture<ExecutionTrace>> pendingExecutions
        = new ConcurrentHashMap<>();

    public ExecutionController(ExecutionService executionService, CompilationService compilationService) {
        this.executionService = executionService;
        this.compilationService = compilationService;
    }

    /**
     * POST /api/execute
     * Synchronous: compiles and runs the code, returns the full JSON trace.
     */
    @PostMapping("/execute")
    public ResponseEntity<ExecutionTrace> execute(@RequestBody ExecutionRequest request) {
        try {
            ExecutionTrace trace = executionService.compileAndExecute(request);
            return ResponseEntity.ok(trace);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(
                new ExecutionTrace(null, null, "", e.getMessage(), false, false)
            );
        }
    }

    /**
     * POST /api/execute/async
     * Launches execution in background, returns a sessionId.
     * Use GET /api/execute/{sessionId}/result to poll for the result.
     * Use DELETE /api/execute/{sessionId} to kill it.
     */
    @PostMapping("/execute/async")
    public ResponseEntity<Map<String, String>> executeAsync(@RequestBody ExecutionRequest request) {
        String sessionId = UUID.randomUUID().toString();
        CompletableFuture<ExecutionTrace> future = executionService.compileAndExecuteAsync(request, sessionId);
        pendingExecutions.put(sessionId, future);
        future.whenComplete((r, ex) -> {
            // Auto-cleanup after 5 minutes
            CompletableFuture.delayedExecutor(300, java.util.concurrent.TimeUnit.SECONDS)
                .execute(() -> pendingExecutions.remove(sessionId));
        });
        return ResponseEntity.ok(Map.of("sessionId", sessionId, "status", "RUNNING"));
    }

    /**
     * GET /api/execute/{sessionId}/result
     * Returns the trace if execution is complete, 202 if still running.
     */
    @GetMapping("/execute/{sessionId}/result")
    public ResponseEntity<?> getResult(@PathVariable String sessionId) {
        CompletableFuture<ExecutionTrace> future = pendingExecutions.get(sessionId);
        if (future == null) {
            return ResponseEntity.notFound().build();
        }
        if (!future.isDone()) {
            return ResponseEntity.status(202).body(Map.of("sessionId", sessionId, "status", "RUNNING"));
        }
        try {
            ExecutionTrace trace = future.get();
            return ResponseEntity.ok(trace);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().body(
                Map.of("error", e.getMessage())
            );
        }
    }

    /**
     * DELETE /api/execute/{sessionId}
     * Kill a running execution.
     */
    @DeleteMapping("/execute/{sessionId}")
    public ResponseEntity<Map<String, Object>> killExecution(@PathVariable String sessionId) {
        boolean killed = executionService.killSession(sessionId);
        return ResponseEntity.ok(Map.of(
            "sessionId", sessionId,
            "killed", killed
        ));
    }

    /**
     * POST /api/compile
     * Compile-only endpoint (no execution).
     */
    @PostMapping("/compile")
    public ResponseEntity<CompileResult> compile(@RequestBody ExecutionRequest request) {
        try {
            java.nio.file.Path workDir = java.nio.file.Paths.get("/tmp/jviz-workdir",
                UUID.randomUUID().toString());
            CompileResult result = compilationService.compile(request.sourceCode(), request.className(), workDir);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * DELETE /api/execute
     * Kill all active executions.
     */
    @DeleteMapping("/execute")
    public ResponseEntity<Map<String, Object>> killAll() {
        int count = executionService.killAll();
        return ResponseEntity.ok(Map.of("killedCount", count));
    }

    /**
     * GET /api/health
     */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "engine", "JDI-based Java Execution Visualizer"));
    }
}
