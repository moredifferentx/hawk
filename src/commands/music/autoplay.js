import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle AI autoplay when the queue runs empty');

export async function execute(interaction, client) {
    const queue = client.playerManager.getQueue(interaction.guildId);
    queue.autoplay = !queue.autoplay;
    queue.saveSettings();

    await interaction.reply({
        content: `🤖 Autoplay: **${queue.autoplay ? 'Enabled' : 'Disabled'}**`,
        flags: MessageFlags.Ephemeral,
    });
}
