import React, { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { CompileError, ExceptionInfo } from '../types/jviz';
import { AlertCircle, AlertOctagon, Terminal, Flame, Info } from 'lucide-react';

interface EditorPaneProps {
  code: string;
  onChangeCode: (newCode: string) => void;
  currentLine: number | null;
  callStackLines: number[];
  compileErrors: CompileError[];
  runtimeException: ExceptionInfo | null;
  readOnly?: boolean;
  isProjectorMode?: boolean;
}

export const EditorPane: React.FC<EditorPaneProps> = ({
  code,
  onChangeCode,
  currentLine,
  callStackLines,
  compileErrors,
  runtimeException,
  readOnly = false,
  isProjectorMode = false,
}) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure editor styling
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: isProjectorMode ? 16 : 13,
      lineHeight: isProjectorMode ? 24 : 19,
      lineNumbersMinChars: 3,
      glyphMargin: true,
      folding: true,
      lineDecorationsWidth: 10,
      renderLineHighlight: 'line',
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      automaticLayout: true,
      tabSize: 4,
      smoothScrolling: true,
    });

    updateDecorations();
  };

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({
        fontSize: isProjectorMode ? 16 : 13,
        lineHeight: isProjectorMode ? 24 : 19,
      });
    }
  }, [isProjectorMode]);

  const updateDecorations = () => {
    if (!editorRef.current || !monacoRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const newDecorations: any[] = [];

    // 1. Current active execution line (cyan/blue glow)
    if (currentLine && currentLine > 0) {
      newDecorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-active-line-highlight',
          glyphMarginClassName: 'monaco-active-glyph',
          glyphMarginHoverMessage: { value: `**Active Execution Line**: Line ${currentLine}` },
        },
      });

      try {
        editor.revealLineInCenterIfOutsideViewport(currentLine);
      } catch (e) {
        // ignore
      }
    }

    // 2. Caller stack frame lines (purple tint)
    callStackLines.forEach((line) => {
      if (line !== currentLine && line > 0) {
        newDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'monaco-callstack-line-highlight',
            glyphMarginClassName: 'monaco-callstack-glyph',
            glyphMarginHoverMessage: { value: `**Call Stack Frame**: Line ${line}` },
          },
        });
      }
    });

    // 3. Compile error markers
    compileErrors.forEach((err) => {
      if (err.line > 0) {
        newDecorations.push({
          range: new monaco.Range(err.line, 1, err.line, 1),
          options: {
            isWholeLine: true,
            className: 'monaco-error-line-highlight',
            glyphMarginClassName: 'monaco-error-glyph',
            glyphMarginHoverMessage: { value: `**Compiler Error**: ${err.message}\n\n*${err.explanation}*` },
          },
        });
      }
    });

    // 4. Runtime Exception crash line
    if (runtimeException && currentLine && currentLine > 0) {
      newDecorations.push({
        range: new monaco.Range(currentLine, 1, currentLine, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-error-line-highlight',
          glyphMarginClassName: 'monaco-error-glyph',
          glyphMarginHoverMessage: {
            value: `**Crash Point**: ${runtimeException.exceptionClass}: ${runtimeException.message}`,
          },
        },
      });
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  };

  useEffect(() => {
    updateDecorations();
  }, [currentLine, callStackLines, compileErrors, runtimeException]);

  return (
    <div className="h-full flex flex-col bg-[#0d1117] border-r border-[#212734] relative overflow-hidden">
      {/* Pane Header */}
      <div className="h-8 bg-[#131822] border-b border-[#212734] px-3 flex items-center justify-between shrink-0 text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-gray-200">Main.java</span>
          <span className="text-[10px] text-gray-500 font-mono">UTF-8</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px]">
          {currentLine && (
            <span className="text-blue-400 font-mono flex items-center gap-1 font-semibold">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Line {currentLine}
            </span>
          )}
          {compileErrors.length > 0 && (
            <span className="text-rose-400 font-semibold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {compileErrors.length} {compileErrors.length === 1 ? 'Error' : 'Errors'}
            </span>
          )}
          {runtimeException && (
            <span className="text-rose-400 font-semibold flex items-center gap-1 animate-bounce">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              Exception Thrown
            </span>
          )}
        </div>
      </div>

      {/* Monaco Editor Container */}
      <div className="flex-1 relative overflow-hidden">
        <Editor
          height="100%"
          language="java"
          theme="vs-dark"
          value={code}
          onChange={(val) => onChangeCode(val || '')}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
          }}
        />

        {/* Runtime Exception Floating Card */}
        {runtimeException && (
          <div className="absolute bottom-3 left-3 right-3 bg-gradient-to-r from-rose-950/90 to-red-900/90 border border-rose-500/60 rounded-xl p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 z-30">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-rose-200 font-mono tracking-tight">
                    {runtimeException.exceptionClass}
                  </span>
                  <span className="text-[10px] bg-rose-500/30 text-rose-200 px-1.5 py-0.5 rounded font-mono">
                    Crash at Step {runtimeException.crashStepIndex}
                  </span>
                </div>
                <p className="text-xs text-rose-100 font-semibold mt-0.5">
                  {runtimeException.message || 'No detail message provided by JVM.'}
                </p>
                <div className="mt-2 text-xs text-rose-200/90 bg-black/40 p-2 rounded-lg border border-rose-500/20 leading-relaxed flex items-start gap-1.5">
                  <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Plain-English Cause:</strong> {runtimeException.plainEnglishCause}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Compiler Error Floating Card */}
        {compileErrors.length > 0 && !runtimeException && (
          <div className="absolute bottom-3 left-3 right-3 bg-gradient-to-r from-amber-950/90 to-yellow-950/90 border border-amber-500/60 rounded-xl p-3.5 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200 z-30">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-200 tracking-tight">
                    Compilation Failed ({compileErrors.length} {compileErrors.length === 1 ? 'Error' : 'Errors'})
                  </span>
                  <span className="text-[10px] bg-amber-500/30 text-amber-200 px-1.5 py-0.5 rounded font-mono">
                    Line {compileErrors[0].line}, Col {compileErrors[0].column}
                  </span>
                </div>
                <p className="text-xs text-amber-100 font-mono mt-0.5">
                  {compileErrors[0].message}
                </p>
                <div className="mt-2 text-xs text-amber-200/90 bg-black/40 p-2 rounded-lg border border-amber-500/20 leading-relaxed flex items-start gap-1.5">
                  <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Why it failed:</strong> {compileErrors[0].explanation}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
