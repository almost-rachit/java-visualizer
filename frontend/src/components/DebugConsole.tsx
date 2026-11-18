import React, { useState } from 'react';
import {
  Terminal,
  Activity,
  Code2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Flame,
  Info,
} from 'lucide-react';
import { ExecutionStep, ExecutionTrace } from '../types/jviz';

interface DebugConsoleProps {
  currentStep: ExecutionStep | null;
  trace: ExecutionTrace | null;
  isKilled: boolean;
  isTimedOut: boolean;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({
  currentStep,
  trace,
  isKilled,
  isTimedOut,
}) => {
  const [activeTab, setActiveTab] = useState<'console' | 'inspector' | 'json'>('console');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Compute stdout up to the current step or full stdout
  const stdout = trace?.stdout || '';
  const stderr = trace?.stderr || '';

  const narrativeText = currentStep?.narrative || 'Ready to execute. Click "Compile & Debug" to start JVM tracing.';

  const handleCopyJson = () => {
    if (!currentStep) return;
    navigator.clipboard.writeText(JSON.stringify(currentStep, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`border-t border-[#212734] bg-[#0c1017] flex flex-col transition-all duration-200 shrink-0 select-none ${
        isExpanded ? 'h-80' : 'h-48'
      }`}
    >
      {/* 1. Step Explainer Banner (Prominently displays plain-English narrative) */}
      <div className="bg-gradient-to-r from-blue-950/40 via-[#131926] to-indigo-950/40 border-b border-[#212838] px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5 min-w-0 pr-4">
          <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 block leading-tight">
              JVM Step Narrator
            </span>
            <p className="text-xs font-medium text-gray-200 truncate leading-snug">
              {narrativeText}
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center space-x-2 shrink-0">
          {isKilled && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
              Execution Stopped by User
            </span>
          )}
          {isTimedOut && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              Timeout (5s max exceeded)
            </span>
          )}
          {currentStep?.exception && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
              <Flame className="w-3 h-3 text-rose-400" />
              {currentStep.exception.exceptionClass.split('.').pop()}
            </span>
          )}
        </div>
      </div>

      {/* 2. Tabs Bar */}
      <div className="h-8 bg-[#11151f] border-b border-[#212734] px-4 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('console')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-t-md font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'console'
                ? 'border-blue-500 text-blue-400 bg-[#161c28]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console Output</span>
            {stdout && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-t-md font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'inspector'
                ? 'border-blue-500 text-blue-400 bg-[#161c28]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Variables & Heap Inspector</span>
          </button>

          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-t-md font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'json'
                ? 'border-blue-500 text-blue-400 bg-[#161c28]'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Raw Step JSON</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {activeTab === 'json' && currentStep && (
            <button
              onClick={handleCopyJson}
              className="flex items-center space-x-1 text-[11px] text-gray-400 hover:text-gray-200 px-2 py-0.5 rounded bg-gray-800 transition-colors"
              title="Copy step JSON to clipboard"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-gray-400 hover:text-gray-200 rounded transition-colors"
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 3. Tab Contents */}
      <div className="flex-1 overflow-auto p-3 font-mono text-xs select-text">
        {/* Tab 1: Terminal Console Output */}
        {activeTab === 'console' && (
          <div className="h-full flex flex-col justify-between">
            <div>
              {stdout ? (
                <div className="space-y-0.5">
                  <div className="text-[10px] text-gray-500 mb-1 flex items-center gap-1 font-sans">
                    <Terminal className="w-3 h-3 text-gray-500" />
                    <span>JVM Standard Output (System.out):</span>
                  </div>
                  {stdout.split('\n').map((line, idx) => (
                    <div key={idx} className="text-emerald-400 leading-relaxed">
                      {line}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 italic">No output produced yet.</div>
              )}

              {stderr && (
                <div className="mt-3 pt-2 border-t border-gray-800 space-y-0.5">
                  <div className="text-[10px] text-rose-400 mb-1">Standard Error (System.err):</div>
                  {stderr.split('\n').map((line, idx) => (
                    <div key={idx} className="text-rose-400 leading-relaxed">
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Variables & Heap Inspector Tree */}
        {activeTab === 'inspector' && (
          <div className="space-y-3 font-sans">
            {!currentStep ? (
              <div className="text-gray-500 italic">No active step.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Active Stack Variables */}
                <div className="bg-[#121620] border border-[#212734] rounded-lg p-2.5">
                  <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                    <span>Active Frame Locals</span>
                    <span className="font-mono text-gray-400 text-[10px]">
                      {currentStep.callStack[0]?.className}.{currentStep.callStack[0]?.methodName}()
                    </span>
                  </div>
                  <div className="space-y-1 font-mono text-xs">
                    {Object.entries(currentStep.callStack[0]?.locals || {}).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between py-0.5 border-b border-gray-800/50">
                        <span className="text-gray-300">
                          <span className="text-gray-500 text-[11px]">{val.type} </span>
                          {key}
                        </span>
                        <span className={val.objectId ? 'text-blue-400 font-bold' : 'text-emerald-400'}>
                          {val.objectId ? `@${val.objectId}` : val.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Heap Objects Summary */}
                <div className="bg-[#121620] border border-[#212734] rounded-lg p-2.5">
                  <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2">
                    Heap Objects Count: {currentStep.heap?.objects.length || 0}
                  </div>
                  <div className="space-y-1 font-mono text-xs">
                    {(currentStep.heap?.objects || []).map((obj) => (
                      <div key={obj.objectId} className="flex items-center justify-between py-0.5 border-b border-gray-800/50">
                        <span className="text-gray-300">
                          {obj.className} <span className="text-blue-400">@{obj.objectId}</span>
                        </span>
                        <span className="text-gray-400 text-[11px]">
                          {obj.arrayLength >= 0 ? `size ${obj.arrayLength}` : `${Object.keys(obj.fields).length} fields`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Raw Step JSON */}
        {activeTab === 'json' && (
          <pre className="text-gray-300 leading-normal text-[11px]">
            {currentStep
              ? JSON.stringify(currentStep, null, 2)
              : '// No step selected. Compile and run Java code to inspect JSON trace payload.'}
          </pre>
        )}
      </div>
    </div>
  );
};
