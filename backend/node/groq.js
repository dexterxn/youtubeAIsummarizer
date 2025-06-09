import 'dotenv/config'; // Load environment variables
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function main(vidTranscript) {
  return await getGroqChatCompletion(vidTranscript);
}

export async function getGroqChatCompletion(vidTranscript) {
  return groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Summarize the following YouTube video transcript in clear, 
        fluent English. The summary should be in the format:
        - emoji bullet points 
        must capture the main points and key takeaways from the video. 
        Do not include any extraneous details or commentary. If the transcript is 
        not in English, translate and summarize it in English only.
                  ${vidTranscript}`,
      },
    ],
    model: "llama-3.3-70b-versatile",
  });
}
