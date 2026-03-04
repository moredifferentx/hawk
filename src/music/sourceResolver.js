import { execFile, execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { LRUCache } from '../utils/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const LAVALINK_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const YTDLP_CACHE_TTL = 30 * 60 * 1000;       // 30 min (direct URLs expire)
const trackCache = new LRUCache(200, LAVALINK_CACHE_TTL);

async function waitForNode(shoukaku, timeoutMs = 7000, intervalMs = 350) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const node = shoukaku.options.nodeResolver(shoukaku.nodes);
        if (node) return node;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;
}

/**
 * Find yt-dlp executable — checks PATH and project root
 */
let ytdlpPath = null;
function getYtDlpPath() {
    if (ytdlpPath) return ytdlpPath;

    // Check local project first
    const localExe = join(ROOT, 'yt-dlp.exe');
    if (existsSync(localExe)) {
        ytdlpPath = localExe;
        return ytdlpPath;
    }

    // Check PATH
    try {
        const cmd = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
        if (result) {
            ytdlpPath = result.trim();
            return ytdlpPath;
        }
    } catch {}

    return null;
}

/**
 * Auto-install yt-dlp if not found (runs once)
 */
let ytdlpInstallAttempted = false;
async function ensureYtDlp() {
    if (getYtDlpPath()) return true;
    if (ytdlpInstallAttempted) return false;
    ytdlpInstallAttempted = true;

    logger.warn('yt-dlp not found — attempting auto-install...');

    try {
        if (process.platform === 'win32') {
            // Download binary directly into project folder
            execSync(
                'powershell -Command "Invoke-WebRequest -Uri \'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe\' -OutFile \'yt-dlp.exe\'"',
                { cwd: ROOT, timeout: 120000, stdio: 'pipe' }
            );
            if (existsSync(join(ROOT, 'yt-dlp.exe'))) {
                ytdlpPath = join(ROOT, 'yt-dlp.exe');
                logger.info('✓ yt-dlp.exe auto-downloaded');
                return true;
            }
        } else {
            // Linux/Mac — try pip
            execSync('pip3 install yt-dlp 2>/dev/null || pip install yt-dlp', {
                timeout: 120000, stdio: 'pipe',
            });
            ytdlpPath = null; // reset cache
            if (getYtDlpPath()) {
                logger.info('✓ yt-dlp auto-installed via pip');
                return true;
            }
        }
    } catch (e) {
        logger.error(`yt-dlp auto-install failed: ${e.message}`);
    }

    logger.error('Cannot resolve audio: No Lavalink and no yt-dlp available.');
    logger.error('Install yt-dlp manually: pip install yt-dlp  or  winget install yt-dlp');
    return false;
}

/**
 * Build a normalized resolved track object from a Lavalink track
 */
function buildResolved(track) {
    return {
        track: track.encoded,
        info: {
            title: track.info.title,
            author: track.info.author,
            uri: track.info.uri,
            length: track.info.length,
            artworkUrl: track.info.artworkUrl || null,
            sourceName: track.info.sourceName || 'unknown',
            isStream: track.info.isStream || false,
            isrc: track.info.isrc || null,
        },
        _playlist: track._playlist || null,
    };
}

/**
 * Resolve a query to a playable track using Lavalink, with yt-dlp fallback
 *
 * @param {import('shoukaku').Shoukaku} shoukaku - Shoukaku instance
 * @param {string} query - URL or search query
 * @returns {Promise<{track: object, info: object} | null>}
 */
export async function resolveTrack(shoukaku, query) {
    // Check cache first
    const cached = trackCache.get(query);
    if (cached) return cached;

    const node = await waitForNode(shoukaku);
    if (!node) {
        logger.warn('No Lavalink nodes available — trying yt-dlp fallback');
        return ytdlpFallback(query);
    }

    try {
        // Determine query strategy based on URL/query
        // SoundCloud first — YouTube playback often blocked on VPS IPs
        const searchQueries = isURL(query)
            ? [query]
            : [`scsearch:${query}`, `ytsearch:${query}`, `spsearch:${query}`];

        let result = null;
        for (const candidate of searchQueries) {
            result = await node.rest.resolve(candidate).catch(() => null);
            if (result && result.loadType !== 'empty' && result.loadType !== 'error') {
                break;
            }
            result = null;
        }

        if (!result) {
            logger.debug(`Lavalink found nothing for: ${query} — trying yt-dlp`);
            return ytdlpFallback(query);
        }

        let track;
        switch (result.loadType) {
            case 'track':
                track = result.data;
                break;
            case 'search':
                track = result.data[0];
                break;
            case 'playlist':
                // Return first track + attach playlist info
                track = result.data.tracks[0];
                if (track) {
                    track._playlist = {
                        name: result.data.info.name,
                        tracks: result.data.tracks,
                    };
                }
                break;
            default:
                return ytdlpFallback(query);
        }

        if (!track) return ytdlpFallback(query);

        const resolved = buildResolved(track);

        trackCache.set(query, resolved);
        return resolved;

    } catch (err) {
        logger.error(`Lavalink resolve error: ${err.message}`);
        return ytdlpFallback(query);
    }
}

/**
 * Resolve multiple tracks from a playlist result
 */
export async function resolvePlaylist(shoukaku, url) {
    const node = shoukaku.options.nodeResolver(shoukaku.nodes);
    if (!node) return [];

    try {
        const result = await node.rest.resolve(url);
        if (result?.loadType === 'playlist') {
            return result.data.tracks.map(track => buildResolved(track));
        }
    } catch (err) {
        logger.error(`Playlist resolve error: ${err.message}`);
    }
    return [];
}

/**
 * yt-dlp fallback resolver
 */
async function ytdlpFallback(query) {
    // Ensure yt-dlp is available (auto-downloads if needed)
    const available = await ensureYtDlp();
    if (!available) return null;

    const exe = getYtDlpPath();
    if (!exe) return null;

    return new Promise((resolve) => {
        const args = isURL(query)
            ? ['-j', '--no-playlist', query]
            : ['-j', '--no-playlist', `ytsearch1:${query}`];

        execFile(exe, args, { timeout: 15000 }, (error, stdout) => {
            if (error) {
                logger.debug(`yt-dlp fallback failed: ${error.message}`);
                resolve(null);
                return;
            }

            try {
                const info = JSON.parse(stdout);
                // Get best audio URL
                const audioUrl = info.url || info.formats?.find(f => f.acodec !== 'none')?.url;
                if (!audioUrl) {
                    resolve(null);
                    return;
                }

                const resolved = {
                    track: null, // No encoded track — will use HTTP source
                    info: {
                        title: info.title || query,
                        author: info.uploader || info.channel || 'Unknown',
                        uri: info.webpage_url || info.original_url || audioUrl,
                        length: (info.duration || 0) * 1000,
                        artworkUrl: info.thumbnail || null,
                        sourceName: 'yt-dlp',
                        isStream: info.is_live || false,
                        directUrl: audioUrl,
                    },
                    _playlist: null,
                };

                trackCache.set(query, resolved, YTDLP_CACHE_TTL);
                resolve(resolved);
            } catch {
                resolve(null);
            }
        });
    });
}

/**
 * Check if string is a URL
 */
function isURL(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
