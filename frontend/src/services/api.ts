import { ExecutionRequest, ExecutionTrace, CompileResult } from '../types/jviz';

// Production public deployment: read from import.meta.env.VITE_API_URL, fallback to /api or localhost:8080
const rawUrl = import.meta.env.VITE_API_URL || '';
export const API_BASE = rawUrl
  ? `${rawUrl.replace(/\/$/, '')}${rawUrl.endsWith('/api') ? '' : '/api'}`
  : '/api';

export async function checkBackendHealth(timeoutMs: number = 3500): Promise<{ status: string; engine?: string; durationMs?: number }> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const durationMs = Math.round(performance.now() - start);
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    const data = await res.json();
    return { ...data, durationMs };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start);
    return { status: 'DOWN', engine: err.message, durationMs };
  }
}

export async function compileOnly(request: ExecutionRequest): Promise<CompileResult> {
  const res = await fetch(`${API_BASE}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Compile request failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function startAsyncExecution(request: ExecutionRequest): Promise<string> {
  const res = await fetch(`${API_BASE}/execute/async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Execution request failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.sessionId;
}

export async function pollExecutionResult(
  sessionId: string,
  onProgress?: (attempt: number) => void,
  maxAttempts: number = 60,
  intervalMs: number = 200
): Promise<ExecutionTrace> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    if (onProgress) onProgress(attempts);

    const res = await fetch(`${API_BASE}/execute/${sessionId}/result`);

    if (res.status === 200) {
      return await res.json();
    } else if (res.status === 202) {
      // Still running, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } else if (res.status === 404) {
      throw new Error(`Execution session ${sessionId} not found or expired.`);
    } else {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Failed with status ${res.status}`);
    }
  }

  throw new Error(`Execution timed out after ${maxAttempts * intervalMs}ms.`);
}

export async function killExecution(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/execute/${sessionId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.killed;
  } catch (err) {
    console.error('Failed to kill execution:', err);
    return false;
  }
}

export async function executeSynchronous(request: ExecutionRequest): Promise<ExecutionTrace> {
  const res = await fetch(`${API_BASE}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`Execution failed: ${res.statusText}`);
  }
  return await res.json();
}
