import { ChatBody, Message } from '@/types/chat';
import { DEFAULT_SYSTEM_PROMPT } from '@/utils/app/const';
import { OpenAIStream } from '@/utils/server';
import { parseIdentityInfoFromHeaders } from '@/utils/server/identity';
import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';
import { ChatLogger } from '../../steffes-packages/chat-logger';
// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

export const config = {
  runtime: 'edge',
};

const chatLogger = new ChatLogger();
const handler = async (req: Request): Promise<Response> => {
  try {
    const identityInfo = parseIdentityInfoFromHeaders(req.headers);
    const { model, messages, key, prompt } = (await req.json()) as ChatBody;

    await init((imports) => WebAssembly.instantiate(wasm, imports));
    const encoding = new Tiktoken(
      tiktokenModel.bpe_ranks,
      tiktokenModel.special_tokens,
      tiktokenModel.pat_str,
    );

    const dbContainer = (await chatLogger.containerResponsePromise)?.container;

    let promptToSend = prompt;
    if (!promptToSend) {
      promptToSend = DEFAULT_SYSTEM_PROMPT;
    }

    const prompt_tokens = encoding.encode(promptToSend);

    let tokenCount = prompt_tokens.length;
    let messagesToSend: Message[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      const tokens = encoding.encode(message.content);

      if (tokenCount + tokens.length + 1000 > model.tokenLimit) {
        break;
      }
      tokenCount += tokens.length;
      messagesToSend = [message, ...messagesToSend];
    }

    encoding.free();

    const stream: ReadableStream = await OpenAIStream(
      model,
      promptToSend,
      key,
      messagesToSend,
    );

    const [streamCopyA, streamCopyB] = stream.tee();

    (async () => {
      await dbContainer?.items.create({
        id: crypto.randomUUID(),
        questionAnswerTuple: [
          {
            who: {
              kind: 'user',
              info: identityInfo ? { ...identityInfo } : identityInfo,
            },
            message: messages.at(-1).content,
          },
          {
            who: { kind: 'llm', info: { ...model } },
            message: await readStreamToString(streamCopyA),
          },
        ],
      });
    })();

    return new Response(streamCopyB);
  } catch (error) {
    console.error(error);

    return new Response('Error', { status: 500, statusText: error.message });
  }
};

export default handler;

/** @section Helpers */

async function readStreamToString(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  reader.releaseLock();

  // Concatenate all Uint8Arrays
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const allBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, pos);
    pos += chunk.length;
  }

  // Decode to string
  const decoder = new TextDecoder();
  return decoder.decode(allBytes);
}
