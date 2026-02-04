import { streamText } from "ai";
import { google } from "@ai-sdk/google";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("models/gemini-1.5-flash-latest"),
    messages,
  });

  return result.toDataStreamResponse();
}
