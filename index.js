const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    RoleSelectMenuBuilder
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;

// ==============================
// データ
// ==============================

const recruitments = new Map();

client.recruitmentDrafts = new Map();


// ==============================
// 日本時間（JST）処理
// ==============================

const JST_OFFSET = 9 * 60 * 60 * 1000;


// 現在の日本時間の日付を取得
function getJSTNowParts() {

    const jst = new Date(
        Date.now() + JST_OFFSET
    );

    return {
        year: jst.getUTCFullYear(),
        month: jst.getUTCMonth() + 1,
        day: jst.getUTCDate(),
        hour: jst.getUTCHours(),
        minute: jst.getUTCMinutes()
    };
}


// JSTとしてDateを作成
function createJSTDate(
    year,
    month,
    day,
    hour,
    minute
) {

    return new Date(
        Date.UTC(
            year,
            month - 1,
            day,
            hour - 9,
            minute,
            0,
            0
        )
    );
}


// 日付が正しいか確認
function isValidDate(
    year,
    month,
    day
) {

    const date = new Date(
        Date.UTC(
            year,
            month - 1,
            day
        )
    );

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}


// ==============================
// 開始時刻
// ==============================
//
// 例
// 22:00
// 2026/09/26 22:00
//
// すべて日本時間として扱う
//

function parseTime(input) {

    const now = new Date();

    input = input.trim();

    // ==========================
    // HH:MM
    // ==========================

    const timeMatch =
        input.match(
            /^(\d{1,2}):(\d{2})$/
        );

    if (timeMatch) {

        const hour =
            Number(timeMatch[1]);

        const minute =
            Number(timeMatch[2]);

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const jst =
            getJSTNowParts();

        let date =
            createJSTDate(
                jst.year,
                jst.month,
                jst.day,
                hour,
                minute
            );

        // すでに過ぎている時刻なら翌日
        if (date <= now) {

            date =
                new Date(
                    date.getTime() +
                    24 * 60 * 60 * 1000
                );
        }

        return date;
    }


    // ==========================
    // YYYY/MM/DD HH:MM
    // ==========================

    const dateMatch =
        input.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/
        );

    if (dateMatch) {

        const year =
            Number(dateMatch[1]);

        const month =
            Number(dateMatch[2]);

        const day =
            Number(dateMatch[3]);

        const hour =
            Number(dateMatch[4]);

        const minute =
            Number(dateMatch[5]);

        if (
            !isValidDate(
                year,
                month,
                day
            )
        ) {
            return null;
        }

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date =
            createJSTDate(
                year,
                month,
                day,
                hour,
                minute
            );

        if (date <= now) {
            return null;
        }

        return date;
    }

    return null;
}


// ==============================
// 終了時刻
// ==============================
//
// 22:00 → 23:00
//
// 開始と同じ日として扱う。
// 終了時刻が開始時刻より前なら翌日。
//

function parseEndTime(
    input,
    startTime
) {

    input = input.trim();

    // ==========================
    // HH:MM
    // ==========================

    const timeMatch =
        input.match(
            /^(\d{1,2}):(\d{2})$/
        );

    if (timeMatch) {

        const hour =
            Number(timeMatch[1]);

        const minute =
            Number(timeMatch[2]);

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        // 開始時刻をJSTに変換
        const jstStart =
            new Date(
                startTime.getTime() +
                JST_OFFSET
            );

        const year =
            jstStart.getUTCFullYear();

        const month =
            jstStart.getUTCMonth() + 1;

        const day =
            jstStart.getUTCDate();

        let date =
            createJSTDate(
                year,
                month,
                day,
                hour,
                minute
            );

        // 終了時刻が開始時刻以前なら翌日
        if (date <= startTime) {

            date =
                new Date(
                    date.getTime() +
                    24 * 60 * 60 * 1000
                );
        }

        return date;
    }


    // ==========================
    // YYYY/MM/DD HH:MM
    // ==========================

    const dateMatch =
        input.match(
            /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})$/
        );

    if (dateMatch) {

        const year =
            Number(dateMatch[1]);

        const month =
            Number(dateMatch[2]);

        const day =
            Number(dateMatch[3]);

        const hour =
            Number(dateMatch[4]);

        const minute =
            Number(dateMatch[5]);

        if (
            !isValidDate(
                year,
                month,
                day
            )
        ) {
            return null;
        }

        if (
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            return null;
        }

        const date =
            createJSTDate(
                year,
                month,
                day,
                hour,
                minute
            );

        if (date <= startTime) {
            return null;
        }

        return date;
    }

    return null;
}


