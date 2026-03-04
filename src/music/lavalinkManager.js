import { spawn, execSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, createWriteStream, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import net from 'net';
import https from 'https';
import http from 'http';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';
import { lavalinkConfig } from '../config/lavalink.js';
import { sleep } from '../utils/helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAVALINK_DIR = join(__dirname, '..', '..', 'lavalink');
const LAVALINK_JAR = join(LAVALINK_DIR, 'Lavalink.jar');
const LAVALINK_YML = join(LAVALINK_DIR, 'application.yml');

// Latest stable Lavalink v4 release
const LAVALINK_DOWNLOAD_URL = 'https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar';

let lavalinkProcess = null;

// ─── Helpers ───────────────────────────────────────────────────

/**
 * Check if a port is in use (i.e. Lavalink is already running)
 */
function isPortInUse(port) {
    return new Promise((resolve) => {
        const tester = net.createConnection({ port, host: config.lavalink.local.host }, () => {
            tester.end();
            resolve(true);
        });
        tester.on('error', () => resolve(false));
    });
}

/**
 * Check if Java is installed and return version info
 */
function checkJava() {
    try {
        const output = execSync('java -version 2>&1', { encoding: 'utf-8', timeout: 10000 });
        const match = output.match(/version "(\d+)/);
        const majorVersion = match ? parseInt(match[1], 10) : 0;
        return { installed: true, version: majorVersion, output: output.trim() };
    } catch {
        return { installed: false, version: 0, output: '' };
    }
}

/**
 * Follow redirects and download a file
 */
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(destPath);
        let totalBytes = 0;
        let downloadedBytes = 0;
        let lastLogPercent = 0;

        const doRequest = (requestUrl) => {
            const client = requestUrl.startsWith('https') ? https : http;

            client.get(requestUrl, { headers: { 'User-Agent': 'DiscordMusicBot/1.0' } }, (response) => {
                // Handle redirects (301, 302, 307, 308)
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    response.resume(); // discard body
                    doRequest(response.headers.location);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    try { unlinkSync(destPath); } catch {}
                    reject(new Error(`Download failed: HTTP ${response.statusCode}`));
                    return;
                }

                totalBytes = parseInt(response.headers['content-length'] || '0', 10);

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                        if (percent >= lastLogPercent + 10) {
                            lastLogPercent = percent;
                            const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
                            const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
                            logger.info(`  Downloading Lavalink... ${mb}MB / ${totalMb}MB (${percent}%)`);
                        }
                    }
                });

                pipeline(response, file)
                    .then(() => resolve(true))
                    .catch((err) => {
                        try { unlinkSync(destPath); } catch {}
                        reject(err);
                    });

            }).on('error', (err) => {
                file.close();
                try { unlinkSync(destPath); } catch {}
                reject(err);
            });
        };

        doRequest(url);
    });
}

// ─── Core Functions ────────────────────────────────────────────

/**
 * Ensure the lavalink directory and application.yml exist
 */
function ensureConfig() {
    if (!existsSync(LAVALINK_DIR)) {
        mkdirSync(LAVALINK_DIR, { recursive: true });
    }
    writeFileSync(LAVALINK_YML, lavalinkConfig, 'utf-8');
    logger.info('Lavalink application.yml written');
}

/**
 * Auto-download Lavalink.jar if not present
 */
async function ensureLavalinkJar() {
    if (existsSync(LAVALINK_JAR)) {
        logger.info('Lavalink.jar found');
        return true;
    }

    // Ensure directory exists
    if (!existsSync(LAVALINK_DIR)) {
        mkdirSync(LAVALINK_DIR, { recursive: true });
    }

    logger.info('╔══════════════════════════════════════╗');
    logger.info('║  Lavalink.jar not found — downloading  ║');
    logger.info('╚══════════════════════════════════════╝');
    logger.info(`Source: ${LAVALINK_DOWNLOAD_URL}`);

    try {
        await downloadFile(LAVALINK_DOWNLOAD_URL, LAVALINK_JAR);
        logger.info('✓ Lavalink.jar downloaded successfully');
        return true;
    } catch (err) {
        logger.error(`✗ Failed to download Lavalink.jar: ${err.message}`);
        logger.warn('  The bot will still work using yt-dlp fallback');
        logger.warn('  You can manually download from: https://github.com/lavalink-devs/Lavalink/releases');
        return false;
    }
}

