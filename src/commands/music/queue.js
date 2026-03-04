import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createQueueEmbed } from '../../ui/playerEmbed.js';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the current music queue')
    .addIntegerOption(opt =>
        opt.setName('page')
            .setDescription('Queue page number')
            .setMinValue(1)
            .setRequired(false)
    );

export async function execute(interaction, client) {
    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue || (!queue.currentTrack && queue.isEmpty)) {
        return interaction.reply({ content: '📋 Queue is empty.', flags: MessageFlags.Ephemeral });
    }

    const page = (interaction.options.getInteger('page') || 1) - 1;
    const embed = createQueueEmbed(queue, page);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