// ==============================
// 募集メッセージ更新
// ==============================

async function updateRecruitmentMessage(
    recruitment
) {

    try {

        const channel =
            await client.channels.fetch(
                recruitment.channelId
            );

        if (!channel) return;

        const message =
            await channel.messages.fetch(
                recruitment.messageId
            );

        if (!message) return;


        const participantMentions =
            recruitment.participants
                .map(
                    id => `<@${id}>`
                )
                .join(' ');


        const startText =
            `<t:${Math.floor(
                recruitment.startTime.getTime() / 1000
            )}:F>`;


        const endText =
            `<t:${Math.floor(
                recruitment.endTime.getTime() / 1000
            )}:F>`;


        let statusText =
            '🟢 募集中';


        if (recruitment.closed) {

            statusText =
                '🔒 募集終了';

        } else if (recruitment.started) {

            statusText =
                '🟢 開始済み';

        } else if (
            recruitment.participants.length >=
            recruitment.maxPlayers
        ) {

            statusText =
                '🔒 定員到達';
        }


        const embed =
            new EmbedBuilder()
                .setTitle(
                    '🎮 スプラ募集'
                )
                .setDescription(
                    `**募集種類**\n` +
                    `${recruitment.type}\n\n` +

                    `**募集内容**\n` +
                    `${recruitment.content}\n\n` +

                    `**人数**\n` +
                    `${recruitment.participants.length}/${recruitment.maxPlayers}\n\n` +

                    `**開始時刻**\n` +
                    `${startText}\n\n` +

                    `**終了時刻**\n` +
                    `${endText}\n\n` +

                    `**主催者**\n` +
                    `<@${recruitment.hostId}>\n\n` +

                    `**参加者**\n` +
                    `${participantMentions || 'なし'}\n\n` +

                    `**状態**\n` +
                    `${statusText}`
                )
                .setFooter({
                    text:
                        `募集ID: ${recruitment.id}`
                });


        const buttons =
            new ActionRowBuilder()
                .addComponents(

                    new ButtonBuilder()
                        .setCustomId(
                            `join_${recruitment.id}`
                        )
                        .setLabel('参加')
                        .setStyle(
                            ButtonStyle.Success
                        )
                        .setDisabled(
                            recruitment.closed ||
                            recruitment.started ||
                            recruitment.participants.length >=
                                recruitment.maxPlayers
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `leave_${recruitment.id}`
                        )
                        .setLabel('退出')
                        .setStyle(
                            ButtonStyle.Secondary
                        )
                        .setDisabled(
                            recruitment.closed ||
                            recruitment.started
                        ),

                    new ButtonBuilder()
                        .setCustomId(
                            `end_${recruitment.id}`
                        )
                        .setLabel('募集終了')
                        .setStyle(
                            ButtonStyle.Danger
                        )
                        .setDisabled(
                            recruitment.closed
                        )
                );


        await message.edit({

            embeds: [
                embed
            ],

            components: [
                buttons
            ]

        });

    } catch (error) {

        console.error(
            '募集メッセージ更新エラー:',
            error
        );
    }
}


// ==============================
// 募集終了
// ==============================

async function closeRecruitment(
    recruitment,
    reason = '募集終了'
) {

    if (recruitment.closed) {
        return;
    }

    recruitment.closed = true;

    try {

        const channel =
            await client.channels.fetch(
                recruitment.channelId
            );

        if (!channel) return;

        const message =
            await channel.messages.fetch(
                recruitment.messageId
            );

        if (!message) return;


        const participantMentions =
            recruitment.participants
                .map(
                    id => `<@${id}>`
                )
                .join(' ');


        const startText =
            `<t:${Math.floor(
                recruitment.startTime.getTime() / 1000
            )}:F>`;


        const endText =
            `<t:${Math.floor(
                recruitment.endTime.getTime() / 1000
            )}:F>`;


        const embed =
            new EmbedBuilder()
                .setTitle(
                    '🔒 スプラ募集終了'
                )
                .setDescription(
                    `**募集種類**\n` +
                    `${recruitment.type}\n\n` +

                    `**募集内容**\n` +
                    `${recruitment.content}\n\n` +

                    `**人数**\n` +
                    `${recruitment.participants.length}/${recruitment.maxPlayers}\n\n` +

                    `**開始時刻**\n` +
                    `${startText}\n\n` +

                    `**終了時刻**\n` +
                    `${endText}\n\n` +

                    `**主催者**\n` +
                    `<@${recruitment.hostId}>\n\n` +

                    `**参加者**\n` +
                    `${participantMentions || 'なし'}\n\n` +

                    `**終了理由**\n` +
                    `${reason}`
                )
                .setFooter({
                    text:
                        `募集ID: ${recruitment.id}`
                });


        await message.edit({

            embeds: [
                embed
            ],

            components: []

        });

    } catch (error) {

        console.error(
            '募集終了エラー:',
            error
        );
    }
}