/**
 * Ensure Java 17+ is available
 */
function ensureJava() {
    const java = checkJava();

    if (!java.installed) {
        logger.error('╔══════════════════════════════════════╗');
        logger.error('║  Java is NOT installed!              ║');
        logger.error('╚══════════════════════════════════════╝');
        logger.error('  Lavalink requires Java 17 or higher.');
        logger.error('  Install from: https://adoptium.net/');
        logger.error('  Or run:  winget install EclipseAdoptium.Temurin.21.JRE');
        logger.error('  The bot will still work using yt-dlp fallback.');
        return false;
    }

    if (java.version < 17) {
        logger.warn(`Java ${java.version} found — Lavalink needs Java 17+`);
        logger.warn('  Upgrade from: https://adoptium.net/');
        return false;
    }

    logger.info(`Java ${java.version} detected ✓`);
    return true;
}

/**
 * Spawn Lavalink as a child process
 */
function spawnLavalink() {
    return new Promise((resolve) => {
        ensureConfig();

        logger.info('Starting Lavalink server...');

        const javaOptsRaw = process.env.LAVALINK_JAVA_OPTS || '-Xms512M -Xmx1024M -XX:+UseG1GC -Dsun.zip.disableMemoryMapping=true';
        const javaOpts = javaOptsRaw.split(/\s+/).filter(Boolean);
        const javaArgs = [...javaOpts, '-jar', 'Lavalink.jar'];

        lavalinkProcess = spawn('java', javaArgs, {
            cwd: LAVALINK_DIR,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let started = false;
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(bootTimeout);
            resolve(value);
        };

        lavalinkProcess.stdout.on('data', (data) => {
            const line = data.toString();
            if (line.includes('Lavalink is ready') || line.includes('Started LavalinkApplication')) {
                if (!started) {
                    started = true;
                    logger.info('✓ Lavalink started successfully');
                    finish(true);
                }
            }
        });

        lavalinkProcess.stderr.on('data', (data) => {
            const line = data.toString().trim();
            if (line && !line.includes('SLF4J')) {
                logger.debug(`Lavalink: ${line}`);
            }
        });

        lavalinkProcess.on('error', (err) => {
            logger.error(`Lavalink process error: ${err.message}`);
            if (!started) finish(false);
        });

        lavalinkProcess.on('exit', (code) => {
            if (!started) {
                logger.warn(`Lavalink exited with code ${code} before ready`);
                finish(false);
            } else {
                logger.warn(`Lavalink exited with code ${code}`);
            }
            lavalinkProcess = null;
        });

        // Timeout after 180 seconds (first launch can be slow due to plugin downloads/updates)
        const bootTimeout = setTimeout(() => {
            if (!started) {
                logger.warn('Lavalink start timed out (180s) — continuing without it');
                finish(false);
            }
        }, 180000);
    });
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Full auto-setup: check Java → download jar → write config → spawn
 */
export async function startLavalink() {
    if (!config.lavalink.enableLocalFallback || !config.lavalink.local.manage) {
        logger.info('Local Lavalink management disabled — expecting external Lavalink nodes');
        return false;
    }

    // Already running?
    const running = await isPortInUse(config.lavalink.local.port);
    if (running) {
        logger.info(`Local Lavalink already running on ${config.lavalink.local.host}:${config.lavalink.local.port}`);
        return true;
    }

    // Step 1: Check Java
    const javaOk = ensureJava();
    if (!javaOk) {
        return false;
    }

    // Step 2: Auto-download Lavalink.jar
    const jarReady = await ensureLavalinkJar();
    if (!jarReady) {
        return false;
    }

    // Step 3: Spawn
    return await spawnLavalink();
}

/**
 * Gracefully stop Lavalink
 */
export function stopLavalink() {
    if (lavalinkProcess) {
        logger.info('Stopping Lavalink...');
        lavalinkProcess.kill('SIGTERM');
        lavalinkProcess = null;
    }
}
