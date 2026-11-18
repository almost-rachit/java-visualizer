import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { PipelineBar } from './components/PipelineBar';
import { Toolbar } from './components/Toolbar';
import { EditorPane } from './components/EditorPane';
import { MemoryCanvas } from './components/MemoryCanvas';
import { DebugConsole } from './components/DebugConsole';
import { PRESETS, CodePreset } from './constants/presets';
import {
  ExecutionTrace,
  ExecutionStep,
  CompileResult,
  CompileError,
  ExceptionInfo,
} from './types/jviz';
import {
  checkBackendHealth,
  startAsyncExecution,
  pollExecutionResult,
  killExecution,
} from './services/api';
import { Loader2 } from 'lucide-react';

export function App() {
  // Preset and Code state
  const [selectedPreset, setSelectedPreset] = useState<CodePreset>(PRESETS[0]);
  const [code, setCode] = useState<string>(PRESETS[0].code);

  // Classroom / Projector Mode state
  const [isProjectorMode, setIsProjectorMode] = useState<boolean>(false);

  // Backend Health & Cold-start wakeup banner
  const [backendHealth, setBackendHealth] = useState<{ status: string; engine?: string }>({
    status: 'UNKNOWN',
  });
  const [isWakingUp, setIsWakingUp] = useState<boolean>(false);

  // Execution Lifecycle State
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isKilled, setIsKilled] = useState<boolean>(false);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);

  // Trace and Step navigation state
  const [trace, setTrace] = useState<ExecutionTrace | null>(null);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);

  // Auto-play state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speed, setSpeed] = useState<number>(1);
  const playTimerRef = useRef<any>(null);

  // Health check with 3-second cold-start detection
  useEffect(() => {
    let isMounted = true;

    // If health check hasn't returned UP after 3 seconds, show waking up banner
    const wakingTimer = setTimeout(() => {
      if (isMounted && backendHealth.status !== 'UP') {
        setIsWakingUp(true);
      }
    }, 3000);

    const performHealthCheck = async () => {
      const health = await checkBackendHealth(6000);
      if (!isMounted) return;
      setBackendHealth(health);
      if (health.status === 'UP') {
        setIsWakingUp(false);
      }
    };

    performHealthCheck();
    const interval = setInterval(performHealthCheck, 8000);

    return () => {
      isMounted = false;
      clearTimeout(wakingTimer);
      clearInterval(interval);
    };
  }, []);

  const refreshHealth = async () => {
    const health = await checkBackendHealth(4000);
    setBackendHealth(health);
    if (health.status === 'UP') {
      setIsWakingUp(false);
    }
  };

  // Handle Preset Change
  const handleSelectPreset = (preset: CodePreset) => {
    if (isRunning) return;
    setSelectedPreset(preset);
    setCode(preset.code);
    setTrace(null);
    setCompileResult(null);
    setCurrentStepIndex(0);
    setIsKilled(false);
    setIsTimedOut(false);
    setIsPlaying(false);
  };

  // Compile & Debug (Launch async and poll)
  const handleCompileAndDebug = async () => {
    setIsPlaying(false);
    setIsCompiling(true);
    setIsRunning(true);
    setIsKilled(false);
    setIsTimedOut(false);
    setTrace(null);
    setCurrentStepIndex(0);

    try {
      const newSessionId = await startAsyncExecution({
        sourceCode: code,
        className: 'Main',
      });
      setSessionId(newSessionId);
      setIsCompiling(false);

      // Poll for completion
      const executionTrace = await pollExecutionResult(newSessionId);
      setTrace(executionTrace);
      setCompileResult(executionTrace.compilation);
      setIsTimedOut(executionTrace.timedOut);
      setIsKilled(executionTrace.killed);

      if (executionTrace.steps && executionTrace.steps.length > 0) {
        setCurrentStepIndex(0);
      }
    } catch (err: any) {
      console.error('Execution error:', err);
      if (err.message?.includes('timed out')) {
        setIsTimedOut(true);
      }
    } finally {
      setIsCompiling(false);
      setIsRunning(false);
    }
  };

  // Stop / Kill Execution
  const handleStop = async () => {
    if (sessionId) {
      setIsRunning(false);
      setIsKilled(true);
      setIsPlaying(false);
      await killExecution(sessionId);
    }
  };

  // Step Navigation Functions
  const totalSteps = trace?.steps?.length || 0;
  const currentStep: ExecutionStep | null =
    trace?.steps && trace.steps[currentStepIndex] ? trace.steps[currentStepIndex] : null;

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepInto = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  // Step Over: Advances to next step with callDepth <= current.callDepth
  const handleStepOver = () => {
    if (!trace || !currentStep) return;
    setIsPlaying(false);
    const targetDepth = currentStep.callDepth;
    const nextIdx = trace.steps.findIndex(
      (s, idx) => idx > currentStepIndex && s.callDepth <= targetDepth
    );
    if (nextIdx !== -1) {
      setCurrentStepIndex(nextIdx);
    } else {
      setCurrentStepIndex(totalSteps - 1);
    }
  };

  // Step Out: Advances to next step with callDepth < current.callDepth
  const handleStepOut = () => {
    if (!trace || !currentStep) return;
    setIsPlaying(false);
    const targetDepth = currentStep.callDepth;
    const nextIdx = trace.steps.findIndex(
      (s, idx) => idx > currentStepIndex && s.callDepth < targetDepth
    );
    if (nextIdx !== -1) {
      setCurrentStepIndex(nextIdx);
    } else {
      setCurrentStepIndex(totalSteps - 1);
    }
  };

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  // Auto-play timer loop
  useEffect(() => {
    if (isPlaying) {
      const delayMs = Math.round(500 / speed);
      playTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= totalSteps - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, delayMs);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, speed, totalSteps]);

  // Active line and caller frames for Monaco Editor
  const currentLine = currentStep?.location?.lineNumber || null;

  const callStackLines = useMemo(() => {
    if (!currentStep) return [];
    return currentStep.callStack.map((f) => f.lineNumber);
  }, [currentStep]);

  const compileErrors: CompileError[] = compileResult?.errors || [];
  const runtimeException: ExceptionInfo | null = currentStep?.exception || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f17] text-gray-100 overflow-hidden font-sans">
      {/* 1. Top Brand & Presets Bar */}
      <Navbar
        backendHealth={backendHealth}
        selectedPresetId={selectedPreset.id}
        onSelectPreset={handleSelectPreset}
        isRunning={isRunning}
        onRefreshHealth={refreshHealth}
      />

      {/* Cloud Cold-Start Non-Intrusive Banner */}
      {isWakingUp && (
        <div className="bg-gradient-to-r from-amber-950/90 via-yellow-950/80 to-amber-950/90 border-b border-amber-500/40 px-4 py-1.5 text-xs text-amber-200 flex items-center justify-between shadow-lg shadow-amber-950/30 animate-in slide-in-from-top duration-300 select-none">
          <div className="flex items-center space-x-2.5">
            <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
            <div>
              <span className="font-bold text-amber-100">Waking up cloud JVM engine (~40s on first load)...</span>
              <span className="text-[11px] text-amber-300/80 ml-2 hidden sm:inline">
                Free cloud containers sleep when idle; your session will connect automatically.
              </span>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 shrink-0">
            Free Tier Warmup
          </span>
        </div>
      )}

      {/* 2. Under-the-Hood JVM Lifecycle Pipeline Bar */}
      <PipelineBar
        compileResult={compileResult}
        currentStep={currentStep}
        totalSteps={totalSteps}
        isCompiling={isCompiling}
        isRunning={isRunning}
        isKilled={isKilled}
        isTimedOut={isTimedOut}
        hasException={!!runtimeException}
      />

      {/* 3. Top Debugger Control Toolbar (with Projector Mode toggle) */}
      <Toolbar
        onCompileAndDebug={handleCompileAndDebug}
        onStop={handleStop}
        onReset={handleReset}
        onStepBack={handleStepBack}
        onStepInto={handleStepInto}
        onStepOver={handleStepOver}
        onStepOut={handleStepOut}
        onTogglePlay={handleTogglePlay}
        isPlaying={isPlaying}
        isCompiling={isCompiling}
        isRunning={isRunning}
        currentStepIndex={currentStepIndex}
        totalSteps={totalSteps}
        speed={speed}
        onChangeSpeed={setSpeed}
        currentStep={currentStep}
        isProjectorMode={isProjectorMode}
        onToggleProjectorMode={() => setIsProjectorMode((prev) => !prev)}
      />

      {/* 4. Main Split View: Left Monaco Editor | Right Animated Memory Canvas */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left: Code Editor (responsive width) */}
        <div className={`h-1/2 md:h-full shrink-0 transition-all ${
          isProjectorMode ? 'w-full md:w-[48%] lg:w-[45%]' : 'w-full md:w-[42%] lg:w-[38%]'
        }`}>
          <EditorPane
            code={code}
            onChangeCode={setCode}
            currentLine={currentLine}
            callStackLines={callStackLines}
            compileErrors={compileErrors}
            runtimeException={runtimeException}
            readOnly={isRunning}
            isProjectorMode={isProjectorMode}
          />
        </div>

        {/* Right: Animated Memory Canvas (Stack + Heap + SVG Pointers) */}
        <div className="flex-1 h-1/2 md:h-full min-w-0">
          <MemoryCanvas currentStep={currentStep} isProjectorMode={isProjectorMode} />
        </div>
      </div>

      {/* 5. Bottom Debug Box: Live Internals & Console */}
      <DebugConsole
        currentStep={currentStep}
        trace={trace}
        isKilled={isKilled}
        isTimedOut={isTimedOut}
      />
    </div>
  );
}

export default App;
