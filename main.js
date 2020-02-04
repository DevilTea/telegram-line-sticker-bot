const TelegramBot = require('node-telegram-bot-api')
const getLineStaticStickerPack = require('./src/getLineStaticStickerPack')
const config = require('./config.json')
const bot = new TelegramBot(config.token)

function getStaticStickerSetName (staticStickerId) {
  return `wasay_${Date.now()}_static_${staticStickerId}_by_DevilLineStickerBot`
}

function sendHelpMessage (chatId) {
  return bot.sendMessage(chatId, '需要幫助嗎？目前提供以下的指令喔！\n\n/static <Line 靜態貼圖 ID></Line> - 取得 Line 靜態貼圖')
}

bot.onText(/\/static (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id
  try {
    const staticStickerId = match[1]
    const staticStickerName = getStaticStickerSetName(staticStickerId)
    const { message_id: messageId } = await bot.sendMessage(chatId, '開始搬運...')
    const stickerPack = await getLineStaticStickerPack(staticStickerId)
    const numOftickers = stickerPack.stickerImages.length
    await bot.editMessageText(`貼圖 "${stickerPack.title['zh-Hant'] || stickerPack.title.en}" 上傳進度 (${numOftickers - stickerPack.stickerImages.length}/${numOftickers})`, {
      chat_id: chatId,
      message_id: messageId
    })
    const title = `${stickerPack.title['zh-Hant'] || stickerPack.title.en} (authored by ${stickerPack.author['zh-Hant'] || stickerPack.author.en})`
    await bot.createNewStickerSet(config.userId, staticStickerName, title, stickerPack.stickerImages.shift(), '👿')
    await bot.editMessageText(`貼圖 "${stickerPack.title['zh-Hant'] || stickerPack.title.en}" 上傳進度 (${numOftickers - stickerPack.stickerImages.length}/${numOftickers})`, {
      chat_id: chatId,
      message_id: messageId
    })
    while (stickerPack.stickerImages.length) {
      await bot.addStickerToSet(config.userId, staticStickerName, stickerPack.stickerImages.shift(), '👿')
      await bot.editMessageText(`貼圖 "${stickerPack.title['zh-Hant'] || stickerPack.title.en}" 上傳進度 (${numOftickers - stickerPack.stickerImages.length}/${numOftickers})`, {
        chat_id: chatId,
        message_id: messageId
      })
    }
    const stickerSet = await bot.getStickerSet(staticStickerName).catch(_ => null)
    await bot.editMessageText(`貼圖 "${stickerPack.title['zh-Hant'] || stickerPack.title.en}" 上傳完畢`, {
      chat_id: chatId,
      message_id: messageId
    })
    await bot.sendSticker(chatId, stickerSet.stickers[0].file_id, {
      reply_to_message_id: msg.message_id
    })
  } catch (error) {
    await bot.sendMessage(chatId, error.message, {
      reply_to_message_id: msg.message_id
    })
  }
})

bot.onText(/\/(help)|(start)/, async msg => {
  const chatId = msg.chat.id
  await sendHelpMessage(chatId)
})

bot.startPolling().catch(_ => console.log('error occured'))
