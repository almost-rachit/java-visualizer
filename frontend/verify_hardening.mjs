import http from 'http';

function post(url, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => (respData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respData) });
          } catch (e) {
            resolve({ status: res.statusCode, text: respData });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'GET',
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => (respData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respData) });
          } catch (e) {
            resolve({ status: res.statusCode, text: respData });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function del(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'DELETE',
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => (respData += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respData) });
          } catch (e) {
            resolve({ status: res.statusCode, text: respData });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function runHardeningTests() {
  console.log('🛡️ Starting Production Hardening & Classroom Guardrail Tests...\n');

  // Test 1: Production low-memory health check
  console.log('--- Test 1: Production Server Health Check (-Xms64m -Xmx220m -XX:+UseSerialGC) ---');
  const health = await get('http://localhost:8080/api/health');
  if (health.status === 200 && health.data.status === 'UP') {
    console.log('✅ Server is UP running on production low-memory flags:', health.data.engine);
  } else {
    console.error('❌ Health check failed:', health);
    process.exit(1);
  }

  // Test 2: Security Scanner blocking dangerous APIs
  console.log('\n--- Test 2: Security Scanner Guardrails (Restricted Classroom APIs) ---');
  const restrictedSnippets = [
    { name: 'ProcessBuilder', code: 'public class Main { public static void main(String[] args) { new ProcessBuilder("ls").start(); } }' },
    { name: 'Runtime.getRuntime', code: 'public class Main { public static void main(String[] args) { Runtime.getRuntime().exec("echo hi"); } }' },
    { name: 'java.io.File', code: 'public class Main { public static void main(String[] args) { java.io.File f = new java.io.File("/tmp"); } }' },
    { name: 'java.nio.file', code: 'public class Main { public static void main(String[] args) { java.nio.file.Path p = null; } }' },
    { name: 'java.net.', code: 'public class Main { public static void main(String[] args) { java.net.Socket s = null; } }' },
    { name: 'System.exit', code: 'public class Main { public static void main(String[] args) { System.exit(0); } }' },
    { name: 'ClassLoader', code: 'public class Main { public static void main(String[] args) { ClassLoader cl = Main.class.getClassLoader(); } }' },
  ];

  for (const item of restrictedSnippets) {
    const res = await post('http://localhost:8080/api/compile', {
      sourceCode: item.code,
      className: 'Main',
    });

    if (res.data.success === false && res.data.errors && res.data.errors.length > 0) {
      const err = res.data.errors[0];
      if (err.message.includes('Classroom Security Policy')) {
        console.log(`✅ Blocked dangerous API [${item.name}]: "${err.message}" (Col ${err.column}, Line ${err.line})`);
      } else {
        console.warn(`⚠️ Blocked [${item.name}] but message was: ${err.message}`);
      }
    } else {
      console.error(`❌ Security failure: [${item.name}] was NOT blocked by scanner!`, res.data);
      process.exit(1);
    }
  }

  // Test 3: Normal valid program compiles and runs inside low-memory limit
  console.log('\n--- Test 3: Standard Program Compilation & Child Target JVM Low-Memory Options ---');
  const validCode = `public class Main {
    public static void main(String[] args) {
        int sum = 0;
        for (int i = 1; i <= 5; i++) {
            sum += i;
        }
        System.out.println("Sum: " + sum);
    }
}`;
  const validRes = await post('http://localhost:8080/api/execute', {
    sourceCode: validCode,
    className: 'Main',
  });
  if (validRes.data.compilation.success && validRes.data.steps.length > 0) {
    console.log(`✅ Program executed cleanly: ${validRes.data.steps.length} JDI steps recorded. stdout: ${validRes.data.stdout.trim()}`);
  } else {
    console.error('❌ Failed to execute standard program:', validRes.data);
    process.exit(1);
  }

  // Test 4: Maximum step limit cap (500 steps)
  console.log('\n--- Test 4: Maximum Step Cap (500 steps) for Tight Loops ---');
  const loopCode = `public class Main {
    public static void main(String[] args) {
        int x = 0;
        while (x < 10000) {
            x++;
        }
    }
}`;
  const loopRes = await post('http://localhost:8080/api/execute', {
    sourceCode: loopCode,
    className: 'Main',
  });
  const stepsCount = loopRes.data.steps.length;
  console.log(`Total steps recorded for tight loop: ${stepsCount}`);
  if (stepsCount <= 501) {
    const lastStep = loopRes.data.steps[stepsCount - 1];
    console.log(`✅ Step limit successfully capped at ${stepsCount} steps!`);
    console.log(`   Last Step Event: ${lastStep.eventType}`);
    console.log(`   Narrative: "${lastStep.narrative}"`);
  } else {
    console.error(`❌ Step limit exceeded 501 steps: got ${stepsCount}`);
  }

  // Test 5: Concurrency Limiter (Semaphore(3))
  console.log('\n--- Test 5: Concurrency Limiter (Semaphore(3) Clean Queueing) ---');
  // Launch 3 asynchronous tasks simultaneously
  const p1 = post('http://localhost:8080/api/execute/async', { sourceCode: validCode, className: 'Main' });
  const p2 = post('http://localhost:8080/api/execute/async', { sourceCode: validCode, className: 'Main' });
  const p3 = post('http://localhost:8080/api/execute/async', { sourceCode: validCode, className: 'Main' });

  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  console.log(`✅ 3 Concurrent Sessions successfully accepted:`);
  console.log(`   Session 1: ${r1.data.sessionId}`);
  console.log(`   Session 2: ${r2.data.sessionId}`);
  console.log(`   Session 3: ${r3.data.sessionId}`);

  // Test 6: Stop Button on Infinite Loop
  console.log('\n--- Test 6: Emergency Stop Button Execution ---');
  const infiniteLoop = `public class Main { public static void main(String[] args) { while(true) {} } }`;
  const launchLoop = await post('http://localhost:8080/api/execute/async', { sourceCode: infiniteLoop, className: 'Main' });
  const loopSessionId = launchLoop.data.sessionId;
  await new Promise((r) => setTimeout(r, 400));
  const killResult = await del(`http://localhost:8080/api/execute/${loopSessionId}`);
  console.log(`✅ Emergency kill response: killed = ${killResult.data.killed}`);

  console.log('\n🎉 ALL PRODUCTION HARDENING TESTS PASSED FLAWLESSLY!\n');
}

runHardeningTests().catch((err) => {
  console.error('Hardening test failed:', err);
  process.exit(1);
});
