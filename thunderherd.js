const { Pool } = require('pg');
const config = require('./config.json');

const pool = new Pool(config.db);

/**
 * Semaphore configuration
 */
const LOCK_KEY = 'my-test-lock';
const TIMEOUT_SEC = 60;        // Lock TTL in seconds
const MAX_LOCK_COUNT = 2;     // Semaphore capacity
const APP_NAME = 'concurrency-test';

/**
 * Simulation configuration
 */
const SIMULATED_PROCESSES = 5; // Thundering herd size
const WORK_DURATION_MS = 2000;  // Simulated critical section time

/**
 * Retry configuration
 */
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 200;    // Base delay per retry
const JITTER_MS = 200;          // Random jitter to avoid retry storm

/**
 * Result tracking (for final summary)
 */
const executionSummary = {
  success: [],
  failed: []
};

/**
 * Utility sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Acquire semaphore
 */
async function acquireSemaphore(client) {
  const result = await client.query(
    'SELECT attempt_to_acquire_semaphore_child($1, $2, $3, $4) AS token',
    [LOCK_KEY, TIMEOUT_SEC, MAX_LOCK_COUNT, APP_NAME]
  );
  return result.rows[0].token;
}

/**
 * Release semaphore
 */
async function releaseSemaphore(client, token) {
  const result = await client.query(
    'SELECT release_semaphore_child($1, $2) AS released',
    [LOCK_KEY, token]
  );
  return result.rows[0].released;
}

/**
 * One simulated competing process
 */
async function simulateProcess(processId) {
  const client = await pool.connect();
  let attempts = 0;

  try {
    console.log(`[Process ${processId}] Started`);

    let token = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      attempts = attempt;

      console.log(
        `[Process ${processId}] Attempt ${attempt}/${MAX_RETRIES} to acquire semaphore`
      );

      token = await acquireSemaphore(client);

      if (token) {
        console.log(
          `[Process ${processId}] ✅ Acquired semaphore (token=${token})`
        );
        break;
      }

      const backoff =
        BASE_BACKOFF_MS * attempt +
        Math.floor(Math.random() * JITTER_MS);

      console.log(
        `[Process ${processId}] ❌ Failed to acquire, retrying in ${backoff} ms`
      );

      await sleep(backoff);
    }

    /**
     * Failed after retries
     */
    if (!token) {
      console.log(
        `[Process ${processId}] 🚫 Giving up after ${MAX_RETRIES} attempts`
      );

      executionSummary.failed.push({
        processId,
        attempts
      });

      return;
    }

    /**
     * Critical section
     */
    try {
      console.log(`[Process ${processId}] 🔧 Doing work...`);
      await sleep(WORK_DURATION_MS);
      console.log(`[Process ${processId}] ✅ Work completed`);
    } finally {
      const released = await releaseSemaphore(client, token);

      if (released) {
        console.log(`[Process ${processId}] 🔓 Semaphore released`);
      } else {
        console.log(
          `[Process ${processId}] ⚠️ Failed to release (token expired?)`
        );
      }
    }

    /**
     * Success record
     */
    executionSummary.success.push({
      processId,
      attempts
    });

  } catch (err) {
    console.error(`[Process ${processId}] Error:`, err.message);

    executionSummary.failed.push({
      processId,
      attempts,
      error: err.message
    });
  } finally {
    client.release();
  }
}

/**
 * Main simulation
 */
async function main() {
  console.log('----------------------------------------');
  console.log(' THUNDERING HERD SIMULATION STARTED');
  console.log('----------------------------------------');
  console.log(`Processes           : ${SIMULATED_PROCESSES}`);
  console.log(`Semaphore capacity  : ${MAX_LOCK_COUNT}`);
  console.log(`Max retries/process : ${MAX_RETRIES}`);
  console.log(`WorkDuration_MilliSeconds     : ${WORK_DURATION_MS}`);
  console.log(`BASE_BACKOFF_MilliSeconds  : ${BASE_BACKOFF_MS}`);
  console.log(`JITTER_MilliSeconds : ${JITTER_MS}`);
  console.log('----------------------------------------\n');

  const processes = [];

  for (let i = 1; i <= SIMULATED_PROCESSES; i++) {
    processes.push(simulateProcess(i));
  }

  await Promise.all(processes);

  /**
   * Final summary
   */
  console.log('\n========================================');
  console.log(' THUNDERING HERD SIMULATION SUMMARY');
  console.log('========================================');
  console.log(`Total Processes        : ${SIMULATED_PROCESSES}`);
  console.log(`Semaphore Capacity     : ${MAX_LOCK_COUNT}`);
  console.log(`Successful Entrants    : ${executionSummary.success.length}`);
  console.log(`Failed After Retries   : ${executionSummary.failed.length}`);

  console.log('\n✅ Successful Processes:');
  executionSummary.success.forEach(p =>
    console.log(`  - Process ${p.processId} (attempts=${p.attempts})`)
  );

  console.log('\n❌ Failed Processes:');
  executionSummary.failed.forEach(p =>
    console.log(`  - Process ${p.processId} (attempts=${p.attempts})`)
  );

  console.log('========================================\n');

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
});
