export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  chatId: string;
  verified: boolean;
  provider: string;
  model: string;
  raw: unknown;
}

export async function verifiedReason(messages: ChatMsg[]): Promise<ChatResult> {
  const { chat } = await import('@focus-swarm/core');
  const result = await chat(messages);
  if (!result.verified) throw new Error('0G Compute response was not verified');
  return result;
}
