// server.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { main } from './groq.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Allow CORS for Chrome extensions
app.use(cors({
  origin: [
    'chrome-extension://iahjhgmaapcelagfaeoigialomhdeamo',
    'http://localhost:3000'
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
 
app.use(bodyParser.json());
app.use(express.static('.'));

app.post('/api/summarize', async (req, res) => {
  const vidTranscript = req.body.transcript;
  try {
    const result = await main(vidTranscript);
    const summary = result.choices[0]?.message?.content || "No summary available.";
    res.json({ summary });
  } catch (error) {
    console.error('Error summarizing video:', error);
    res.status(500).json({ summary: 'Failed to summarize video.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
