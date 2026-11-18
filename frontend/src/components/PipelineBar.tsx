import React, { useState } from 'react';
import {
  FileCode2,
  Binary,
  Layers,
  Cpu,
  CheckCircle,
  AlertTriangle,
  XOctagon,
  ChevronRight,
  Info,
  X,
  FileCheck,
  Zap,
} from 'lucide-react';
import { CompileResult, ExecutionTrace, ExecutionStep } from '../types/jviz';

interface PipelineBarProps {
  compileResult: CompileResult | null;
  currentStep: ExecutionStep | null;
  totalSteps: number;
  isCompiling: boolean;
  isRunning: boolean;
  isKilled: boolean;
  isTimedOut: boolean;
  hasException: boolean;
}

export const PipelineBar: React.FC<PipelineBarProps> = ({
  compileResult,
  currentStep,
  totalSteps,
  isCompiling,
  isRunning,
  isKilled,
  isTimedOut,
  hasException,
}) => {
  const [activeModalStage, setActiveModalStage] = useState<string | null>(null);

  // Derive status of each stage
  const sourceStatus = 'DONE'; // Source is always present

  const compilerStatus = isCompiling
    ? 'ACTIVE'
    : !compileResult
    ? 'IDLE'
    : compileResult.success
    ? 'DONE'
    : 'ERROR';

  const classLoaderStatus = isCompiling
    ? 'WAITING'
    : !compileResult
    ? 'IDLE'
    : !compileResult.success
    ? 'SKIPPED'
    : isRunning || (currentStep && currentStep.stepIndex > 0)
    ? 'DONE'
    : 'IDLE';

  const runtimeStatus = isCompiling
    ? 'WAITING'
    : !compileResult?.success
    ? 'SKIPPED'
    : isRunning
    ? 'ACTIVE'
    : currentStep
    ? 'DONE'
    : 'IDLE';

  const terminationStatus = isKilled
    ? 'STOPPED'
    : isTimedOut
    ? 'TIMEOUT'
    : hasException
    ? 'EXCEPTION'
    : currentStep && currentStep.stepIndex === totalSteps - 1
    ? 'COMPLETE'
    : 'IDLE';

  const stages = [
    {
      id: 'SOURCE',
      label: 'Source Code',
      subtext: 'Main.java',
      icon: FileCode2,
      status: sourceStatus,
      color: 'blue',
      detail: 'Raw Java source text loaded in Monaco editor.',
    },
    {
      id: 'COMPILER',
      label: 'javac Compiler',
      subtext: compileResult?.success ? 'Bytecode Ready' : compileResult?.errors.length ? 'Compile Errors' : 'javax.tools',
      icon: Binary,
      status: compilerStatus,
      color: compilerStatus === 'ERROR' ? 'rose' : 'purple',
      detail: compileResult
        ? `${compileResult.stages.length} stages captured. ${compileResult.stages.map(s => `${s.name}: ${s.status}`).join(' | ')}`
        : 'Invokes real system JavaCompiler with DiagnosticCollector.',
    },
    {
      id: 'CLASSLOADER',
      label: 'ClassLoader',
      subtext: compileResult?.success ? 'Class Loaded' : 'JVM Internal',
      icon: Layers,
      status: classLoaderStatus,
      color: 'amber',
      detail: 'Loads compiled Main.class into child JVM metadata area.',
    },
    {
      id: 'RUNTIME',
      label: 'JDI Runtime Engine',
      subtext: currentStep ? `Step ${currentStep.stepIndex + 1}/${totalSteps}` : 'Stack & Heap',
      icon: Cpu,
      status: runtimeStatus,
      color: 'emerald',
      detail: 'Suspended child JVM stepped line-by-line via com.sun.jdi APIs.',
    },
    {
      id: 'TERMINATION',
      label: 'Lifecycle State',
      subtext:
        terminationStatus === 'STOPPED'
          ? 'Killed by User'
          : terminationStatus === 'TIMEOUT'
          ? 'Timeout (5s max)'
          : terminationStatus === 'EXCEPTION'
          ? 'Runtime Crash'
          : terminationStatus === 'COMPLETE'
          ? 'Completed (0)'
          : 'Ready',
      icon:
        terminationStatus === 'STOPPED'
          ? XOctagon
          : terminationStatus === 'EXCEPTION' || terminationStatus === 'TIMEOUT'
          ? AlertTriangle
          : CheckCircle,
      status: terminationStatus,
      color:
        terminationStatus === 'STOPPED' || terminationStatus === 'TIMEOUT' || terminationStatus === 'EXCEPTION'
          ? 'rose'
          : terminationStatus === 'COMPLETE'
          ? 'emerald'
          : 'gray',
      detail:
        terminationStatus === 'STOPPED'
          ? 'Child process was forcibly terminated using process.destroyForcibly().'
          : terminationStatus === 'EXCEPTION'
          ? 'An unhandled exception terminated the JVM call stack.'
          : 'JVM lifecycle completed cleanly with exit code 0.',
    },
  ];

  return (
    <>
      <div className="bg-[#0f141d] border-b border-[#212734] px-4 py-2 flex items-center justify-between overflow-x-auto text-xs select-none">
        <div className="flex items-center space-x-1 sm:space-x-2 w-full max-w-5xl mx-auto justify-between">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const isActive = stage.status === 'ACTIVE';
            const isDone = stage.status === 'DONE' || stage.status === 'COMPLETE';
            const isError = stage.status === 'ERROR' || stage.status === 'STOPPED' || stage.status === 'EXCEPTION';

            return (
              <React.Fragment key={stage.id}>
                <button
                  onClick={() => setActiveModalStage(stage.id)}
                  className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer group text-left ${
                    isActive
                      ? 'bg-blue-500/15 border-blue-500/50 text-blue-300 ring-2 ring-blue-500/30 shadow-lg shadow-blue-500/10'
                      : isError
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                      : isDone
                      ? 'bg-[#151c27] border-[#2b3547] text-gray-200 hover:border-gray-500 hover:bg-[#1a2332]'
                      : 'bg-[#12161f] border-transparent text-gray-500 hover:text-gray-400'
                  }`}
                  title="Click to view stage details"
                >
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                      isActive
                        ? 'bg-blue-500 text-white animate-pulse'
                        : isError
                        ? 'bg-rose-500/20 text-rose-400'
                        : isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <div className="hidden sm:block">
                    <div className="font-semibold text-[11px] leading-tight flex items-center gap-1">
                      <span>{stage.label}</span>
                      <Info className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                    </div>
                    <div className="text-[10px] text-gray-400 leading-none mt-0.5">{stage.subtext}</div>
                  </div>
                </button>

                {idx < stages.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-600 shrink-0 mx-0.5" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Stage Detail Modal Card */}
      {activeModalStage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141a24] border border-[#2e3748] rounded-xl max-w-lg w-full shadow-2xl p-5 relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setActiveModalStage(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 p-1 rounded-md hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-100">
                  {stages.find((s) => s.id === activeModalStage)?.label} Details
                </h3>
                <p className="text-xs text-gray-400">Authentic JDK Internals from Backend Engine</p>
              </div>
            </div>

            {/* Stage-specific data */}
            {activeModalStage === 'SOURCE' && (
              <div className="space-y-3 text-xs text-gray-300">
                <p>
                  User Java source file loaded as <code className="text-blue-400 bg-gray-900 px-1 py-0.5 rounded">Main.java</code>.
                  Passed to <code className="text-purple-400 bg-gray-900 px-1 py-0.5 rounded">javax.tools.JavaCompiler</code> in memory.
                </p>
                <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#212734] font-mono text-[11px] text-gray-400">
                  ToolProvider.getSystemJavaCompiler() → InMemoryJavaSource
                </div>
              </div>
            )}

            {activeModalStage === 'COMPILER' && (
              <div className="space-y-3 text-xs text-gray-300">
                <p>Captured compile stages via JDK DiagnosticCollector:</p>
                <div className="space-y-2">
                  {compileResult?.stages.map((st, i) => (
                    <div
                      key={i}
                      className="bg-[#0b0e14] p-2.5 rounded-lg border border-[#212734] flex items-start justify-between"
                    >
                      <div>
                        <div className="font-semibold text-gray-200 flex items-center gap-1.5">
                          <FileCheck className="w-3.5 h-3.5 text-blue-400" />
                          <span>{st.name}</span>
                        </div>
                        <div className="text-gray-400 text-[11px] mt-0.5">{st.detail}</div>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          st.status === 'OK'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {st.status}
                      </span>
                    </div>
                  ))}
                  {!compileResult && (
                    <p className="text-gray-500 italic">No compilation run yet. Click "Compile & Debug".</p>
                  )}
                </div>
              </div>
            )}

            {activeModalStage === 'CLASSLOADER' && (
              <div className="space-y-3 text-xs text-gray-300">
                <p>
                  The compiled <code className="text-amber-400 bg-gray-900 px-1 py-0.5 rounded">Main.class</code> bytecode is placed into a temporary working directory and loaded by the child JVM's Application ClassLoader with full debug tables (<code className="text-gray-400">-g -parameters</code>).
                </p>
                <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#212734] font-mono text-[11px] text-amber-300">
                  ClassPrepareRequest → Breakpoint on Main.main() → Suspend Child JVM
                </div>
              </div>
            )}

            {activeModalStage === 'RUNTIME' && (
              <div className="space-y-3 text-xs text-gray-300">
                <p>
                  JDI engine hooks into the child JVM via <code className="text-emerald-400 bg-gray-900 px-1 py-0.5 rounded">com.sun.jdi.VirtualMachine</code>.
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0b0e14] p-2.5 rounded-lg border border-[#212734]">
                    <span className="text-gray-400 block">Total Steps Recorded:</span>
                    <span className="font-bold text-gray-200 text-sm">{totalSteps}</span>
                  </div>
                  <div className="bg-[#0b0e14] p-2.5 rounded-lg border border-[#212734]">
                    <span className="text-gray-400 block">Current Call Depth:</span>
                    <span className="font-bold text-blue-400 text-sm">{currentStep?.callDepth ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            {activeModalStage === 'TERMINATION' && (
              <div className="space-y-3 text-xs text-gray-300">
                <p>
                  {stages.find((s) => s.id === 'TERMINATION')?.detail}
                </p>
                <div className="bg-[#0b0e14] p-3 rounded-lg border border-[#212734] font-mono text-[11px] text-gray-400">
                  Timeout: 5.00s maximum | Endpoint: DELETE /api/execute/:id
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setActiveModalStage(null)}
                className="px-3.5 py-1.5 bg-[#1f2838] hover:bg-[#273347] text-gray-200 rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
