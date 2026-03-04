import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a track from the queue by position')
    .addIntegerOption(opt =>
        opt.setName('position')
            .setDescription('Track position in queue (1, 2, 3...)')
            .setMinValue(1)
            .setRequired(true)
    );

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue || queue.isEmpty) {
        return interaction.reply({ content: '❌ Queue is empty.', flags: MessageFlags.Ephemeral });
    }

    const position = interaction.options.getInteger('position');
    const index = position - 1;

    if (index >= queue.size) {
        return interaction.reply({ content: `❌ Invalid position. Queue has **${queue.size}** tracks.`, flags: MessageFlags.Ephemeral });
    }

    const removed = queue.remove(index);
    if (!removed) {
        return interaction.reply({ content: '❌ Could not remove that track.', flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
        content: `🗑️ Removed **${removed.info.title}** from position ${position}.`,
        flags: MessageFlags.Ephemeral,
    });
}
