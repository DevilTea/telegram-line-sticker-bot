import fs from 'fs/promises'
import path from 'path'
import axios, { AxiosError } from 'axios'
import sharp from 'sharp'
import extract from 'extract-zip'
import mitt from 'mitt'
import type { Emitter } from 'mitt'
import type { StickerMeta, StickerPack, TaskEvents } from './types'

export function createEmitter () {
  return mitt<TaskEvents>()
}

const WORKSPACE_PATH = path.join(__dirname, '../workspace')

const noop = () => {}

export async function setupWorkspace () {
  await fs.rm(WORKSPACE_PATH, {
    recursive: true,
    force: true
  }).catch(noop)
  await fs.mkdir(WORKSPACE_PATH, {
    recursive: true
  })
}

export function getStickerIdList (input: string, emitter?: Emitter<TaskEvents>) {
  const patterns = [
    /https:\/\/store.line.me\/stickershop\/product\/([0-9]*)/g,
    /https:\/\/line.me\/S\/sticker\/([0-9]*)/g
  ]
  const stickerIdList = [...new Set(
    patterns
      .flatMap((regex) => [...input.matchAll(regex)])
      .map((result) => result[1])
      .filter((value) => value != null) as string[]
  )]
  const fallbackStickerId = (input.length > 0)
    ? input
    : null

  if (stickerIdList.length === 0 && fallbackStickerId != null) {
    stickerIdList.push(fallbackStickerId)
  }

  return stickerIdList
}

async function getSickerZipBuffer (stickerId: string, emitter?: Emitter<TaskEvents>) {
  const { buffer } = await Promise.resolve()
    .then(() => axios.get<Buffer>(
      `https://stickershop.line-scdn.net/stickershop/v1/product/${stickerId}/iphone/stickers@2x.zip`,
      { responseType: 'arraybuffer' }
    ))
    .catch(() => axios.get<Buffer>(
      `https://stickershop.line-scdn.net/stickershop/v1/product/${stickerId}/iphone/stickerpack@2x.zip`,
      { responseType: 'arraybuffer' }
    ))
    .then(({ data }) => ({ buffer: data }))
    .catch((error: AxiosError) => {
      if (error?.response?.status === 404) {
        emitter?.emit('error', 'Unknown sticker id')
      } else {
        emitter?.emit('error', "Failed to get sticker's zip buffer")
      }
      return { buffer: null }
    })

  return buffer
}

/**
 * @returns zipFilename
 */
async function saveStickerZip (stickerId: string, buffer: Buffer, emitter?: Emitter<TaskEvents>) {
  const downloadPath = path.join(WORKSPACE_PATH, 'download', `${stickerId}_${Date.now()}`)
  const zipFilename = path.join(downloadPath, 'sticker.zip')

  await fs.rm(downloadPath, {
    recursive: true,
    force: true
  }).catch(noop)
  await fs.mkdir(downloadPath, {
    recursive: true
  }).catch(noop)

  try {
    await fs.writeFile(zipFilename, buffer)
    return zipFilename
  } catch {
    emitter?.emit('error', 'Failed to save sticker zip file')
    return null
  }
}

/**
 * @returns stickerDirPath
 */
async function extractZipFile (filename: string, emitter?: Emitter<TaskEvents>) {
  const stickerDirPath = filename.replace(/\.zip$/, '')
  return extract(filename, {
    dir: stickerDirPath
  })
    .then(() => {
      return stickerDirPath
    })
    .catch(() => {
      emitter?.emit('error', 'Failed to extract sticker zip')
      return null
    })
}

async function loadStickerPack (stickerDirPath: string, emitter?: Emitter<TaskEvents>) {
  try {
    const metaFilename = path.join(stickerDirPath, 'productInfo.meta')
    const meta = JSON.parse(await fs.readFile(metaFilename, { encoding: 'utf-8' })) as StickerMeta
    const pack: StickerPack = {
      title: meta.title['zh-Hant'] ??
        meta.title.en ??
        Object.values(meta.title).pop() ??
        'Unknown Stickers',
      author: meta.author['zh-Hant'] ??
        meta.author.en ??
        Object.values(meta.author).pop() ??
        'Unknown Stickers',
      stickerFilenameList: meta.stickers.map(({ id }) => path.join(stickerDirPath, `${id}@2x.png`))
    }
    return pack
  } catch {
    emitter?.emit('error', 'Failed to load sicker pack')
    return null
  }
}

export async function prepareUploadStickerPack (stickerId: string, emitter?: Emitter<TaskEvents>) {
  const stickerZipBuffer = await getSickerZipBuffer(stickerId, emitter)
  if (stickerZipBuffer == null) {
    return null
  }

  const zipFilename = await saveStickerZip(stickerId, stickerZipBuffer, emitter)
  if (zipFilename == null) {
    return null
  }

  const stickerDirPath = await extractZipFile(zipFilename, emitter)
  if (stickerDirPath == null) {
    return null
  }

  const stickerPack = await loadStickerPack(stickerDirPath, emitter)
  return stickerPack
}

const IMAGE_SIZE = 512
export async function resizeSickerPng (pngFilename: string) {
  const buffer = await fs.readFile(pngFilename)
  const resizedBuffer = await sharp(buffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: 'inside'
    })
    .toBuffer()
  return resizedBuffer
}

export function progressText (current: number, total: number) {
  const barLength = 16
  const currentLength = Math.floor((current / total) * barLength)
  const restLength = barLength - currentLength
  return [
    `目前進度: ${current}/${total}（${Math.floor(current * 100 / total)}%）`,
    `[${Array.from({ length: currentLength }, () => '+').join('')}${Array.from({ length: restLength }, () => '-').join('')}]`
  ].join('\n')
}
