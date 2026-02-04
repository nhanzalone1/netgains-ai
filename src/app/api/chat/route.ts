import { streamText, createDataStreamResponse } from "ai";
import { google } from "@ai-sdk/google";

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model: google("models/gemini-1.5-flash-latest"),
        messages,
      });
      result.mergeIntoDataStream(dataStream);
    },
  });
}
