const request = require('request')
const unzipper = require('unzipper')
const Jimp = require('jimp')

module.exports = {
  getStaticStickerZipUrl (staticStickerId) {
    return `https://sdl-stickershop.line.naver.jp/stickershop/v1/product/${staticStickerId}/iphone/stickers@2x.zip`
  },

  async openZipByUrl (zipUrl) {
    const zipDirectory = await unzipper.Open.url(request, zipUrl)
      .catch(error => {
        console.log(error)
        throw new Error('找不到指定的項目')
      })
    return zipDirectory
  },

  async fetchMeta (zipDirectory) {
    const metaFile = zipDirectory.files.find(file => file.path.endsWith('.meta'))
    const metaContent = await metaFile.buffer()
    const meta = JSON.parse(metaContent)
    return meta
  },

  filterStaticStickerImageFiles (zipDirectory) {
    const stickerImageFiles = zipDirectory.files.filter(file => {
      const path = file.path
      return path.endsWith('.png') && !path.includes('_key') && !path.startsWith('tab_')
    })
    return stickerImageFiles
  },

  async resizePNG (imageBuffer) {
    const buffer = (await Jimp.read(imageBuffer))
      .contain(512, 512)
      .getBufferAsync(Jimp.MIME_PNG)
    return buffer
  }
}
