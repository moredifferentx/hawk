import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { validateEnv, config } from './config/env.js';
import { logger } from './utils/logger.js';
import { CooldownManager } from './utils/helpers.js';
import { connectDatabase } from './database/connection.js';
import { startLavalink, stopLavalink } from './music/lavalinkManager.js';
import { PlayerManager } from './music/playerManager.js';
import { loadEvents, loadCommands, syncCommands } from './loader.js';
import { updateTrendingCache } from './ai/trendAnalyzer.js';
import { sleep } from './utils/helpers.js';

// Module-level client ref so shutdown handlers can access it
let client = null;

// ─── Startup Pipeline ─────────────────────────────────────────
async function main() {
    logger.info('═══════════════════════════════════════');
    logger.info('  Discord Music Bot — Starting up...');
    logger.info('═══════════════════════════════════════');

    // 1. Validate environment
    validateEnv();
    logger.info('✓ Environment validated');

    // 2. Connect database
    const dbConnected = await connectDatabase(config.mongoUri);
    if (dbConnected) {
        logger.info('✓ Database connected');
    }

    // 3. Start Lavalink (or use setup prestart)
    if (process.env.PRESTARTED_LAVALINK === 'true') {
        logger.info('✓ Lavalink prestarted by setup');
    } else {
        const lavalinkReady = await startLavalink();
        if (lavalinkReady) {
            logger.info('✓ Local Lavalink fallback ready');
        } else {
            logger.info('ℹ Local Lavalink fallback not started (using external nodes and/or resolver fallbacks)');
        }
    }

    // Small delay for Lavalink to fully stabilize
    await sleep(1000);

    // 4. Create Discord client
    client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Message, Partials.Channel],
    });

    // 5. Attach managers
    client.cooldowns = new CooldownManager();
    client.playerManager = new PlayerManager(client);

    // 6. Load commands
    await loadCommands(client);
    logger.info('✓ Commands loaded');

    // 7. Load events
    await loadEvents(client);
    logger.info('✓ Events loaded');

    // 8. Login to Discord
    await client.login(config.token);

    // 9. Sync slash commands (after login)
    await syncCommands(client);
    logger.info('✓ Slash commands synced');

    // 10. Start background tasks
    if (dbConnected) {
        // Update trending cache every 6 hours
        await updateTrendingCache().catch(() => {});
        setInterval(() => updateTrendingCache().catch(() => {}), 6 * 60 * 60 * 1000);
        logger.info('✓ Trending cache initialized');
    }

    logger.info('═══════════════════════════════════════');
    logger.info('  Bot is fully operational!');
    logger.info('═══════════════════════════════════════');
}

// ─── Error Handling ────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled rejection: ${err?.message || err}`);
});

process.on('uncaughtException', (err) => {
    logger.fatal(`Uncaught exception: ${err.message}`);
    logger.fatal(err.stack);
});

// ─── Graceful Shutdown ─────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown) return; // prevent double-shutdown
    shuttingDown = true;
    logger.info(`Received ${signal} — shutting down...`);
    try {
        // Clean up all active players
        if (client?.playerManager) {
            for (const [guildId] of client.playerManager.queues) {
                await client.playerManager.destroy(guildId).catch(() => {});
            }
        }
        if (client) client.destroy();
        stopLavalink();
    } catch (err) {
        logger.error(`Shutdown error: ${err.message}`);
    }
    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Start ─────────────────────────────────────────────────────
main().catch((err) => {
    logger.fatal(`Startup failed: ${err.message}`);
    logger.fatal(err.stack);
    process.exit(1);
});
