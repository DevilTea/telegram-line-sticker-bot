const request = require('request')
const unzipper = require('unzipper')
const resizeStaticStickerImage = require('./resizeStaticStickerImage')

async function getLineStaticStickerPack (stickerId) {
  const directory = await unzipper.Open.url(request, `https://sdl-stickershop.line.naver.jp/stickershop/v1/product/${stickerId}/iphone/stickers@2x.zip`)
    .catch(_ => {
      throw Error('Sticker Pack Not Found')
    })
  const meta = JSON.parse(await (await directory.files.find(file => file.path.endsWith('.meta')).buffer()).toString())
  // const packImage = await directory.files.find(file => file.path.startsWith('tab_on')).buffer()
  const stickerImages = await Promise.all(directory.files.filter(file => {
    const path = file.path
    return path.endsWith('.png') && !path.includes('_key') && !path.startsWith('tab_')
  }).map(file => {
    return file.buffer()
      .then(buffer => resizeStaticStickerImage(buffer))
      .catch(error => {
        // console.log(file.path)
        throw error
      })
  }))

  return {
    title: meta.title,
    author: meta.author,
    stickerImages
  }
}

module.exports = getLineStaticStickerPack
