chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchTranscript') {
    fetchTranscriptFromYouTube(request.videoId)
      .then(transcript => sendResponse({success: true, transcript}))
      .catch(error => sendResponse({success: false, error: error.message}));
    return true;
  }
});

async function fetchTranscriptFromYouTube(videoId) {
  try {
    // Method 1: Try direct timedtext API
    const transcript = await fetchFromTimedTextAPI(videoId);
    if (transcript.length > 0) {
      return transcript;
    }

    // Method 2: Extract from video page
    return await fetchFromVideoPage(videoId);
  } catch (error) {
    throw new Error(`Failed to fetch transcript: ${error.message}`);
  }
}

async function fetchFromTimedTextAPI(videoId) {
  const languages = ['en', 'en-US', 'en-GB'];
  const formats = ['srv3', 'ttml', 'vtt'];
  
  for (const lang of languages) {
    for (const fmt of formats) {
      try {
        const url = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=${fmt}`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.text();
          if (data && data.trim().length > 0) {
            return await parseTranscriptData(data, fmt);
          }
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  return [];
}

async function fetchFromVideoPage(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    
    // Extract player response
    const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
    if (!match) {
      throw new Error('Could not find player response');
    }

    const playerResponse = JSON.parse(match[1]);
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error('No captions available');
    }

    // Find English track
    const englishTrack = captionTracks.find(track => 
      track.languageCode === 'en' || track.languageCode.startsWith('en-')
    ) || captionTracks[0];

    // Fetch transcript
    const transcriptResponse = await fetch(englishTrack.baseUrl);
    const transcriptData = await transcriptResponse.text();
    
    return await parseTranscriptData(transcriptData, 'xml');
  } catch (error) {
    throw new Error(`Video page method failed: ${error.message}`);
  }
}

async function parseTranscriptData(data, format) {
  if (!data || data.trim().length === 0) {
    return [];
  }

  try {
    // Handle JSON format
    if (format === 'srv3') {
      const jsonData = JSON.parse(data);
      if (jsonData.events) {
        return jsonData.events
          .filter(event => event.segs && event.segs.length > 0)
          .map(event => ({
            text: event.segs.map(seg => seg.utf8 || '').join('').trim(),
            start: (event.tStartMs || 0) / 1000,
            duration: (event.dDurationMs || 0) / 1000,
            end: ((event.tStartMs || 0) + (event.dDurationMs || 0)) / 1000
          }))
          .filter(item => item.text.length > 0);
      }
    }

    // Handle XML format
    if (data.includes('<text') || format === 'xml') {
      return await parseXMLTranscript(data);
    }

    // Handle VTT format
    if (data.includes('WEBVTT') || format === 'vtt') {
      return parseVTTTranscript(data);
    }

    return [];
  } catch (error) {
    console.error('Parse error:', error);
    return [];
  }
}

async function parseXMLTranscript(xmlText) {
  // Use offscreen document for XML parsing
  await setupOffscreenDocument('offscreen.html');
  
  const result = await chrome.runtime.sendMessage({
    type: 'parseXML',
    xmlText: xmlText
  });
  
  await closeOffscreenDocument();
  
  if (result.success) {
    return result.transcript;
  }
  
  return [];
}

function parseVTTTranscript(vttData) {
  const lines = vttData.split('\n');
  const transcript = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d+:)?(\d+):(\d+)\.(\d+)/);
      if (timeMatch && i + 1 < lines.length) {
        const hours = parseInt(timeMatch[1]?.replace(':', '') || '0');
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const ms = parseInt(timeMatch[4]);
        
        const startTime = hours * 3600 + minutes * 60 + seconds + ms / 1000;
        const text = lines[i + 1].trim();
        
        if (text && !text.includes('-->')) {
          transcript.push({
            text: text,
            start: startTime,
            duration: 5,
            end: startTime + 5
          });
        }
      }
    }
  }
  
  return transcript;
}

// Offscreen document functions
async function setupOffscreenDocument(path) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['DOM_PARSER'],
    justification: 'Parse YouTube transcript XML'
  });
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}
