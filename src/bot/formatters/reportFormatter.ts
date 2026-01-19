export const splitMessage = (text: string, limit = 4000): string[] => {
  if (text.length <= limit) {
    return [text];
  }

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit) {
      if (current) {
        chunks.push(current);
        current = line;
      } else {
        chunks.push(line.slice(0, limit));
        current = line.slice(limit);
      }
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};
