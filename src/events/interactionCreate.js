import { MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = 'interactionCreate';

export async function execute(interaction, client) {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // Cooldown check
            const cooldown = client.cooldowns.check(interaction.user.id, interaction.commandName, 3000);
            if (cooldown > 0) {
                return interaction.reply({
                    content: `⏳ Please wait ${(cooldown / 1000).toFixed(1)}s before using this again.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            await command.execute(interaction, client);
        } catch (err) {
            logger.error(`Command error [${interaction.commandName}]: ${err.message}`);
            const reply = { content: '❌ An error occurred while executing this command.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    }

    // Handle button interactions (player controls)
    if (interaction.isButton()) {
        const playerManager = client.playerManager;
        if (!playerManager) return;

        try {
            await playerManager.handleButton(interaction);
        } catch (err) {
            logger.error(`Button error: ${err.message}`);
            // Use followUp since handleButton calls deferUpdate()
            await interaction.followUp({ content: '❌ Button action failed.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
}
