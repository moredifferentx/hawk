import { logger } from '../utils/logger.js';

export const name = 'voiceStateUpdate';

// Track pending auto-leave timers per guild
const leaveTimers = new Map();
const LEAVE_DELAY = 120_000; // 2 minutes

export async function execute(oldState, newState) {
    const client = oldState.client || newState.client;
    const guildId = oldState.guild.id;

    // We only care about the voice channel the bot is in
    const botVoiceChannel = oldState.guild.members.me?.voice?.channel;
    if (!botVoiceChannel) return;

    // Check if the event involves the bot's voice channel
    const isRelevant =
        oldState.channelId === botVoiceChannel.id ||
        newState.channelId === botVoiceChannel.id;

    if (!isRelevant) return;

    // Count human members in the bot's channel
    const humanMembers = botVoiceChannel.members.filter(m => !m.user.bot).size;

    if (humanMembers === 0) {
        // Everyone left — check for 24/7 mode
        const queue = client.playerManager?.queues.get(guildId);
        if (queue?.twentyFourSeven) {
            logger.debug(`Guild ${guildId}: voice empty but 24/7 mode is on — staying`);
            return;
        }

        // Start auto-leave timer (only if one isn't already running)
        if (!leaveTimers.has(guildId)) {
            logger.debug(`Guild ${guildId}: voice channel empty — auto-leave in ${LEAVE_DELAY / 1000}s`);

            const timer = setTimeout(async () => {
                leaveTimers.delete(guildId);

                // Re-check: still empty?
                const currentChannel = oldState.guild.members.me?.voice?.channel;
                if (!currentChannel) return;

                const stillEmpty = currentChannel.members.filter(m => !m.user.bot).size === 0;
                if (stillEmpty) {
                    logger.info(`Guild ${guildId}: auto-leaving empty voice channel`);
                    await client.playerManager?.destroy(guildId);
                }
            }, LEAVE_DELAY);

            leaveTimers.set(guildId, timer);
        }
    } else {
        // Someone joined back — cancel pending leave
        if (leaveTimers.has(guildId)) {
            clearTimeout(leaveTimers.get(guildId));
            leaveTimers.delete(guildId);
            logger.debug(`Guild ${guildId}: user rejoined — cancelled auto-leave`);
        }
    }
}
