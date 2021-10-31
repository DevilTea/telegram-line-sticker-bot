import { Telegraf } from 'telegraf'
import { setupWorkspace, getStickerIdList } from './logic'
import { TaskCenter } from './task-center'

async function run () {
  const token = process.env.BOT_TOKEN!

  const bot = new Telegraf(token)
  const taskCenter = new TaskCenter(bot)

  bot.command('start', (ctx) => {
    ctx.reply([
      'Hi, 轉起來ㄅ',
      '------------',
      '目前只支援：一般貼圖、靜態的動態貼圖',
      'ＱＡＱ'
    ].join('\n'))
  })

  bot.on('text', async (ctx) => {
    const {
      chat: {
        id: chatId
      },
      from: {
        id: userId
      },
      text: input,
      message_id: requestMessageId
    } = ctx.message

    const stickerIdList = getStickerIdList(input)
    if (stickerIdList.length === 0) {
      await ctx.reply('找不到你傳的訊息中任何疑似貼圖 ID 的部分 ＱＡＱ')
      return
    }
    stickerIdList.forEach(async (stickerId) => {
      await taskCenter.addTask({
        chatId,
        userId,
        requestMessageId,
        stickerId
      })
    })
  })

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))

  await setupWorkspace()

  bot.launch()
}

run()
