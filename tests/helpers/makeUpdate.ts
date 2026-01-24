export const makeUser = (id: number, overrides?: Partial<{ username: string; first_name: string; last_name: string }>) => ({
  id,
  is_bot: false,
  first_name: overrides?.first_name ?? `User${id}`,
  last_name: overrides?.last_name ?? "Test",
  username: overrides?.username
});

export const makeChat = (id: number) => ({
  id,
  type: "private"
});

const makeCommandEntities = (text: string) => {
  if (!text.startsWith("/")) {
    return undefined;
  }
  const commandPart = text.split(/\s+/)[0] ?? text;
  return [{ offset: 0, length: commandPart.length, type: "bot_command" as const }];
};

export const makeTextUpdate = (params: {
  updateId: number;
  chatId: number;
  fromId: number;
  text: string;
  messageId?: number;
  date?: number;
}) => ({
  update_id: params.updateId,
  message: {
    message_id: params.messageId ?? params.updateId,
    date: params.date ?? Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000),
    chat: makeChat(params.chatId),
    from: makeUser(params.fromId),
    text: params.text,
    entities: makeCommandEntities(params.text)
  }
});

export const makePhotoUpdate = (params: {
  updateId: number;
  chatId: number;
  fromId: number;
  fileId?: string;
  messageId?: number;
  date?: number;
}) => ({
  update_id: params.updateId,
  message: {
    message_id: params.messageId ?? params.updateId,
    date: params.date ?? Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000),
    chat: makeChat(params.chatId),
    from: makeUser(params.fromId),
    photo: [
      {
        file_id: params.fileId ?? `photo-${params.updateId}`,
        file_unique_id: `uniq-${params.updateId}`,
        width: 640,
        height: 480,
        file_size: 12345
      }
    ]
  }
});

export const makeCallbackUpdate = (params: {
  updateId: number;
  chatId: number;
  fromId: number;
  data: string;
  messageId?: number;
  date?: number;
}) => ({
  update_id: params.updateId,
  callback_query: {
    id: `cb-${params.updateId}`,
    from: makeUser(params.fromId),
    message: {
      message_id: params.messageId ?? params.updateId,
      date: params.date ?? Math.floor(new Date("2024-01-01T00:00:00Z").getTime() / 1000),
      chat: makeChat(params.chatId)
    },
    data: params.data
  }
});
