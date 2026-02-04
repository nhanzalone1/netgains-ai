import { google } from "@ai-sdk/google";
import { streamText } from "ai";

export const maxDuration = 30;

const systemPrompt = `You are the NetGains AI Coach. You help with workout splits, exercise substitutions, and nutrition. Give concise, no-nonsense advice. If a user asks about their program, remind them to trust the 8-week cycle.

Key principles:
- Keep responses brief and actionable
- Focus on practical advice for strength training
- Encourage progressive overload and consistency
- For exercise substitutions, suggest movements that target the same muscle groups
- For nutrition, emphasize protein intake and caloric needs for muscle building
- Always promote proper form over heavy weight`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-1.5-flash"),
    system: systemPrompt,
    messages,
  });

  return result.toDataStreamResponse();
}
