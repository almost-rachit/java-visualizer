import React from 'react';
import { Cpu, Terminal, Sparkles, CheckCircle2, XCircle, RefreshCw, BookOpen } from 'lucide-react';
import { PRESETS, CodePreset } from '../constants/presets';

interface NavbarProps {
  backendHealth: { status: string; engine?: string };
  selectedPresetId: string;
  onSelectPreset: (preset: CodePreset) => void;
  isRunning: boolean;
  onRefreshHealth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  backendHealth,
  selectedPresetId,
  onSelectPreset,
  isRunning,
  onRefreshHealth,
}) => {
  const isHealthy = backendHealth.status === 'UP';

  return (
    <header className="h-14 bg-[#111622] border-b border-[#262c36] px-4 flex items-center justify-between z-20 shrink-0">
      {/* Brand / Logo */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-bold text-base text-gray-100 tracking-tight flex items-center gap-1.5">
              <span>JViz</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                JDI Engine
              </span>
            </h1>
          </div>
          <p className="text-[11px] text-gray-400 leading-none">Interactive Java Execution & Memory Visualizer</p>
        </div>
      </div>

      {/* Center: Presets Dropdown */}
      <div className="flex items-center space-x-2">
        <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
          Presets:
        </span>
        <select
          value={selectedPresetId}
          disabled={isRunning}
          onChange={(e) => {
            const found = PRESETS.find((p) => p.id === e.target.value);
            if (found) onSelectPreset(found);
          }}
          className="bg-[#1a2130] text-gray-200 text-xs font-medium border border-[#343e50] rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-500 transition-colors shadow-sm"
        >
          {PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
      </div>

      {/* Right: Engine Status & JVM Specs */}
      <div className="flex items-center space-x-3">
        <div
          onClick={onRefreshHealth}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
            isHealthy
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
          }`}
          title="Click to re-check backend health"
        >
          {isHealthy ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
          )}
          <span>{isHealthy ? 'JVM Engine Ready' : 'Backend Disconnected'}</span>
        </div>

        <div className="hidden lg:flex items-center space-x-2 text-[11px] text-gray-400 bg-[#161d2b] border border-[#2b3547] px-2.5 py-1 rounded-md">
          <Terminal className="w-3 h-3 text-blue-400" />
          <span>Real JDI • No Regex Parsing</span>
        </div>
      </div>
    </header>
  );
};
