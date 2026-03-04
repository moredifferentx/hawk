import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('Shuffle the current queue');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const queue = client.playerManager.queues.get(interaction.guildId);
    if (!queue || queue.isEmpty) {
        return interaction.reply({ content: '❌ Queue is empty.', flags: MessageFlags.Ephemeral });
    }

    queue.shuffle();
    await interaction.reply({ content: `🔀 Shuffled **${queue.size}** tracks!`, flags: MessageFlags.Ephemeral });
}
