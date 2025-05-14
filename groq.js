import 'dotenv/config'; // Load environment variables
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function main(vidTranscript) {
  return await getGroqChatCompletion(vidTranscript);
}

export async function getGroqChatCompletion(vidTranscript) {
  console.log("vid Tanscript:", vidTranscript)
  return groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `${vidTranscript} summarize it pls`,
      },
    ],
    model: "gemma2-9b-it",
  });
}
