export interface CompileStage {
  name: string;
  status: 'OK' | 'FAILED' | 'PENDING' | 'SKIPPED' | string;
  detail: string;
}

export interface CompileError {
  line: number;
  column: number;
  message: string;
  explanation: string;
  kind: 'ERROR' | 'WARNING' | 'NOTE' | string;
}

export interface CompileResult {
  success: boolean;
  stages: CompileStage[];
  errors: CompileError[];
  classFilePath: string | null;
}

export interface Location {
  className: string;
  methodName: string;
  lineNumber: number;
}

export interface VariableValue {
  name: string;
  type: string;
  value: string;
  objectId: string | null;
}

export interface StackFrameInfo {
  frameIndex: number;
  className: string;
  methodName: string;
  lineNumber: number;
  thisRef: string | null;
  locals: Record<string, VariableValue>;
}

export interface HeapObject {
  objectId: string;
  className: string;
  fields: Record<string, VariableValue>;
  arrayElements: string[] | null;
  arrayLength: number;
  isStringPoolEntry: boolean;
}

export interface HeapSnapshot {
  objects: HeapObject[];
  stringPool: HeapObject[];
}

export interface ExceptionInfo {
  exceptionClass: string;
  message: string;
  plainEnglishCause: string;
  stackTrace: string[];
  crashStepIndex: number;
}

export interface ExecutionStep {
  stepIndex: number;
  callDepth: number;
  eventType: 'STEP' | 'EXCEPTION' | 'METHOD_ENTRY' | 'METHOD_EXIT' | 'VM_DEATH' | string;
  location: Location | null;
  callStack: StackFrameInfo[];
  heap: HeapSnapshot;
  exception: ExceptionInfo | null;
  narrative: string;
}

export interface ExecutionTrace {
  compilation: CompileResult;
  steps: ExecutionStep[];
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killed: boolean;
}

export interface ExecutionRequest {
  sourceCode: string;
  className?: string;
}

export type ExecutionState = 'IDLE' | 'COMPILING' | 'RUNNING' | 'PAUSED' | 'STEPPING' | 'STOPPED' | 'ERROR' | 'COMPLETED';

export type PipelineStage = 'SOURCE' | 'COMPILER' | 'CLASSLOADER' | 'RUNTIME' | 'TERMINATION';