// ==============================
// 開始処理
// ==============================

async function startRecruitment(
    recruitment
) {

    if (
        recruitment.closed ||
        recruitment.started
    ) {
        return;
    }

    recruitment.started = true;

    await updateRecruitmentMessage(
        recruitment
    );

    console.log(
        `募集 ${recruitment.id} が開始しました`
    );
}


// ==============================
// タイマー
// ==============================

function setupRecruitmentTimers(
    recruitment
) {

    const startDelay =
        recruitment.startTime.getTime() -
        Date.now();

    const endDelay =
        recruitment.endTime.getTime() -
        Date.now();


    if (startDelay <= 0) {

        startRecruitment(
            recruitment
        );

    } else {

        setTimeout(
            () => {

                startRecruitment(
                    recruitment
                );

            },
            startDelay
        );
    }


    if (endDelay > 0) {

        setTimeout(
            () => {

                closeRecruitment(
                    recruitment,
                    '設定した終了時刻になりました'
                );

            },
            endDelay
        );
    }
}


// ==============================
// 募集作成
// ==============================

async function createRecruitment(
    interaction,
    data
) {

    const {
        type,
        content,
        maxPlayers,
        startTime,
        endTime,
        roleIds
    } = data;


    const recruitmentId =
        `${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;


    const recruitment = {

        id:
            recruitmentId,

        guildId:
            interaction.guildId,

        channelId:
            interaction.channelId,

        messageId:
            null,

        hostId:
            interaction.user.id,

        type,

        content,

        maxPlayers,

        startTime,

        endTime,

        roleIds,

        participants: [
            interaction.user.id
        ],

        closed:
            false,

        started:
            false
    };


    recruitments.set(
        recruitmentId,
        recruitment
    );


    // ロールがあればロール、
    // なければ @everyone
    const roleMentions =
        roleIds.length > 0
            ? roleIds
                .map(
                    id => `<@&${id}>`
                )
                .join(' ')
            : '@everyone';


    const startText =
        `<t:${Math.floor(
            startTime.getTime() / 1000
        )}:F>`;


    const endText =
        `<t:${Math.floor(
            endTime.getTime() / 1000
        )}:F>`;


    const embed =
        new EmbedBuilder()
            .setTitle(
                '🎮 スプラ募集'
            )
            .setDescription(

                `**募集種類**\n` +
                `${type}\n\n` +

                `**募集内容**\n` +
                `${content}\n\n` +

                `**人数**\n` +
                `1/${maxPlayers}\n\n` +

                `**開始時刻**\n` +
                `${startText}\n\n` +

                `**終了時刻**\n` +
                `${endText}\n\n` +

                `**主催者**\n` +
                `<@${interaction.user.id}>\n\n` +

                `**参加者**\n` +
                `<@${interaction.user.id}>\n\n` +

                `**状態**\n` +
                `🟢 募集中`
            )
            .setFooter({
                text:
                    `募集ID: ${recruitmentId}`
            });


    const buttons =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `join_${recruitmentId}`
                    )
                    .setLabel('参加')
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `leave_${recruitmentId}`
                    )
                    .setLabel('退出')
                    .setStyle(
                        ButtonStyle.Secondary
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `end_${recruitmentId}`
                    )
                    .setLabel('募集終了')
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );


    const message =
        await interaction.channel.send({

            content:
                roleMentions,

            embeds: [
                embed
            ],

            components: [
                buttons
            ],

            allowedMentions: {

                parse:
                    roleIds.length > 0
                        ? ['roles']
                        : ['everyone']

            }

        });


    recruitment.messageId =
        message.id;


    setupRecruitmentTimers(
        recruitment
    );
}


// ==============================
// Bot起動
// ==============================

client.once(
    'ready',
    async () => {

        console.log(
            `${client.user.tag} でログインしました！`
        );


        // 現在使うコマンド
        const commands = [

            new SlashCommandBuilder()
                .setName('募集')
                .setDescription(
                    'スプラの募集を作成します'
                )

        ];


        try {

            // ==========================
            // 古いグローバルコマンドを削除
            // ==========================

            await client.application.commands.set(
                []
            );


            // ==========================
            // 各サーバーの古いコマンドを削除
            // その後、最新版だけ登録
            // ==========================

            for (
                const guild
                of client.guilds.cache.values()
            ) {

                await guild.commands.set(
                    commands
                );

                console.log(
                    `サーバー「${guild.name}」のコマンドを更新しました`
                );
            }


            console.log(
                'スラッシュコマンドを同期しました！'
            );

        } catch (error) {

            console.error(
                'コマンド同期エラー:',
                error
            );
        }
    }
);


// ==============================
// インタラクション
// ==============================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            // ==========================
            // /募集
            // ==========================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === '募集'
            ) {

                const modal =
                    new ModalBuilder()
                        .setCustomId(
                            'recruitment_modal'
                        )
                        .setTitle(
                            'スプラ募集'
                        );


                // 募集種類
                const typeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_type'
                        )
                        .setLabel(
                            '募集種類'
                        )
                        .setPlaceholder(
                            '例：オープン募集、プラベ募集、イベントマッチ'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true)
                        .setMaxLength(100);


                // 募集内容
                const contentInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_content'
                        )
                        .setLabel(
                            '募集内容'
                        )
                        .setPlaceholder(
                            '例：武器ランダムプラベ、ガチプ、ゆるく遊びます'
                        )
                        .setStyle(
                            TextInputStyle.Paragraph
                        )
                        .setRequired(true)
                        .setMaxLength(1000);


                // 人数
                const playersInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_players'
                        )
                        .setLabel(
                            '募集人数'
                        )
                        .setPlaceholder(
                            '2〜8'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);


                // 開始時刻
                const startTimeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_start_time'
                        )
                        .setLabel(
                            '開始時刻'
                        )
                        .setPlaceholder(
                            '例：22:00 または 2026/09/26 22:00'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);


                // 終了時刻
                const endTimeInput =
                    new TextInputBuilder()
                        .setCustomId(
                            'recruitment_end_time'
                        )
                        .setLabel(
                            '終了時刻'
                        )
                        .setPlaceholder(
                            '例：23:00 または 2026/09/26 23:00'
                        )
                        .setStyle(
                            TextInputStyle.Short
                        )
                        .setRequired(true);


                modal.addComponents(

                    new ActionRowBuilder()
                        .addComponents(
                            typeInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            contentInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            playersInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            startTimeInput
                        ),

                    new ActionRowBuilder()
                        .addComponents(
                            endTimeInput
                        )

                );


                await interaction.showModal(
                    modal
                );

                return;
            }


            // ==========================
            // モーダル送信
            // ==========================

            if (
                interaction.isModalSubmit() &&
                interaction.customId ===
                    'recruitment_modal'
            ) {

                const type =
                    interaction.fields.getTextInputValue(
                        'recruitment_type'
                    );


                const content =
                    interaction.fields.getTextInputValue(
                        'recruitment_content'
                    );


                const playersText =
                    interaction.fields.getTextInputValue(
                        'recruitment_players'
                    );


                const startTimeText =
                    interaction.fields.getTextInputValue(
                        'recruitment_start_time'
                    );


                const endTimeText =
                    interaction.fields.getTextInputValue(
                        'recruitment_end_time'
                    );


                const maxPlayers =
                    Number(playersText);


                if (
                    !Number.isInteger(
                        maxPlayers
                    ) ||
                    maxPlayers < 2 ||
                    maxPlayers > 8
                ) {

                    await interaction.reply({

                        content:
                            '❌ 募集人数は2〜8人で指定してください。',

                        ephemeral:
                            true

                    });

                    return;
                }


                const startTime =
                    parseTime(
                        startTimeText
                    );


                if (!startTime) {

                    await interaction.reply({

                        content:
                            '❌ 開始時刻の形式が正しくありません。\n例：22:00',

                        ephemeral:
                            true

                    });

                    return;
                }


                const endTime =
                    parseEndTime(
                        endTimeText,
                        startTime
                    );


                if (!endTime) {

                    await interaction.reply({

                        content:
                            '❌ 終了時刻の形式が正しくありません。\n例：23:00',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (
                    endTime <= startTime
                ) {

                    await interaction.reply({

                        content:
                            '❌ 終了時刻は開始時刻より後にしてください。',

                        ephemeral:
                            true

                    });

                    return;
                }


                // ==========================
                // ロール選択
                // ==========================

                const roleSelect =
                    new RoleSelectMenuBuilder()
                        .setCustomId(
                            `recruitment_roles_${interaction.user.id}`
                        )
                        .setPlaceholder(
                            '参加条件にするロールを選択'
                        )
                        .setMinValues(1)
                        .setMaxValues(10);


                const roleRow =
                    new ActionRowBuilder()
                        .addComponents(
                            roleSelect
                        );


                // ==========================
                // 全員ボタン
                // ==========================

                const everyoneButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `recruitment_everyone_${interaction.user.id}`
                        )
                        .setLabel(
                            '全員'
                        )
                        .setStyle(
                            ButtonStyle.Primary
                        );


                const everyoneRow =
                    new ActionRowBuilder()
                        .addComponents(
                            everyoneButton
                        );


                // 募集データを一時保存
                interaction.client
                    .recruitmentDrafts
                    .set(
                        interaction.user.id,
                        {
                            type,
                            content,
                            maxPlayers,
                            startTime,
                            endTime
                        }
                    );


                await interaction.reply({

                    content:
                        '参加条件を選択してください。\n' +
                        'ロールを指定する場合は上から選択、全員で募集する場合は「全員」を押してください。',

                    components: [
                        roleRow,
                        everyoneRow
                    ],

                    ephemeral:
                        true

                });

                return;
            }


            // ==========================
            // 全員ボタン
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'recruitment_everyone_'
                )
            ) {

                const userId =
                    interaction.customId.replace(
                        'recruitment_everyone_',
                        ''
                    );


                if (
                    interaction.user.id !==
                    userId
                ) {
                    return;
                }


                const draft =
                    interaction.client
                        .recruitmentDrafts
                        .get(userId);


                if (!draft) {

                    await interaction.update({

                        content:
                            '❌ 募集情報の有効期限が切れています。もう一度 /募集 を実行してください。',

                        components: []

                    });

                    return;
                }


                await interaction.update({

                    content:
                        '✅ 募集を作成しています...',

                    components: []

                });


                await createRecruitment(

                    interaction,

                    {
                        ...draft,

                        roleIds: []

                    }

                );


                interaction.client
                    .recruitmentDrafts
                    .delete(userId);


                await interaction.editReply({

                    content:
                        '✅ 募集を作成しました！',

                    components: []

                });


                return;
            }


            // ==========================
            // ロール選択
            // ==========================

            if (
                interaction.isRoleSelectMenu() &&
                interaction.customId.startsWith(
                    'recruitment_roles_'
                )
            ) {

                const userId =
                    interaction.customId.replace(
                        'recruitment_roles_',
                        ''
                    );


                if (
                    interaction.user.id !==
                    userId
                ) {
                    return;
                }


                const draft =
                    interaction.client
                        .recruitmentDrafts
                        .get(userId);


                if (!draft) {

                    await interaction.update({

                        content:
                            '❌ 募集情報の有効期限が切れています。もう一度 /募集 を実行してください。',

                        components: []

                    });

                    return;
                }


                const roleIds =
                    interaction.values;


                await interaction.update({

                    content:
                        '✅ 募集を作成しています...',

                    components: []

                });


                await createRecruitment(

                    interaction,

                    {
                        ...draft,

                        roleIds

                    }

                );


                interaction.client
                    .recruitmentDrafts
                    .delete(userId);


                await interaction.editReply({

                    content:
                        '✅ 募集を作成しました！',

                    components: []

                });


                return;
            }


            // ==========================
            // 参加
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'join_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'join_',
                        ''
                    );


                const recruitment =
                    recruitments.get(id);


                if (!recruitment) {

                    await interaction.reply({

                        content:
                            '❌ この募集は見つかりません。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (recruitment.closed) {

                    await interaction.reply({

                        content:
                            '❌ この募集は終了しています。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (recruitment.started) {

                    await interaction.reply({

                        content:
                            '❌ この募集はすでに開始されています。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (
                    recruitment.participants
                        .includes(
                            interaction.user.id
                        )
                ) {

                    await interaction.reply({

                        content:
                            '❌ すでに参加しています。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (
                    recruitment.participants.length >=
                    recruitment.maxPlayers
                ) {

                    await interaction.reply({

                        content:
                            '❌ 定員に達しています。',

                        ephemeral:
                            true

                    });

                    return;
                }


                // ==========================
                // ロール条件
                // ==========================

                if (
                    recruitment.roleIds.length > 0
                ) {

                    const member =
                        await interaction.guild
                            .members
                            .fetch(
                                interaction.user.id
                            );


                    const hasRole =
                        recruitment.roleIds
                            .some(
                                roleId =>
                                    member.roles.cache
                                        .has(
                                            roleId
                                        )
                            );


                    if (!hasRole) {

                        await interaction.reply({

                            content:
                                '❌ この募集に参加するためのロールを持っていません。',

                            ephemeral:
                                true

                        });

                        return;
                    }
                }


                recruitment.participants.push(
                    interaction.user.id
                );


                await interaction.deferUpdate();


                if (
                    recruitment.participants.length >=
                    recruitment.maxPlayers
                ) {

                    await closeRecruitment(
                        recruitment,
                        '定員に達しました'
                    );

                } else {

                    await updateRecruitmentMessage(
                        recruitment
                    );
                }


                return;
            }


            // ==========================
            // 退出
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'leave_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'leave_',
                        ''
                    );


                const recruitment =
                    recruitments.get(id);


                if (!recruitment) {

                    await interaction.reply({

                        content:
                            '❌ この募集は見つかりません。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (recruitment.closed) {

                    await interaction.reply({

                        content:
                            '❌ この募集は終了しています。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (recruitment.started) {

                    await interaction.reply({

                        content:
                            '❌ 開始後は退出できません。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (
                    interaction.user.id ===
                    recruitment.hostId
                ) {

                    await interaction.reply({

                        content:
                            '❌ 主催者は退出できません。終了する場合は「募集終了」を押してください。',

                        ephemeral:
                            true

                    });

                    return;
                }


                const index =
                    recruitment.participants
                        .indexOf(
                            interaction.user.id
                        );


                if (index === -1) {

                    await interaction.reply({

                        content:
                            '❌ 参加していません。',

                        ephemeral:
                            true

                    });

                    return;
                }


                recruitment.participants
                    .splice(
                        index,
                        1
                    );


                await interaction.deferUpdate();


                await updateRecruitmentMessage(
                    recruitment
                );


                return;
            }


            // ==========================
            // 募集終了
            // ==========================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'end_'
                )
            ) {

                const id =
                    interaction.customId.replace(
                        'end_',
                        ''
                    );


                const recruitment =
                    recruitments.get(id);


                if (!recruitment) {

                    await interaction.reply({

                        content:
                            '❌ この募集は見つかりません。',

                        ephemeral:
                            true

                    });

                    return;
                }


                if (
                    interaction.user.id !==
                    recruitment.hostId
                ) {

                    await interaction.reply({

                        content:
                            '❌ 募集を終了できるのは主催者だけです。',

                        ephemeral:
                            true

                    });

                    return;
                }


                await interaction.deferUpdate();


                await closeRecruitment(

                    recruitment,

                    '主催者が募集を終了しました'

                );


                return;
            }

        } catch (error) {

            console.error(
                'Interaction Error:',
                error
            );


            if (
                !interaction.replied &&
                !interaction.deferred
            ) {

                await interaction.reply({

                    content:
                        '❌ エラーが発生しました。',

                    ephemeral:
                        true

                }).catch(
                    () => {}
                );
            }
        }
    }
);


// ==============================
// Token確認
// ==============================

if (!TOKEN) {

    console.error(
        '❌ DISCORD_TOKEN が設定されていません。'
    );

    process.exit(1);
}


// ==============================
// ログイン
// ==============================

client.login(
    TOKEN
);
