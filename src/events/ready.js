import { ActivityType, PresenceUpdateStatus } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = 'clientReady';
export const once = true;

// ── Rotating presence statuses ─────────────────────────────────
const presences = [
    { name: '🎵 /play to jam', type: ActivityType.Listening },
    { name: '{guilds} servers', type: ActivityType.Watching },
    { name: '{users} listeners', type: ActivityType.Watching },
    { name: '🎶 music for you', type: ActivityType.Listening },
    { name: '/help • /play • /queue', type: ActivityType.Playing },
    { name: '🔊 vibes in {voiceCount} channels', type: ActivityType.Playing },
];

const ROTATE_INTERVAL = 15_000; // 15 seconds

export async function execute(client) {
    logger.info(`Logged in as ${client.user.tag} — serving ${client.guilds.cache.size} guilds`);

    let index = 0;

    function updatePresence() {
        const template = presences[index % presences.length];
        const guildCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
        const voiceCount = client.playerManager?.queues.size || 0;

        const activityName = template.name
            .replace('{guilds}', guildCount.toLocaleString())
            .replace('{users}', userCount.toLocaleString())
            .replace('{voiceCount}', voiceCount.toString());

        client.user.setPresence({
            status: PresenceUpdateStatus.Online,
            activities: [
                {
                    name: activityName,
                    type: template.type,
                    ...(template.url && { url: template.url }),
                },
            ],
        });

        index++;
    }

    // Set initial presence immediately, then rotate
    updatePresence();
    setInterval(updatePresence, ROTATE_INTERVAL);
}
