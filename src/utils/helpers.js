/**
 * Format milliseconds into mm:ss or hh:mm:ss
 */
export function formatDuration(ms) {
    if (!ms || ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Generate a visual progress bar using emoji
 * @param {number} current - current position in ms
 * @param {number} total - total duration in ms
 * @param {number} length - bar length in segments
 */
export function createProgressBar(current, total, length = 16) {
    if (!total || total <= 0) return '▬'.repeat(length);
    const progress = Math.min(current / total, 1);
    const filled = Math.round(progress * length);
    const empty = length - filled;
    const bar = '▰'.repeat(filled) + '▱'.repeat(empty);
    return bar;
}

/**
 * Truncate text to a max length with ellipsis
 */
export function truncate(str, maxLen = 50) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}

/**
 * Simple LRU cache with optional TTL support
 */
export class LRUCache {
    constructor(maxSize = 100, defaultTtl = 0) {
        this.maxSize = maxSize;
        this.defaultTtl = defaultTtl; // ms, 0 = no expiry
        this.cache = new Map();
    }

    get(key) {
        if (!this.cache.has(key)) return null;
        const entry = this.cache.get(key);
        // Check TTL expiry
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.value;
    }

    set(key, value, ttl) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Delete oldest (first) entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        const effectiveTtl = ttl ?? this.defaultTtl;
        this.cache.set(key, {
            value,
            expiresAt: effectiveTtl > 0 ? Date.now() + effectiveTtl : 0,
        });
    }

    has(key) {
        if (!this.cache.has(key)) return false;
        const entry = this.cache.get(key);
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        return true;
    }

    clear() {
        this.cache.clear();
    }
}

/**
 * Simple cooldown manager with automatic cleanup
 */
export class CooldownManager {
    constructor() {
        this.cooldowns = new Map();

        // Periodically purge expired entries to prevent memory leaks
        this._cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, expiry] of this.cooldowns) {
                if (now >= expiry) this.cooldowns.delete(key);
            }
        }, 60_000); // Every minute
    }

    /**
     * Check if user is on cooldown
     * @returns {number} remaining ms, 0 if not on cooldown
     */
    check(userId, command, cooldownMs = 3000) {
        const key = `${userId}-${command}`;
        const now = Date.now();
        const expiry = this.cooldowns.get(key);
        if (expiry && now < expiry) {
            return expiry - now;
        }
        this.cooldowns.set(key, now + cooldownMs);
        return 0;
    }

    clear(userId, command) {
        this.cooldowns.delete(`${userId}-${command}`);
    }

    destroy() {
        clearInterval(this._cleanupInterval);
        this.cooldowns.clear();
    }
}

/**
 * Wait for a specified amount of time
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
