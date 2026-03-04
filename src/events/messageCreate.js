import { logger } from '../utils/logger.js';
import { Guild } from '../database/schemas/Guild.js';
import { config } from '../config/env.js';

export const name = 'messageCreate';

// ── In-memory cache: guildId → requestChannelId (avoids DB lookup per message) ──
const channelCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5-minute TTL

async function getRequestChannelId(guildId) {
    const cached = channelCache.get(guildId);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.channelId;
    }

    let channelId = null;
    try {
        const guildDoc = await Guild.findOne({ guildId }).lean();
        if (guildDoc?.requestChannelId) {
            channelId = guildDoc.requestChannelId;
        }
    } catch {
        // DB might not be connected
    }

    // Fallback to .env config
    if (!channelId) {
        channelId = config.requestChannelId || null;
    }

    channelCache.set(guildId, { channelId, expiresAt: Date.now() + CACHE_TTL });
    return channelId;
}

/** Invalidate cache when setup command changes the channel */
export function invalidateChannelCache(guildId) {
    channelCache.delete(guildId);
}

export async function execute(message, client) {
    // Ignore bots
    if (message.author.bot) return;

    // Check if this is the request channel
    const guildId = message.guild?.id;
    if (!guildId) return;

    const requestChannelId = await getRequestChannelId(guildId);

    // Not the request channel
    if (!requestChannelId || message.channel.id !== requestChannelId) return;

    const query = message.content.trim();
    if (!query) return;

    // Auto-delete the user's message
    setTimeout(() => {
        message.delete().catch(() => {});
    }, config.autoDeleteDelay);

    // Process the song request
    try {
        const playerManager = client.playerManager;
        if (!playerManager) {
            return;
        }

        // Check if user is in a voice channel
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            const warn = await message.channel.send('🔇 Join a voice channel first!');
            setTimeout(() => warn.delete().catch(() => {}), 5000);
            return;
        }

        await playerManager.play(message.guild, voiceChannel, query, message.member, message.channel);
    } catch (err) {
        logger.error(`Request channel error: ${err.message}`);
    }
}
