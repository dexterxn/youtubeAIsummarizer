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
  console.log('Received transcript request');
  console.log('Transcript length:', vidTranscript?.length || 0, 'characters');
  
  if (!vidTranscript) {
    console.error('No transcript provided in request');
    return res.status(400).json({ 
      error: 'No transcript provided',
      details: 'The request must include a transcript in the request body'
    });
  }

  try {
    console.log('Calling Groq API...');
    const result = await main(vidTranscript);
    console.log('Groq API response received');
    
    if (!result || !result.choices || !result.choices[0]) {
      console.error('Invalid Groq API response:', result);
      return res.status(500).json({ 
        error: 'Invalid response from Groq API',
        details: 'The API returned an unexpected response format'
      });
    }

    const summary = result.choices[0]?.message?.content || "No summary available.";
    console.log('Summary length:', summary.length, 'characters');
    res.json({ summary });
  } catch (error) {
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      transcriptLength: vidTranscript?.length || 0
    });

    // Handle rate limit errors
    if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again in a minute.',
        details: 'Groq API has a limit of 12,000 tokens per minute and 100,000 tokens per day.'
      });
    }

    // Handle Groq API errors
    if (error.message?.includes('Groq')) {
      return res.status(500).json({ 
        error: 'Groq API error',
        details: error.message
      });
    }

    res.status(500).json({ 
      error: 'Failed to summarize video',
      details: error.message || 'An unexpected error occurred'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
