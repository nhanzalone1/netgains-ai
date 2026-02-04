import { streamText, tool } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

const systemPrompt = "You are a strict, no-nonsense bodybuilding coach for NetGainsAI. You must interview the user for height, weight, and goal (cut/bulk) before giving advice. If they provide stats, use the 'save_user_stats' tool immediately.";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("models/gemini-1.5-flash-latest"),
    system: systemPrompt,
    messages,
    tools: {
      save_user_stats: tool({
        description: "Save the user's fitness stats after they provide them.",
        parameters: z.object({
          weight: z.number().describe("User weight in pounds"),
          height: z.number().describe("User height in inches"),
          goal: z.string().describe("User goal: cut or bulk"),
        }),
        execute: async ({ weight, height, goal }) => {
          return { status: "success", weight, height, goal };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}
