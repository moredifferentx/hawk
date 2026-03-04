import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { stopLavalink } from '../../music/lavalinkManager.js';

export const data = new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Completely stop the bot and all related processes (Lavalink, players, etc.)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction, client) {
    // Double-check administrator permission
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
            content: '❌ Only server administrators can shut down the bot.',
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.reply({
        content: '🔌 **Shutting down bot...**\nStopping all players, disconnecting from voice, killing Lavalink, and exiting.\nUse `node setup.js` or `npm start` to restart.',
    });

    logger.info(`Shutdown requested by ${interaction.user.tag} in guild ${interaction.guildId}`);

    try {
        // 1. Stop all active players and leave all voice channels
        if (client.playerManager) {
            const guilds = [...client.playerManager.queues.keys()];
            logger.info(`Cleaning up ${guilds.length} active player(s)...`);
            for (const guildId of guilds) {
                await client.playerManager.destroy(guildId).catch(() => {});
            }
        }

        // 2. Stop Lavalink child process
        stopLavalink();
        logger.info('Lavalink process stopped');

        // 3. Destroy Discord client connection
        client.destroy();
        logger.info('Discord client destroyed');

        // 4. Exit process (kills everything)
        logger.info('Bot fully shut down — goodbye!');
        process.exit(0);
    } catch (err) {
        logger.error(`Error during shutdown: ${err.message}`);
        process.exit(1);
    }
}
