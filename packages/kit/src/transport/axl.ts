export interface ProtocolAgentMessage {
  type: 'protocol-agent/task' | 'protocol-agent/reply' | 'protocol-agent/memory' | 'protocol-agent/proof';
  sessionId: string;
  from: string;
  to?: string;
  skill?: string;
  text: string;
  verified?: boolean;
  ts: number;
}

export async function sendProtocolAgentMessage(apiUrl: string, peerId: string, msg: ProtocolAgentMessage): Promise<void> {
  const { AxlClient } = await import('@cortex/core');
  const axl = new AxlClient(apiUrl);
  await axl.send(peerId, msg);
}

export async function currentAxlPeerId(apiUrl: string): Promise<string> {
  const { AxlClient } = await import('@cortex/core');
  const axl = new AxlClient(apiUrl);
  return axl.myPubkey();
}
