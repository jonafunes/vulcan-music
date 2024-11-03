require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const queue = new Map(); 

client.once('ready', () => {
    console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const args = message.content.split(' ');
    const command = args[0];

    const serverQueue = queue.get(message.guild.id);

    if (command === '!play') {
        const url = args[1];
        if (!url || !ytdl.validateURL(url)) {
            return message.reply("Por favor proporciona un enlace válido de YouTube.");
        }
        const songInfo = await ytdl.getInfo(url);
        const song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url,
        };

        if (!serverQueue) {
            const queueConstructor = {
                textChannel: message.channel, // Canal de texto asignado
                voiceChannel: message.member.voice.channel,
                connection: null,
                songs: [],
                player: createAudioPlayer(),
                playing: true
            };
            queue.set(message.guild.id, queueConstructor);
            queueConstructor.songs.push(song);

            try {
                const connection = joinVoiceChannel({
                    channelId: message.member.voice.channel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });
                queueConstructor.connection = connection;
                connection.subscribe(queueConstructor.player);

                playSong(message.guild, queueConstructor.songs[0]);

                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    queue.delete(message.guild.id);
                });

            } catch (err) {
                console.error(err);
                queue.delete(message.guild.id);
                return message.reply("Hubo un error al intentar conectar al canal de voz.");
            }
        } else {
            serverQueue.songs.push(song);
            return message.reply(`🎶 **${song.title}** ha sido añadida a la cola.`);
        }
    } else if (command === '!skip') {
        if (!serverQueue) return message.reply("No hay canciones en la cola para saltar.");
        serverQueue.player.stop();
    } else if (command === '!stop') {
        if (!serverQueue) return message.reply("No hay canciones en reproducción.");
        serverQueue.songs = [];
        serverQueue.player.stop();
        message.reply("🛑 Se ha detenido la reproducción y limpiado la cola.");
    } else if (command === '!pause') {
        if (!serverQueue || !serverQueue.playing) return message.reply("No hay ninguna canción reproduciéndose.");
        serverQueue.player.pause();
        serverQueue.playing = false;
        message.reply("⏸️ Canción en pausa.");
    } else if (command === '!resume') {
        if (!serverQueue || serverQueue.playing) return message.reply("No hay ninguna canción en pausa.");
        serverQueue.player.unpause();
        serverQueue.playing = true;
        message.reply("▶️ Canción reanudada.");
    } else if (command === '!queue') {
        if (!serverQueue || !serverQueue.songs.length) return message.reply("La cola está vacía.");
        const songList = serverQueue.songs.map((song, index) => `${index + 1}. ${song.title}`).join('\n');
        message.reply(`🎶 **Cola de reproducción:**\n${songList}`);
    }
});

function playSong(guild, song) {
    const serverQueue = queue.get(guild.id);
    if (!serverQueue) {
        console.warn('No se encontró la cola del servidor.');
        return;
    }

    if (!song) {
        // Verificar si la conexión existe antes de intentar destruirla
        if (serverQueue.connection) {
            serverQueue.connection.destroy();
        }
        queue.delete(guild.id);
        return;
    }

    const stream = ytdl(song.url, {
        filter: 'audioonly',
        highWaterMark: 1 << 25,
        quality: 'highestaudio'
    });
    const resource = createAudioResource(stream);
    serverQueue.player.play(resource);

    serverQueue.player.on(AudioPlayerStatus.Idle, () => {
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    });

    serverQueue.player.on('error', error => {
        console.error(error);
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0]);
    });

    if (serverQueue.textChannel) {
        serverQueue.textChannel.send(`🎶 Ahora reproduciendo: **${song.title}**`);
    } else {
        console.warn('El canal de texto no está definido.');
    }
}

client.login(process.env.DISCORD_TOKEN);
