import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  ArrowDownRight,
  CornerDownRight,
  ArrowUpRight,
  Square,
  Sparkles,
  Loader2,
  Gauge,
  Sliders,
  Presentation,
} from 'lucide-react';
import { ExecutionStep } from '../types/jviz';

interface ToolbarProps {
  onCompileAndDebug: () => void;
  onStop: () => void;
  onReset: () => void;
  onStepBack: () => void;
  onStepInto: () => void;
  onStepOver: () => void;
  onStepOut: () => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
  isCompiling: boolean;
  isRunning: boolean;
  currentStepIndex: number;
  totalSteps: number;
  speed: number;
  onChangeSpeed: (newSpeed: number) => void;
  currentStep: ExecutionStep | null;
  isProjectorMode: boolean;
  onToggleProjectorMode: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onCompileAndDebug,
  onStop,
  onReset,
  onStepBack,
  onStepInto,
  onStepOver,
  onStepOut,
  onTogglePlay,
  isPlaying,
  isCompiling,
  isRunning,
  currentStepIndex,
  totalSteps,
  speed,
  onChangeSpeed,
  currentStep,
  isProjectorMode,
  onToggleProjectorMode,
}) => {
  const hasSteps = totalSteps > 0;
  const isAtStart = currentStepIndex <= 0;
  const isAtEnd = currentStepIndex >= totalSteps - 1;

  return (
    <div className={`bg-[#131822] border-b border-[#232a38] px-4 flex items-center justify-between z-10 shrink-0 select-none transition-all ${
      isProjectorMode ? 'h-14' : 'h-12'
    }`}>
      {/* Left: Main Action Buttons (Compile & Debug + Prominent STOP button) */}
      <div className="flex items-center space-x-2.5">
        <button
          onClick={onCompileAndDebug}
          disabled={isCompiling || isRunning}
          className={`flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-gray-700 disabled:to-gray-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:cursor-not-allowed active:scale-95 ${
            isProjectorMode ? 'text-sm px-4 py-2' : 'text-xs px-3.5 py-1.5'
          }`}
          title="Compile source and start JDI tracing"
        >
          {isCompiling || isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>{isCompiling ? 'Compiling...' : isRunning ? 'Tracing JVM...' : 'Compile & Debug'}</span>
        </button>

        {/* Prominent Red Stop Button */}
        <button
          onClick={onStop}
          disabled={!isRunning}
          className={`flex items-center space-x-1.5 font-bold rounded-lg transition-all shadow-md ${
            isProjectorMode ? 'text-sm px-3.5 py-2' : 'text-xs px-3 py-1.5'
          } ${
            isRunning
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 ring-2 ring-rose-500/50 animate-pulse cursor-pointer'
              : 'bg-rose-950/40 text-rose-500/40 border border-rose-900/30 cursor-not-allowed opacity-50'
          }`}
          title="Immediately kill child JVM (process.destroyForcibly)"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
          <span>Stop</span>
        </button>

        <div className="h-5 w-px bg-[#262f3f] mx-1" />

        {/* Playback Controls */}
        <div className="flex items-center space-x-1">
          {/* Reset */}
          <button
            onClick={onReset}
            disabled={!hasSteps || isAtStart || isRunning}
            className="p-1.5 text-gray-300 hover:text-white hover:bg-[#1f2736] disabled:text-gray-600 disabled:hover:bg-transparent rounded-md transition-colors"
            title="Reset to Step 0"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Step Back */}
          <button
            onClick={onStepBack}
            disabled={!hasSteps || isAtStart || isRunning}
            className="p-1.5 text-gray-300 hover:text-white hover:bg-[#1f2736] disabled:text-gray-600 disabled:hover:bg-transparent rounded-md transition-colors"
            title="Step Back"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Step Over */}
          <button
            onClick={onStepOver}
            disabled={!hasSteps || isAtEnd || isRunning}
            className={`flex items-center space-x-1 font-medium text-gray-200 hover:text-white bg-[#1a2230] hover:bg-[#232c3d] disabled:text-gray-600 disabled:bg-transparent rounded-md border border-[#2b3547] disabled:border-transparent transition-colors ${
              isProjectorMode ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-xs'
            }`}
            title="Step Over (next line at current depth or lower)"
          >
            <ArrowDownRight className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Step Over</span>
          </button>

          {/* Step Into */}
          <button
            onClick={onStepInto}
            disabled={!hasSteps || isAtEnd || isRunning}
            className={`flex items-center space-x-1 font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:text-gray-600 disabled:bg-transparent rounded-md shadow-sm transition-colors ${
              isProjectorMode ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-xs'
            }`}
            title="Step Into (next chronological JVM step)"
          >
            <CornerDownRight className="w-3.5 h-3.5" />
            <span>Step Into</span>
          </button>

          {/* Step Out */}
          <button
            onClick={onStepOut}
            disabled={!hasSteps || isAtEnd || isRunning}
            className={`flex items-center space-x-1 font-medium text-gray-200 hover:text-white bg-[#1a2230] hover:bg-[#232c3d] disabled:text-gray-600 disabled:bg-transparent rounded-md border border-[#2b3547] disabled:border-transparent transition-colors ${
              isProjectorMode ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-xs'
            }`}
            title="Step Out (return to caller frame)"
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Step Out</span>
          </button>

          {/* Play / Pause */}
          <button
            onClick={onTogglePlay}
            disabled={!hasSteps || isAtEnd || isRunning}
            className={`p-1.5 rounded-md transition-colors ${
              isPlaying
                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                : 'text-gray-300 hover:text-white hover:bg-[#1f2736] disabled:text-gray-600 disabled:hover:bg-transparent'
            }`}
            title={isPlaying ? 'Pause Auto-Play' : 'Auto-Play Trace'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Right: Classroom Projector Mode + Speed + Step Counter */}
      <div className="flex items-center space-x-3">
        {/* Projector Mode Toggle */}
        <button
          onClick={onToggleProjectorMode}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            isProjectorMode
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10 ring-1 ring-amber-500/40'
              : 'bg-[#171f2b] text-gray-300 hover:text-white border-[#2a3445] hover:border-gray-500'
          }`}
          title="Toggle Classroom / Projector Mode (Enlarged fonts & widened cards)"
        >
          <Presentation className={`w-3.5 h-3.5 ${isProjectorMode ? 'text-amber-400' : 'text-gray-400'}`} />
          <span className="hidden sm:inline">{isProjectorMode ? 'Projector: ON' : 'Projector Mode'}</span>
        </button>

        {/* Speed Slider */}
        <div className="hidden md:flex items-center space-x-2 text-xs text-gray-400">
          <Gauge className="w-3.5 h-3.5 text-gray-400" />
          <span>Speed:</span>
          <div className="flex items-center bg-[#171f2b] border border-[#2a3445] rounded-md p-0.5">
            {[0.5, 1, 1.5, 2].map((s) => (
              <button
                key={s}
                onClick={() => onChangeSpeed(s)}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
                  speed === s
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Step Counter Badge */}
        <div className="flex items-center space-x-2">
          {hasSteps ? (
            <div className={`flex items-center space-x-2 bg-[#171f2b] border border-[#2a3445] rounded-md ${
              isProjectorMode ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs'
            }`}>
              <span className="text-gray-400">Step</span>
              <span className="font-mono font-bold text-blue-400">
                {currentStepIndex + 1}
              </span>
              <span className="text-gray-500">/</span>
              <span className="font-mono text-gray-300">{totalSteps}</span>

              {currentStep && (
                <>
                  <div className="h-3 w-px bg-gray-700 mx-1" />
                  <span className="text-purple-400 font-mono font-semibold">
                    Depth: {currentStep.callDepth}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">No trace loaded</div>
          )}
        </div>
      </div>
    </div>
  );
};
