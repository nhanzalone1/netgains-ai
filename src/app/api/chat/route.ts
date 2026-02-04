import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  console.log("DEBUG: Final API Key detected:", !!apiKey);

  try {
    const { messages } = await req.json();

    const google = createGoogleGenerativeAI({ apiKey });

    const result = streamText({
      model: google("models/gemini-1.5-flash-latest"),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("DEBUG: Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
