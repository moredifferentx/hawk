import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('move')
    .setDescription('Move a track to a different position in the queue')
    .addIntegerOption(opt =>
        opt.setName('from')
            .setDescription('Current position of the track')
            .setMinValue(1)
            .setRequired(true)
    )
    .addIntegerOption(opt =>
        opt.setName('to')
            .setDescription('New position to move it to')
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

    const from = interaction.options.getInteger('from') - 1;
    const to = interaction.options.getInteger('to') - 1;

    if (from >= queue.size || to >= queue.size) {
        return interaction.reply({ content: `❌ Invalid position. Queue has **${queue.size}** tracks.`, flags: MessageFlags.Ephemeral });
    }

    if (from === to) {
        return interaction.reply({ content: '❌ Track is already at that position.', flags: MessageFlags.Ephemeral });
    }

    const [track] = queue.tracks.splice(from, 1);
    queue.tracks.splice(to, 0, track);

    await interaction.reply({
        content: `↕️ Moved **${track.info.title}** from #${from + 1} to #${to + 1}.`,
        flags: MessageFlags.Ephemeral,
    });
}
