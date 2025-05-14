import 'dotenv/config'; // Load environment variables
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function main(vidTranscript) {
  return await getGroqChatCompletion(vidTranscript);
}

export async function getGroqChatCompletion(vidTranscript) {
  console.log(vidTranscript);
  return groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `${vidTranscript} summarize it pls`,
      },
    ],
    model: "llama-3.3-70b-versatile",
  });
}
