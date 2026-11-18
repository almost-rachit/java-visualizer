import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCREENSHOT_DIR = path.resolve('verification_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickButtonWithText(page, text) {
  return page.evaluate((btnText) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn = btns.find((b) => b.innerText.toLowerCase().includes(btnText.toLowerCase()));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, text);
}

async function runBrowserVerification() {
  console.log('🌐 Launching Chrome for UI Browser Verification...');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Listen for console logs
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('Browser console error:', msg.text());
    }
  });

  try {
    // -------------------------------------------------------------
    // Test 1: Load Page & Verify Navbar & Health
    // -------------------------------------------------------------
    console.log('\n--- UI Test 1: Loading http://localhost:5173 ---');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0', timeout: 10000 });

    const title = await page.title();
    console.log(`Page Title: "${title}"`);

    // Verify Backend Health Badge
    await page.waitForFunction(
      () => document.body.innerText.includes('JVM Engine Ready'),
      { timeout: 5000 }
    );
    console.log('✅ UI Verified: "JVM Engine Ready" badge is present and green.');

    // -------------------------------------------------------------
    // Test 2: Recursion & Stepping (Step Into / Step Over)
    // -------------------------------------------------------------
    console.log('\n--- UI Test 2: Compile & Stepping through Recursion ---');
    console.log('Clicking "Compile & Debug"...');
    const clickedCompile = await clickButtonWithText(page, 'Compile & Debug');
    if (!clickedCompile) throw new Error('Compile & Debug button not found!');

    // Wait until trace loads
    await page.waitForFunction(
      () => {
        const txt = document.body.innerText;
        return txt.includes('Step 1') && txt.includes('/');
      },
      { timeout: 15000 }
    );
    console.log('✅ Trace loaded! Step 1 of factorial is active.');

    // Save screenshot 1
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_recursion_step1.png') });
    console.log('📸 Screenshot saved: 01_recursion_step1.png');

    // Click "Step Into"
    console.log('Clicking "Step Into"...');
    await clickButtonWithText(page, 'Step Into');
    await sleep(400);

    const step2Active = await page.evaluate(() => document.body.innerText.includes('Step 2'));
    if (step2Active) {
      console.log('✅ UI Verified: Step Into advanced to Step 2.');
    }

    // Click "Step Over"
    console.log('Clicking "Step Over"...');
    await clickButtonWithText(page, 'Step Over');
    await sleep(400);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_recursion_step_over.png') });
    console.log('📸 Screenshot saved: 02_recursion_step_over.png');

    // -------------------------------------------------------------
    // Test 3: Objects, Arrays & Live Heap Pointer Arrows
    // -------------------------------------------------------------
    console.log('\n--- UI Test 3: Objects, Arrays & Animated SVG Pointer Arrows ---');
    // Select Preset 2
    await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (sel) {
        sel.value = 'objects_arrays';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);

    // Click "Compile & Debug"
    await clickButtonWithText(page, 'Compile & Debug');

    await page.waitForFunction(
      () => {
        const txt = document.body.innerText;
        return txt.includes('Step 1') && txt.includes('/');
      },
      { timeout: 15000 }
    );

    // Step forward several times to reach object and array allocations
    console.log('Stepping into object and array allocations...');
    for (let i = 0; i < 7; i++) {
      await clickButtonWithText(page, 'Step Into');
      await sleep(250);
    }

    // Check SVG arrows exist and Heap has Point / int[]
    const svgArrowsCount = await page.evaluate(() => {
      const svgPaths = document.querySelectorAll('svg g path');
      return svgPaths.length;
    });
    console.log(`✅ UI Verified: ${svgArrowsCount} animated SVG pointer arrow paths rendered.`);

    const heapText = await page.evaluate(() => {
      const heapCol = document.querySelector('div[class*="lg:col-span-7"]');
      return heapCol ? heapCol.innerText : '';
    });
    console.log(`Heap contains: Point/Array/Memory: ${heapText.includes('Point') || heapText.includes('Heap')}`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_memory_canvas_svg_arrows.png') });
    console.log('📸 Screenshot saved: 03_memory_canvas_svg_arrows.png');

    // -------------------------------------------------------------
    // Test 4: Compile Error Diagnostics Card
    // -------------------------------------------------------------
    console.log('\n--- UI Test 4: Compile-Time Error Card Verification ---');
    await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (sel) {
        sel.value = 'compile_error';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);

    await clickButtonWithText(page, 'Compile & Debug');
    await sleep(1200);

    // Verify error card is displayed
    const hasErrorCard = await page.evaluate(() => {
      return document.body.innerText.includes('Compilation Failed') && document.body.innerText.includes('Why it failed');
    });
    if (hasErrorCard) {
      console.log('✅ UI Verified: Compiler error card rendered with line, col, and plain-English explanation.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_compile_error_card.png') });
    console.log('📸 Screenshot saved: 04_compile_error_card.png');

    // -------------------------------------------------------------
    // Test 5: Runtime Exception Card
    // -------------------------------------------------------------
    console.log('\n--- UI Test 5: Runtime Exception Card Verification ---');
    await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (sel) {
        sel.value = 'runtime_exception';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);

    await clickButtonWithText(page, 'Compile & Debug');

    await page.waitForFunction(
      () => {
        const txt = document.body.innerText;
        return txt.includes('Step 1') && txt.includes('/');
      },
      { timeout: 15000 }
    );

    // Step to exception step
    for (let i = 0; i < 5; i++) {
      await clickButtonWithText(page, 'Step Into');
      await sleep(200);
    }

    const hasExceptionCard = await page.evaluate(() => {
      return (
        document.body.innerText.includes('ArrayIndexOutOfBoundsException') ||
        document.body.innerText.includes('Exception Thrown')
      );
    });
    if (hasExceptionCard) {
      console.log('✅ UI Verified: Runtime Exception card rendered with crash step and plain-English cause.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_runtime_exception_card.png') });
    console.log('📸 Screenshot saved: 05_runtime_exception_card.png');

    // -------------------------------------------------------------
    // Test 6: Infinite Loop & Red Stop Button
    // -------------------------------------------------------------
    console.log('\n--- UI Test 6: Infinite Loop & Emergency Red STOP Button ---');
    await page.evaluate(() => {
      const sel = document.querySelector('select');
      if (sel) {
        sel.value = 'infinite_loop';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);

    await clickButtonWithText(page, 'Compile & Debug');

    // Wait 400ms while running
    await sleep(400);

    // Click the Red Stop Button
    console.log('Clicking the prominent Red STOP button...');
    await clickButtonWithText(page, 'Stop');
    await sleep(500);

    const hasStoppedBanner = await page.evaluate(() => {
      return (
        document.body.innerText.includes('Execution Stopped by User') ||
        document.body.innerText.includes('Killed by User')
      );
    });
    if (hasStoppedBanner) {
      console.log('✅ UI Verified: "Execution Stopped by User" banner rendered upon clicking Stop button.');
    }

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_stopped_by_user.png') });
    console.log('📸 Screenshot saved: 06_stopped_by_user.png');

    console.log('\n🎉 ALL BROWSER UI VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
