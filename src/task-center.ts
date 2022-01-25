
import type { Telegraf } from 'telegraf'
import type { RequestTaskInfo, TaskInfo, Task, TaskErrorReason } from './types'
import { createEmitter, prepareUploadStickerPack, resizeSickerPng, progressText } from './logic'

const BOT_USERNAME = 'DevilTeaLineStickerBot'

export class TaskCenter {
  #bot: Telegraf
  #waitingQueue: Task[]
  #runningQueue: Task[]

  constructor (bot: Telegraf) {
    this.#bot = bot
    this.#waitingQueue = []
    this.#runningQueue = []
    this.#scheduleTasks()
  }

  public async addTask (requestTaskInfo: RequestTaskInfo) {
    const { chatId, requestMessageId, stickerId } = requestTaskInfo
    const { message_id: responseMessageId } = await this.#bot.telegram.sendMessage(
      chatId,
      `貼圖 ID: ${stickerId}，已經加入任務佇列`,
      {
        reply_to_message_id: requestMessageId
      }
    )

    this.#waitingQueue.push({
      info: {
        ...requestTaskInfo,
        responseMessageId
      },
      exec: async ({
        chatId,
        userId,
        requestMessageId,
        responseMessageId,
        stickerId
      }: TaskInfo) => {
        const updateMessage = (text: string) => this.#bot.telegram.editMessageText(
          chatId,
          responseMessageId,
          undefined,
          text
        )
        await updateMessage(`貼圖 ID: ${stickerId}，開始執行`)
        const emitter = createEmitter()
        const messageMap: Record<TaskErrorReason['message'], string> = {
          'Unknown sticker id': `未知的貼圖 ID: ${stickerId}`,
          "Failed to get sticker's zip buffer": `無法獲得貼圖 zip，貼圖 ID: ${stickerId}`,
          'Failed to save sticker zip file': `無法儲存貼圖 zip，貼圖 ID: ${stickerId}`,
          'Failed to extract sticker zip': `無法解壓縮貼圖 zip，貼圖 ID: ${stickerId}`,
          'Failed to load sicker pack': `無法讀取貼圖資料，貼圖 ID: ${stickerId}`
        }
        emitter.on('error', async (reason) => {
          await updateMessage(`${messageMap[reason.message]}\n\n錯誤訊息：${reason.error}`)
          console.log(`=================================\n錯誤訊息：${reason.error}\n=================================`)
        })
        const stickerPack = await prepareUploadStickerPack(stickerId, emitter)
        if (stickerPack == null) {
          return
        }

        const {
          title,
          author,
          stickerFilenameList
        } = stickerPack

        const [
          stickerSetName,
          stickerSetTitle
        ] = [
          `line_${stickerId}_${Date.now()}_by_${BOT_USERNAME}`,
          `${title} by ${author}`
        ]

        let progress = 0
        for (const stickerFilename of stickerFilenameList) {
          updateMessage([
            `${stickerSetTitle}`,
            '',
            progressText(progress, stickerFilenameList.length)
          ].join('\n'))
          const { file_id: stickerFileId } = await this.#bot.telegram.uploadStickerFile(userId, {
            source: await resizeSickerPng(stickerFilename)
          })
          if (progress === 0) {
            await this.#bot.telegram.createNewStickerSet(
              userId,
              stickerSetName,
              stickerSetTitle,
              {
                png_sticker: stickerFileId,
                emojis: '😈'
              }
            )
          } else {
            await this.#bot.telegram.addStickerToSet(
              userId,
              stickerSetName,
              {
                png_sticker: stickerFileId,
                emojis: '😈'
              }
            )
          }
          progress++
        }

        const stickerSet = await this.#bot.telegram.getStickerSet(stickerSetName)
        const stickerIdToSend = stickerSet.stickers.pop()!.file_id
        await updateMessage([
          `${stickerSetTitle}`,
          '',
          '完成！'
        ].join('\n'))
        await this.#bot.telegram.sendSticker(
          chatId,
          stickerIdToSend,
          {
            reply_to_message_id: requestMessageId
          }
        )
      }
    })
  }

  #scheduleTasks () {
    while (this.#waitingQueue.length > 0 && this.#runningQueue.length <= 5) {
      const task = this.#waitingQueue.shift()!
      this.#runningQueue.push(task)
      const index = this.#runningQueue.indexOf(task)
      task
        .exec(task.info)
        .finally(() => this.#runningQueue.splice(index, 1))
    }
    setTimeout(() => {
      this.#scheduleTasks()
    }, 1000)
  }
}
