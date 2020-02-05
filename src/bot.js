const TelegramBot = require('node-telegram-bot-api')
const { token, ownerUserId, ownerUsername, maxSizeOfTaskQueue, userIdWhiteList } = require('../config.json')
const utils = require('./utils')

class Bot {
  constructor (token) {
    this._bot = new TelegramBot(token)
    this._userId = null
    this._username = null
    this._pending = {}
  }

  async startPolling () {
    await this._initInfo()
    this._startHandlingHelpRequests()
    this._startHandlingStaticStickerRequests()
    this._bot.startPolling()
      .catch(error => {
        console.log(error)
      })
  }

  async _initInfo () {
    if (this._userId && this._username) {
      return
    }
    const info = await this._bot.getMe()
      .catch(error => {
        console.log(error)
      })
    this._userId = info.id
    this._username = info.username
  }

  async _sendEditableMessage (chatId, text, options) {
    const { message_id: messageId } = await this._bot.sendMessage(chatId, text, options)
      .catch(error => {
        console.log(error)
      })
    return (newText) => {
      return this._bot.editMessageText(newText, {
        chat_id: chatId,
        message_id: messageId
      })
        .catch(error => {
          console.log(error)
        })
    }
  }

  _startHandlingHelpRequests () {
    this._bot.onText(/\/(help)|(start)/, async msg => {
      const chatId = msg.chat.id
      const helpMessage = [
        `Hi！這裡是 @${this._username}`,
        '讓我來幫助你移植 Line 貼圖吧！\n',
        '這裡是目前可以使用的指令：',
        '　　/help',
        '　　　　查看幫助說明\n',
        '　　/static <靜態貼圖 ID>',
        '　　　　開始移植靜態貼圖包',
        '　　　　ex: /static 10589812',
        '　　　　完成後會將該貼圖傳送給你ㄛ！\n',
        '這個只是個人使用加上當個 side project 請低調使用ＯＡＯ',
        '未來會加入白名單功能限定特定使用者使用～'
      ].join('\n')
      await this._bot.sendMessage(chatId, helpMessage)
    })
  }

  _startHandlingStaticStickerRequests () {
    this._bot.onText(/\/static (\d+)/, async (msg, match) => {
      const chatId = msg.chat.id
      const requestUserId = msg.from.id
      const requestMessageId = msg.message_id
      const staticStickerId = match[1]
      if (requestUserId !== ownerUserId && !userIdWhiteList.includes(requestUserId)) {
        await this._bot.sendMessage(chatId, `你不在此機器人的使用者白名單內喔！\n有需要的話請聯絡 @${ownerUsername}`)
        return
      } else if (this._pending[requestUserId]) {
        await this._bot.sendMessage(chatId, '一次只能進行一個貼圖包移植的動作喔！')
        return
      } else if (Object.keys(this._pending).length >= maxSizeOfTaskQueue) {
        await this._bot.sendMessage(chatId, '目前使用人數過多！請稍後再試')
        return
      }
      this._pending[requestUserId] = true
      await this._handleStaticStickerRequest(chatId, requestMessageId, staticStickerId)
      delete this._pending[requestUserId]
    })
  }

  async _handleStaticStickerRequest (chatId, requestMessageId, staticStickerId) {
    const updateEditableMessage = await this._sendEditableMessage(chatId, '收到你的靜態貼圖包移植需求！', {
      reply_to_message_id: requestMessageId
    })
    try {
      const zipUrl = utils.getStaticStickerZipUrl(staticStickerId)
      const zipDirectory = await utils.openZipByUrl(zipUrl)
        .catch(error => {
          console.log(error)
          updateEditableMessage(`移植失敗：找不到該靜態貼圖包檔案！\n\n嘗試移植的靜態貼圖包 ID 為：${staticStickerId}`)
          throw new Error('Interrupt')
        })
      const meta = await utils.fetchMeta(zipDirectory)
        .catch(error => {
          console.log(error)
          updateEditableMessage(`移植失敗：無法解析該靜態貼圖包資訊！\n\n嘗試移植的靜態貼圖包 ID 為：${staticStickerId}`)
          throw new Error('Interrupt')
        })
      if (meta.hasAnimation) {
        await updateEditableMessage('目前尚未支援"動態貼圖包"移植，敬請期待！')
        return
      } else if (meta.stickerResourceType && meta.stickerResourceType === 'NAME_TEXT') {
        await updateEditableMessage('目前尚未支援"隨你填貼圖包"移植，敬請期待！')
        return
      }
      const stickerSetName = `static_${staticStickerId}_by_${this._username}`
      const stickerSetTitle = `${meta.title['zh-Hant'] || meta.title.en}`
      let stickerSet = await this._bot.getStickerSet(stickerSetName).catch(_ => null)
      if (!stickerSet) {
        const stickerImageFiles = utils.filterStaticStickerImageFiles(zipDirectory)
        const stickerSetCreatingTasks = stickerImageFiles.map((file, index) => {
          const task = async () => {
            await updateEditableMessage(`靜態貼圖包 "${stickerSetTitle}" 移植中 (${index}/${stickerImageFiles.length})`)
            let imageBuffer = await file.buffer()
              .catch(async error => {
                console.log(error)
                await updateEditableMessage(`移植失敗：無法正確取得靜態貼圖！\n\n嘗試移植的靜態貼圖包 ID 為：${staticStickerId}\n失敗的貼圖檔案為：${file.path}`)
                throw new Error('Interrupt')
              })
            imageBuffer = await utils.resizePNG(imageBuffer)
              .catch(async error => {
                console.log(error)
                await updateEditableMessage(`移植失敗：無法正確調整靜態貼圖大小！\n\n嘗試移植的靜態貼圖包 ID 為：${staticStickerId}\n失敗的貼圖檔案為：${file.path}`)
                throw new Error('Interrupt')
              })
            if (index === 0) {
              await this._bot.createNewStickerSet(ownerUserId, stickerSetName, stickerSetTitle, imageBuffer, '👿')
            } else {
              await this._bot.addStickerToSet(ownerUserId, stickerSetName, imageBuffer, '👿')
            }
          }
          return task
        })
        while (stickerSetCreatingTasks.length) {
          const task = stickerSetCreatingTasks.shift()
          await task()
        }
        stickerSet = await this._bot.getStickerSet(stickerSetName).catch(_ => null)
        await updateEditableMessage(`靜態貼圖 "${stickerSetTitle}" 移植完成！`)
      } else {
        await updateEditableMessage(`靜態貼圖 "${stickerSetTitle}" 已經移植過囉！`)
      }

      const stickerToSend = stickerSet.stickers[0].file_id
      await this._bot.sendSticker(chatId, stickerToSend, {
        reply_to_message_id: requestMessageId
      })
    } catch (error) {
      if (error.message && error.message === 'Interrupt') {
        return
      }
      console.log(error)
      await updateEditableMessage(`移植失敗：未知錯誤！\n${error.message ? `\n${error.message}\n` : ''}\n請回報給 @${ownerUsername}\n\n嘗試移植的靜態貼圖包 ID 為：${staticStickerId}`)
    }
  }
}

module.exports = new Bot(token)
