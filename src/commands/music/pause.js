import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current track');

export async function execute(interaction, client) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: '🔇 Join a voice channel first!', flags: MessageFlags.Ephemeral });
    }

    const player = client.playerManager.shoukaku.players.get(interaction.guildId);
    if (!player) {
        return interaction.reply({ content: '❌ Nothing is playing.', flags: MessageFlags.Ephemeral });
    }

    if (player.paused) {
        return interaction.reply({ content: '⏸ Already paused. Use `/resume`.', flags: MessageFlags.Ephemeral });
    }

    await player.setPaused(true);
    const queue = client.playerManager.queues.get(interaction.guildId);
    if (queue) queue.paused = true;
    await interaction.reply({ content: '⏸ Paused!', flags: MessageFlags.Ephemeral });
}
