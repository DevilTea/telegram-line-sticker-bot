export type SourceType = 'sticker' | 'emoji'

export type StickerMeta = {
  title: Record<string, string>;
  author: Record<string, string>;
  stickers: { id: string; }[];
}

export type StickerPack = {
  title: string;
  author: string;
  stickerFilenameList: string[];
}

export type RequestTaskInfo = {
  userId: number;
  chatId: number;
  requestMessageId: number;
  stickerId: string;
}

export type TaskInfo = RequestTaskInfo & {
  responseMessageId: number;
}

export type Task = {
  info: TaskInfo;
  exec: (info: TaskInfo) => Promise<void>;
}

export type TaskErrorReason = {
  message: |
    'Unknown sticker id' |
    "Failed to get sticker's zip buffer" |
    'Failed to save sticker zip file' |
    'Failed to extract sticker zip' |
    'Failed to load sicker pack'
  error: Error;
}

export type TaskEvents = {
  error: TaskErrorReason;
}
