import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Database,
  Hash,
  Sparkles,
  Link,
  Box,
  Binary,
  Quote,
  Eye,
  ArrowRight,
  Maximize2,
} from 'lucide-react';
import { ExecutionStep, StackFrameInfo, HeapObject, VariableValue } from '../types/jviz';

interface MemoryCanvasProps {
  currentStep: ExecutionStep | null;
  isProjectorMode?: boolean;
}

interface PointerLine {
  id: string;
  sourceId: string;
  targetId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  color: string;
}

export const MemoryCanvas: React.FC<MemoryCanvasProps> = ({ currentStep, isProjectorMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [arrows, setArrows] = useState<PointerLine[]>([]);

  // Distinguish Heap objects vs String Pool objects
  // Backend provides heap.objects and heap.stringPool
  const heapObjects = currentStep?.heap?.objects || [];
  const stringPoolObjects = currentStep?.heap?.stringPool || [];

  // Also check if any object in heapObjects is marked as isStringPoolEntry
  const distinctPoolObjects = [
    ...stringPoolObjects,
    ...heapObjects.filter((o) => o.isStringPoolEntry && !stringPoolObjects.some((p) => p.objectId === o.objectId)),
  ];

  const regularHeapObjects = heapObjects.filter(
    (o) => !o.isStringPoolEntry && !distinctPoolObjects.some((p) => p.objectId === o.objectId)
  );

  // Compute live SVG pointer arrows between Stack/Fields and Heap Objects
  const updateArrows = () => {
    if (!containerRef.current || !currentStep) {
      setArrows([]);
      return;
    }

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newArrows: PointerLine[] = [];

    // Color palette for arrows to differentiate multiple references
    const colors = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#34d399', '#fbbf24'];

    // 1. Check all local variables in stack frames
    currentStep.callStack.forEach((frame, frameIdx) => {
      Object.entries(frame.locals).forEach(([varName, val], varIdx) => {
        if (val.objectId) {
          const cleanObjId = val.objectId.replace(/^@/, '');
          const srcEl = container.querySelector(`[data-ref-source="stack-${frameIdx}-${varName}"]`);
          const dstEl = container.querySelector(`[data-heap-target="${cleanObjId}"]`);

          if (srcEl && dstEl) {
            const sRect = srcEl.getBoundingClientRect();
            const dRect = dstEl.getBoundingClientRect();

            const x1 = sRect.right - containerRect.left;
            const y1 = sRect.top + sRect.height / 2 - containerRect.top + container.scrollTop;
            const x2 = dRect.left - containerRect.left;
            const y2 = dRect.top + Math.min(24, dRect.height / 2) - containerRect.top + container.scrollTop;

            const colorIndex = (frameIdx * 3 + varIdx) % colors.length;

            newArrows.push({
              id: `arrow-stack-${frameIdx}-${varName}-to-${cleanObjId}`,
              sourceId: `stack-${frameIdx}-${varName}`,
              targetId: cleanObjId,
              x1,
              y1,
              x2,
              y2,
              label: `${varName} → @${cleanObjId}`,
              color: colors[colorIndex],
            });
          }
        }
      });
    });

    // 2. Check heap object fields pointing to other heap objects
    heapObjects.forEach((obj) => {
      if (obj.fields) {
        Object.entries(obj.fields).forEach(([fieldName, val]) => {
          if (val.objectId && val.objectId !== obj.objectId) {
            const cleanTargetId = val.objectId.replace(/^@/, '');
            const srcEl = container.querySelector(`[data-ref-source="field-${obj.objectId}-${fieldName}"]`);
            const dstEl = container.querySelector(`[data-heap-target="${cleanTargetId}"]`);

            if (srcEl && dstEl) {
              const sRect = srcEl.getBoundingClientRect();
              const dRect = dstEl.getBoundingClientRect();

              const x1 = sRect.right - containerRect.left;
              const y1 = sRect.top + sRect.height / 2 - containerRect.top + container.scrollTop;
              const x2 = dRect.left - containerRect.left;
              const y2 = dRect.top + 20 - containerRect.top + container.scrollTop;

              newArrows.push({
                id: `arrow-field-${obj.objectId}-${fieldName}-to-${cleanTargetId}`,
                sourceId: `field-${obj.objectId}-${fieldName}`,
                targetId: cleanTargetId,
                x1,
                y1,
                x2,
                y2,
                label: `.${fieldName} → @${cleanTargetId}`,
                color: '#a78bfa',
              });
            }
          }
        });
      }
    });

    setArrows(newArrows);
  };

  useLayoutEffect(() => {
    // Small timeout ensures DOM elements have rendered and animated into place
    const timer = setTimeout(updateArrows, 60);
    return () => clearTimeout(timer);
  }, [currentStep]);

  useEffect(() => {
    const handleResize = () => updateArrows();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentStep]);

  return (
    <div
      ref={containerRef}
      onScroll={updateArrows}
      className="h-full flex-1 overflow-y-auto bg-[#0a0d14] relative p-4 select-none"
    >
      {/* SVG Canvas for Bézier Pointer Arrows */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-20"
        style={{ minHeight: '100%', minWidth: '100%' }}
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#38bdf8" floodOpacity="0.6" />
          </filter>
          {['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#34d399', '#fbbf24', '#a78bfa'].map((col) => (
            <marker
              key={col}
              id={`arrowhead-${col.replace('#', '')}`}
              markerWidth="7"
              markerHeight="7"
              refX="6"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 7 3.5, 0 7" fill={col} />
            </marker>
          ))}
        </defs>

        {arrows.map((arrow) => {
          const dx = Math.max(30, Math.abs(arrow.x2 - arrow.x1) * 0.45);
          const pathData = `M ${arrow.x1} ${arrow.y1} C ${arrow.x1 + dx} ${arrow.y1}, ${arrow.x2 - dx} ${arrow.y2}, ${arrow.x2} ${arrow.y2}`;
          const colorKey = arrow.color.replace('#', '');

          return (
            <g key={arrow.id} className="transition-all duration-300">
              {/* Outer glow stroke */}
              <path
                d={pathData}
                fill="none"
                stroke={arrow.color}
                strokeWidth="4"
                strokeOpacity="0.25"
                strokeLinecap="round"
              />
              {/* Main arrow line */}
              <path
                d={pathData}
                fill="none"
                stroke={arrow.color}
                strokeWidth="2"
                strokeDasharray="4 2"
                markerEnd={`url(#arrowhead-${colorKey})`}
                className="animate-[dash_1s_linear_infinite]"
              />
              {/* Dot at reference source */}
              <circle cx={arrow.x1} cy={arrow.y1} r="3" fill={arrow.color} />
            </g>
          );
        })}
      </svg>

      {/* Main Grid: Left Column (Stack) | Right Column (Heap & String Pool) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 relative z-10 min-h-full">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: JVM CALL STACK (LIFO frames)                               */}
        {/* ========================================================================= */}
        <div className={`${isProjectorMode ? 'lg:col-span-6' : 'lg:col-span-5'} flex flex-col space-y-3`}>
          {/* Header */}
          <div className="flex items-center justify-between bg-[#121722] border border-[#212836] px-3.5 py-2 rounded-xl shadow-sm">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded-md bg-blue-500/20 text-blue-400 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="font-bold text-xs text-gray-200 tracking-tight">JVM Call Stack</h3>
                <span className="text-[10px] text-gray-400 leading-none">LIFO Frames • Call Depth Tracking</span>
              </div>
            </div>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
              {currentStep?.callStack.length || 0} {currentStep?.callStack.length === 1 ? 'Frame' : 'Frames'}
            </span>
          </div>

          {/* Stack Frames Container */}
          <div className="flex-1 flex flex-col space-y-3">
            {!currentStep || currentStep.callStack.length === 0 ? (
              <div className="h-44 border-2 border-dashed border-[#232a38] rounded-xl flex flex-col items-center justify-center text-gray-500 text-xs p-4 text-center">
                <Layers className="w-7 h-7 mb-2 text-gray-600 animate-pulse" />
                <p>Call stack is currently empty.</p>
                <p className="text-[11px] text-gray-600 mt-1">Press "Compile & Debug" to trace Java execution.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {currentStep.callStack.map((frame, idx) => {
                  const isTopFrame = idx === 0;
                  const localsList = Object.entries(frame.locals);

                  return (
                    <motion.div
                      key={`frame-${frame.frameIndex}-${frame.className}-${frame.methodName}`}
                      layout
                      initial={{ opacity: 0, y: -16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      className={`rounded-xl border transition-all shadow-md overflow-hidden ${
                        isTopFrame
                          ? 'bg-[#151c28] border-blue-500/50 shadow-blue-500/10 ring-1 ring-blue-500/30'
                          : 'bg-[#10151f] border-[#222a38] opacity-85'
                      }`}
                    >
                      {/* Frame Header */}
                      <div
                        className={`px-3 py-2 flex items-center justify-between border-b ${
                          isTopFrame
                            ? 'bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border-blue-500/30 text-blue-200'
                            : 'bg-[#131924] border-[#222a38] text-gray-400'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {isTopFrame ? (
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                          )}
                          <span className="font-mono font-bold text-xs truncate">
                            {frame.className}.{frame.methodName}()
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5 text-[10px] font-mono shrink-0">
                          {frame.thisRef && (
                            <span className="text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30">
                              this: {frame.thisRef}
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              isTopFrame ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-400'
                            }`}
                          >
                            Line {frame.lineNumber}
                          </span>
                        </div>
                      </div>

                      {/* Frame Body: Local Variables Table */}
                      <div className="p-3">
                        <div className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Local Variables</span>
                          <span className="text-gray-400 font-mono text-[9px]">
                            {localsList.length} {localsList.length === 1 ? 'variable' : 'variables'}
                          </span>
                        </div>

                        {localsList.length === 0 ? (
                          <div className="text-[11px] text-gray-400 italic py-1">No locals in scope</div>
                        ) : (
                          <div className="space-y-1.5">
                            {localsList.map(([varName, val]) => {
                              const isRef = !!val.objectId;

                              return (
                                <div
                                  key={varName}
                                  className="flex items-center justify-between bg-[#0b0f16] border border-[#1e2533] px-2.5 py-1.5 rounded-lg text-xs hover:border-[#2e394e] transition-colors"
                                >
                                  {/* Var Name & Type */}
                                  <div className="flex items-center space-x-2 truncate">
                                    <span className="text-gray-400 text-[10px] font-mono truncate max-w-[90px]">
                                      {val.type}
                                    </span>
                                    <span className="font-mono font-semibold text-gray-200">
                                      {varName}
                                    </span>
                                  </div>

                                  {/* Value or Reference Pointer Badge */}
                                  <div className="flex items-center space-x-1 font-mono">
                                    <span className="text-gray-400 text-xs">=</span>
                                    {isRef ? (
                                      <div
                                        data-ref-source={`stack-${idx}-${varName}`}
                                        className="flex items-center space-x-1 bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded text-[11px] font-bold shadow-sm shadow-blue-500/10"
                                      >
                                        <Link className="w-2.5 h-2.5" />
                                        <span>ref @{val.objectId}</span>
                                      </div>
                                    ) : (
                                      <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                                        {val.value}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: JVM HEAP & STRING CONSTANT POOL                             */}
        {/* ========================================================================= */}
        <div className={`${isProjectorMode ? 'lg:col-span-6' : 'lg:col-span-7'} flex flex-col space-y-4`}>
          {/* 1. Distinct String Constant Pool Section */}
          <div className="bg-[#121422] border border-[#2b2745] rounded-xl p-3.5 shadow-md relative overflow-hidden">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center">
                  <Quote className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-purple-200 flex items-center gap-1.5">
                    <span>String Constant Pool</span>
                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      JVM Internals
                    </span>
                  </h3>
                  <span className="text-[10px] text-purple-400/80 leading-none">
                    Interned String Literals (Deduplicated across references)
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30">
                {distinctPoolObjects.length} {distinctPoolObjects.length === 1 ? 'String' : 'Strings'}
              </span>
            </div>

            {distinctPoolObjects.length === 0 ? (
              <div className="bg-[#0b0c16] border border-dashed border-[#242138] rounded-lg p-3 text-center text-xs text-purple-400/60 italic">
                No string literals interned in this execution step yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {distinctPoolObjects.map((strObj) => {
                  const val = strObj.fields?.value?.value || '""';
                  return (
                    <motion.div
                      key={`pool-${strObj.objectId}`}
                      data-heap-target={strObj.objectId}
                      layout
                      className="bg-[#0c0d18] border border-purple-500/40 rounded-lg p-2.5 shadow-sm shadow-purple-500/10 flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center space-x-1.5 font-mono text-xs text-purple-200 font-bold truncate">
                          <span>"{val}"</span>
                        </div>
                        <div className="text-[10px] text-purple-400/70 font-mono mt-0.5">
                          Constant Pool • Immutable
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-500/25 text-purple-200 border border-purple-500/40 shrink-0">
                        @{strObj.objectId}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. Heap Objects & Arrays Section */}
          <div className="flex-1 flex flex-col space-y-3">
            <div className="flex items-center justify-between bg-[#121722] border border-[#212836] px-3.5 py-2 rounded-xl shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-gray-200 tracking-tight">Heap Memory</h3>
                  <span className="text-[10px] text-gray-400 leading-none">
                    Instantiated Objects & Arrays with Unique Memory Addresses (@ID)
                  </span>
                </div>
              </div>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {regularHeapObjects.length} {regularHeapObjects.length === 1 ? 'Object' : 'Objects'}
              </span>
            </div>

            {regularHeapObjects.length === 0 ? (
              <div className="h-44 border-2 border-dashed border-[#232a38] rounded-xl flex flex-col items-center justify-center text-gray-500 text-xs p-4 text-center">
                <Box className="w-7 h-7 mb-2 text-gray-600 animate-pulse" />
                <p>No objects allocated on the Heap yet.</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Objects created with <code className="text-gray-400">new Point(...)</code> or <code className="text-gray-400">new int[...]</code> appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {regularHeapObjects.map((obj) => {
                    const isArray = obj.arrayLength >= 0 && obj.arrayElements !== null;
                    const fieldEntries = Object.entries(obj.fields || {});

                    return (
                      <motion.div
                        key={`heap-${obj.objectId}`}
                        data-heap-target={obj.objectId}
                        layout
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                        className="rounded-xl border border-[#252f40] bg-[#111620] overflow-hidden shadow-md hover:border-gray-600 transition-colors"
                      >
                        {/* Heap Object Header */}
                        <div className="px-3.5 py-2 bg-[#151c28] border-b border-[#232d3d] flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {isArray ? (
                              <Binary className="w-3.5 h-3.5 text-blue-400" />
                            ) : (
                              <Box className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                            <span className="font-mono font-bold text-xs text-gray-200">
                              {obj.className}
                            </span>
                            {isArray && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300">
                                length: {obj.arrayLength}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-1.5 font-mono text-[10px]">
                            <span className="text-gray-400 text-[9px] uppercase">Memory ID:</span>
                            <span className="font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                              @{obj.objectId}
                            </span>
                          </div>
                        </div>

                        {/* Heap Object Content */}
                        <div className="p-3">
                          {/* Case A: Array Elements Grid */}
                          {isArray ? (
                            <div>
                              <div className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider mb-2">
                                Array Elements (0-indexed contiguous memory)
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {obj.arrayElements!.map((elemVal, elemIdx) => (
                                  <div
                                    key={elemIdx}
                                    className="flex flex-col items-center bg-[#0b0f16] border border-[#212938] rounded-lg p-2 min-w-[50px] shadow-sm"
                                  >
                                    <span className="text-[9px] font-mono text-gray-400 mb-0.5">
                                      [{elemIdx}]
                                    </span>
                                    <span className="text-xs font-mono font-bold text-emerald-300">
                                      {elemVal}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            /* Case B: Object Fields Table */
                            <div>
                              <div className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider mb-1.5">
                                Instance Fields
                              </div>
                              {fieldEntries.length === 0 ? (
                                <div className="text-[11px] text-gray-400 italic py-1">No instance fields</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {fieldEntries.map(([fieldName, val]) => {
                                    const isRef = !!val.objectId;

                                    return (
                                      <div
                                        key={fieldName}
                                        className="flex items-center justify-between bg-[#0b0f16] border border-[#1e2533] px-2.5 py-1.5 rounded-lg text-xs"
                                      >
                                        <div className="flex items-center space-x-2">
                                          <span className="text-gray-400 text-[10px] font-mono">
                                            {val.type}
                                          </span>
                                          <span className="font-mono text-gray-200">
                                            .{fieldName}
                                          </span>
                                        </div>

                                        <div className="font-mono flex items-center space-x-1">
                                          <span className="text-gray-400 text-xs">=</span>
                                          {isRef ? (
                                            <div
                                              data-ref-source={`field-${obj.objectId}-${fieldName}`}
                                              className="flex items-center space-x-1 bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded text-[11px] font-bold"
                                            >
                                              <Link className="w-2.5 h-2.5" />
                                              <span>ref @{val.objectId}</span>
                                            </div>
                                          ) : (
                                            <span className="text-emerald-300 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                                              {val.value}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
