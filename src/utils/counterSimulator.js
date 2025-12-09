/**
 * Realistic Story Counter Simulator
 * Generates dynamic schedule with human-like activity patterns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AVG_STORIES_PER_DAY = 200;
const DAILY_VARIANCE = 0.2; // ±20%
const UPDATES_PER_DAY = 50;

// Activity curve by time of day (multiplier)
const ACTIVITY_CURVE = {
  night: 0.3,   // 0-5
  morning: 0.6, // 6-10
  noon: 1.3,    // 11-14
  afternoon: 1.0, // 15-17
  evening: 1.1,   // 18-23
};

const COUNTER_FILE = path.join(__dirname, '../../data/counter.json');

/**
 * Get activity multiplier for given hour
 */
function getActivityMultiplier(hour) {
  if (hour >= 0 && hour < 6) return ACTIVITY_CURVE.night;
  if (hour >= 6 && hour < 11) return ACTIVITY_CURVE.morning;
  if (hour >= 11 && hour < 15) return ACTIVITY_CURVE.noon;
  if (hour >= 15 && hour < 18) return ACTIVITY_CURVE.afternoon;
  return ACTIVITY_CURVE.evening;
}

/**
 * Generate random time within day for update slot
 */
function randomTimeWithinDay(slotIndex, totalSlots) {
  const baseMinute = Math.floor((24 * 60 / totalSlots) * slotIndex);
  const jitter = Math.floor(Math.random() * 30 - 15); // ±15 minutes
  return Math.max(0, Math.min(24 * 60 - 1, baseMinute + jitter));
}

/**
 * Generate schedule for today
 */
function generateSchedule(target, updates) {
  const schedule = [];
  let remaining = target;

  for (let i = 0; i < updates; i++) {
    const timeInMinutes = randomTimeWithinDay(i, updates);
    const hour = Math.floor(timeInMinutes / 60);
    const activityMult = getActivityMultiplier(hour);

    // Base portion with activity curve
    const basePortion = target / updates;
    const portion = Math.max(1, Math.round(basePortion * activityMult * (0.7 + Math.random() * 0.6)));

    remaining -= portion;
    schedule.push({
      time: timeInMinutes,
      increment: portion,
      done: false,
      timestamp: null,
    });
  }

  // Adjust last update to match exact target
  schedule[schedule.length - 1].increment += remaining;

  // Sort by time
  return schedule.sort((a, b) => a.time - b.time);
}

/**
 * Initialize counter data structure
 */
function initializeCounter() {
  const today = new Date().toISOString().split('T')[0];
  const target = Math.round(AVG_STORIES_PER_DAY * (1 + (Math.random() - 0.5) * 2 * DAILY_VARIANCE));

  return {
    totalAllTime: 1323, // Starting seed
    currentDay: today,
    todayTarget: target,
    todayCount: 0,
    schedule: generateSchedule(target, UPDATES_PER_DAY),
    history: [],
  };
}

/**
 * Load counter from disk or create new
 */
function loadCounter() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(COUNTER_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(COUNTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8'));
      const today = new Date().toISOString().split('T')[0];

      // Check if new day started
      if (data.currentDay !== today) {
        // Archive yesterday's data
        data.history.push({
          date: data.currentDay,
          count: data.todayCount,
          target: data.todayTarget,
        });

        // Keep only last 30 days
        if (data.history.length > 30) {
          data.history = data.history.slice(-30);
        }

        // Start new day
        data.totalAllTime += data.todayCount;
        data.currentDay = today;
        data.todayTarget = Math.round(AVG_STORIES_PER_DAY * (1 + (Math.random() - 0.5) * 2 * DAILY_VARIANCE));
        data.todayCount = 0;
        data.schedule = generateSchedule(data.todayTarget, UPDATES_PER_DAY);
      }

      return data;
    }
  } catch (err) {
    console.error('[COUNTER] Error loading counter:', err.message);
  }

  return initializeCounter();
}

/**
 * Save counter to disk
 */
function saveCounter(data) {
  try {
    const dataDir = path.dirname(COUNTER_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[COUNTER] Error saving counter:', err.message);
  }
}

/**
 * Process scheduled updates
 */
function processUpdates(counter) {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  let updated = false;

  for (const event of counter.schedule) {
    if (!event.done && event.time <= minutesNow) {
      counter.todayCount += event.increment;
      event.done = true;
      event.timestamp = now.toISOString();
      updated = true;
    }
  }

  if (updated) {
    saveCounter(counter);
  }

  return updated;
}

/**
 * Get current counter state
 */
function getCurrentCount() {
  const counter = loadCounter();
  processUpdates(counter);

  return {
    total: counter.totalAllTime + counter.todayCount,
    today: counter.todayCount,
    todayTarget: counter.todayTarget,
    nextUpdate: getNextUpdateTime(counter),
  };
}

/**
 * Get time until next scheduled update
 */
function getNextUpdateTime(counter) {
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  const nextEvent = counter.schedule.find(e => !e.done && e.time > minutesNow);

  if (nextEvent) {
    return nextEvent.time - minutesNow; // minutes until next update
  }

  return null; // no more updates today
}

/**
 * Force increment (when user generates story)
 */
function incrementCounter(amount = 1) {
  const counter = loadCounter();
  counter.todayCount += amount;
  counter.totalAllTime += amount;
  saveCounter(counter);

  return getCurrentCount();
}

// Start background update checker (runs every minute)
let updateInterval = null;

function startCounterService() {
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  console.log('[COUNTER] Starting counter service...');

  // Initial load
  const counter = loadCounter();
  processUpdates(counter);

  // Check every minute
  updateInterval = setInterval(() => {
    const counter = loadCounter();
    const updated = processUpdates(counter);
    if (updated) {
      console.log(`[COUNTER] Updated: ${counter.todayCount}/${counter.todayTarget} today, ${counter.totalAllTime + counter.todayCount} total`);
    }
  }, 60 * 1000);
}

function stopCounterService() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

export {
  getCurrentCount,
  incrementCounter,
  startCounterService,
  stopCounterService,
};
