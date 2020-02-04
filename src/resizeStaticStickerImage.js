const jimp = require('jimp')

async function resizeStaticStickerImage (imageBuffer) {
  const image = await jimp.read(imageBuffer)
  return image.contain(512, 512).getBufferAsync(jimp.MIME_PNG)
}

module.exports = resizeStaticStickerImage
