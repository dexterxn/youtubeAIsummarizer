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
    console.log('Fetching transcript for video:', videoId);
    
    const errors = [];
    
    // Method 1: Try direct timedtext API with more comprehensive approach
    try {
      console.log('Trying timedtext API method...');
      const transcript = await fetchFromTimedTextAPI(videoId);
      if (transcript.length > 0) {
        console.log('Successfully fetched transcript using timedtext API');
        return transcript;
      } else {
        errors.push('Timedtext API: No transcript data returned');
      }
    } catch (error) {
      errors.push(`Timedtext API: ${error.message}`);
      console.log('Timedtext API failed:', error.message);
    }

    // Method 2: Extract from video page
    try {
      console.log('Trying video page method...');
      const pageTranscript = await fetchFromVideoPage(videoId);
      if (pageTranscript.length > 0) {
        console.log('Successfully fetched transcript from video page');
        return pageTranscript;
      } else {
        errors.push('Video page method: No transcript data returned');
      }
    } catch (error) {
      errors.push(`Video page method: ${error.message}`);
      console.log('Video page method failed:', error.message);
    }

    // Method 3: Try innertube API
    try {
      console.log('Trying innertube API method...');
      const innertubeTranscript = await fetchFromInnertubeAPI(videoId);
      if (innertubeTranscript.length > 0) {
        console.log('Successfully fetched transcript using innertube API');
        return innertubeTranscript;
      } else {
        errors.push('Innertube API: No transcript data returned');
      }
    } catch (error) {
      errors.push(`Innertube API: ${error.message}`);
      console.log('Innertube API failed:', error.message);
    }

    console.log('All methods failed. Errors:', errors);
    
    // Provide a more helpful error message
    const detailedError = `No transcript available for this video. Attempts made:\n${errors.join('\n')}`;
    throw new Error(detailedError);
  } catch (error) {
    console.error('Failed to fetch transcript:', error);
    throw error;
  }
}

async function fetchFromTimedTextAPI(videoId) {
  // Try fewer combinations to avoid rate limiting
  const combinations = [
    { lang: 'en', fmt: 'srv3' },
    { lang: 'en', fmt: 'vtt' },
    { lang: 'en-US', fmt: 'srv3' }
  ];
  
  console.log('Trying timedtext API with reduced combinations to avoid rate limiting');
  
  for (const { lang, fmt } of combinations) {
    try {
      // Only try the primary URL format to avoid rate limiting
      const url = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&fmt=${fmt}`;
      console.log(`Trying URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      console.log(`Response status: ${response.status}, ok: ${response.ok}`);
      
      if (response.ok) {
        const data = await response.text();
        console.log(`Data length: ${data.length}, preview: ${data.substring(0, 100)}`);
        
        if (data && data.trim().length > 0 && !data.includes('not available')) {
          const parsed = await parseTranscriptData(data, fmt);
          console.log(`Parsed ${parsed.length} segments for ${lang}-${fmt}`);
          
          if (parsed.length > 0) {
            return parsed;
          }
        } else {
          console.log('Data was empty or contained "not available"');
        }
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`Error with ${lang}-${fmt}:`, error.message);
      continue;
    }
  }
  
  console.log('All timedtext API attempts failed');
  return [];
}

async function fetchFromVideoPage(videoId) {
  try {
    console.log(`Fetching video page for: https://www.youtube.com/watch?v=${videoId}`);
    
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log('Video page HTML length:', html.length);
    
    // Check if the page contains error indicators
    if (html.includes('This video is unavailable') || html.includes('Video unavailable')) {
      throw new Error('Video is unavailable or private');
    }
    
    if (html.includes('This video has been removed') || html.includes('account has been terminated')) {
      throw new Error('Video has been removed or account terminated');
    }
    
    // Try multiple extraction patterns
    let playerResponse;
    
    // Pattern 1: ytInitialPlayerResponse
    let match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
    if (match) {
      try {
        playerResponse = JSON.parse(match[1]);
        console.log('Successfully parsed ytInitialPlayerResponse');
      } catch (e) {
        console.log('Failed to parse ytInitialPlayerResponse:', e.message);
      }
    }
    
    // Pattern 2: var ytInitialPlayerResponse
    if (!playerResponse) {
      match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*({.+?})\s*;/);
      if (match) {
        try {
          playerResponse = JSON.parse(match[1]);
          console.log('Successfully parsed var ytInitialPlayerResponse');
        } catch (e) {
          console.log('Failed to parse var ytInitialPlayerResponse:', e.message);
        }
      }
    }

    if (!playerResponse) {
      throw new Error('Could not extract player response from page');
    }

    // Check video details
    const videoDetails = playerResponse?.videoDetails;
    if (videoDetails) {
      console.log('Video details:', {
        title: videoDetails.title,
        lengthSeconds: videoDetails.lengthSeconds,
        isLiveContent: videoDetails.isLiveContent,
        isPrivate: videoDetails.isPrivate
      });
    }

    // Check for captions
    const captionsPath1 = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    const captionsPath2 = playerResponse?.captions?.playerCaptionsRenderer?.captionTracks;
    
    console.log('Caption tracks path 1:', captionsPath1 ? captionsPath1.length : 'null');
    console.log('Caption tracks path 2:', captionsPath2 ? captionsPath2.length : 'null');
    
    let captionTracks = captionsPath1 || captionsPath2;
    
    if (!captionTracks || captionTracks.length === 0) {
      // Log the entire captions object for debugging
      console.log('Captions object:', JSON.stringify(playerResponse?.captions, null, 2));
      throw new Error('No captions available for this video');
    }

    console.log('Available caption tracks:', captionTracks.map((track, index) => ({
      index,
      languageCode: track.languageCode,
      name: track.name?.simpleText || track.name,
      kind: track.kind,
      isTranslatable: track.isTranslatable,
      fullBaseUrl: track.baseUrl // Show full URL for debugging
    })));

    // Try to find auto-generated English captions first
    let selectedTrack = captionTracks.find(track => 
      (track.languageCode === 'en' || track.languageCode === 'en-US') && 
      track.kind === 'asr'
    );
    
    // Fallback to any English track
    if (!selectedTrack) {
      selectedTrack = captionTracks.find(track => 
        track.languageCode === 'en' || track.languageCode === 'en-US'
      );
    }
    
    // Fallback to any English-starting track
    if (!selectedTrack) {
      selectedTrack = captionTracks.find(track => 
        track.languageCode && track.languageCode.startsWith('en')
      );
    }
    
    // Last resort: use first available track
    if (!selectedTrack) {
      selectedTrack = captionTracks[0];
    }

    console.log('Selected track:', {
      languageCode: selectedTrack.languageCode,
      name: selectedTrack.name?.simpleText || selectedTrack.name,
      kind: selectedTrack.kind,
      fullBaseUrl: selectedTrack.baseUrl // Show full URL
    });

    if (!selectedTrack.baseUrl) {
      throw new Error('No valid caption URL found');
    }

    // Try just the original URL and one variant to avoid rate limiting
    const urlsToTry = [
      selectedTrack.baseUrl,
      selectedTrack.baseUrl + '&fmt=srv3'
    ];

    for (let i = 0; i < urlsToTry.length; i++) {
      const captionUrl = urlsToTry[i];
      
      try {
        console.log(`Trying caption URL ${i + 1}/${urlsToTry.length}:`, captionUrl);
        
        // Try with different headers including cookies
        const transcriptResponse = await fetch(captionUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/xml,application/xml,application/xhtml+xml,text/html;q=0.9,text/plain;q=0.8,image/png,*/*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.5',
            'Referer': `https://www.youtube.com/watch?v=${videoId}`,
            'DNT': '1'
          },
          credentials: 'include' // Include cookies
        });
        
        console.log(`Caption URL ${i + 1} status: ${transcriptResponse.status}, headers:`, Object.fromEntries(transcriptResponse.headers.entries()));
        
        if (!transcriptResponse.ok) {
          console.log(`Caption URL ${i + 1} failed: ${transcriptResponse.status} ${transcriptResponse.statusText}`);
          continue;
        }
        
        const transcriptData = await transcriptResponse.text();
        console.log(`Caption URL ${i + 1} data length:`, transcriptData.length);
        
        if (transcriptData && transcriptData.trim().length > 0) {
          console.log('Transcript data preview:', transcriptData.substring(0, 500));
          
          // Determine format based on content
          let format = 'xml';
          if (transcriptData.includes('WEBVTT')) {
            format = 'vtt';
          } else if (transcriptData.startsWith('{')) {
            format = 'srv3';
          }
          
          console.log('Detected format:', format);
          
          const parsed = await parseTranscriptData(transcriptData, format);
          console.log('Parsed transcript segments:', parsed.length);
          
          if (parsed.length > 0) {
            return parsed;
          }
        }
        
        // Add delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`Error with caption URL ${i + 1}:`, error.message);
        continue;
      }
    }
    
    // DISABLED: HTML extraction was picking up non-transcript content
    // If all caption URLs failed, try to extract transcript from the page HTML itself
    console.log('All caption URLs failed - this suggests YouTube is blocking transcript access');
    // try {
    //   const htmlTranscript = extractTranscriptFromHTML(html);
    //   if (htmlTranscript.length > 0) {
    //     console.log('Found transcript in HTML:', htmlTranscript.length, 'segments');
    //     return htmlTranscript;
    //   }
    // } catch (error) {
    //   console.log('HTML extraction failed:', error.message);
    // }
    
    throw new Error('Caption URLs are returning empty data - this may be due to YouTube blocking or the video having no captions');
  } catch (error) {
    console.error('Video page method error:', error);
    throw error;
  }
}

async function fetchFromInnertubeAPI(videoId) {
  try {
    // YouTube's internal API endpoint
    const params = btoa(`\n\x0b${videoId}`); // Use btoa instead of Buffer
    
    const response = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20231201.01.00'
          }
        },
        params: params
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data.actions && data.actions[0]) {
        const transcriptData = data.actions[0].updateEngagementPanelAction?.content?.transcriptRenderer?.body?.transcriptBodyRenderer?.cueGroups;
        if (transcriptData) {
          return transcriptData.map(cue => ({
            text: cue.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.cue.simpleText,
            start: parseFloat(cue.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.startOffsetMs) / 1000,
            duration: parseFloat(cue.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.durationMs) / 1000,
            end: (parseFloat(cue.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.startOffsetMs) + parseFloat(cue.transcriptCueGroupRenderer.cues[0].transcriptCueRenderer.durationMs)) / 1000
          }));
        }
      }
    }
  } catch (error) {
    console.log('Innertube API failed:', error);
  }
  
  return [];
}

async function parseTranscriptData(data, format) {
  if (!data || data.trim().length === 0) {
    return [];
  }

  try {
    console.log(`Parsing transcript data as ${format}`);
    
    // Handle JSON format (srv3)
    if (format === 'srv3' || (data.startsWith('{') && data.includes('events'))) {
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
    if (data.includes('<text') || format === 'xml' || format === 'ttml') {
      return await parseXMLTranscript(data);
    }

    // Handle VTT format
    if (data.includes('WEBVTT') || format === 'vtt') {
      return parseVTTTranscript(data);
    }

    // Fallback: try to extract any text
    console.log('Attempting fallback parsing...');
    return await parseXMLTranscript(data);
  } catch (error) {
    console.error('Parse error:', error);
    return [];
  }
}

async function parseXMLTranscript(xmlText) {
  try {
    // Use offscreen document for XML parsing
    await setupOffscreenDocument('offscreen.html');
    
    const result = await chrome.runtime.sendMessage({
      type: 'parseXML',
      xmlText: xmlText
    });
    
    await closeOffscreenDocument();
    
    if (result && result.success) {
      return result.transcript;
    }
    
    return [];
  } catch (error) {
    console.error('XML parsing error:', error);
    await closeOffscreenDocument();
    return [];
  }
}

function parseVTTTranscript(vttData) {
  const lines = vttData.split('\n');
  const transcript = [];
  let currentCue = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and headers
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) {
      continue;
    }
    
    // Check for timestamp line
    if (line.includes('-->')) {
      const timeMatch = line.match(/(\d{1,2}:)?(\d{1,2}):(\d{1,2})\.(\d{3})\s*-->\s*(\d{1,2}:)?(\d{1,2}):(\d{1,2})\.(\d{3})/);
      if (timeMatch) {
        const startHours = parseInt(timeMatch[1]?.replace(':', '') || '0');
        const startMinutes = parseInt(timeMatch[2]);
        const startSeconds = parseInt(timeMatch[3]);
        const startMs = parseInt(timeMatch[4]);
        
        const endHours = parseInt(timeMatch[5]?.replace(':', '') || '0');
        const endMinutes = parseInt(timeMatch[6]);
        const endSeconds = parseInt(timeMatch[7]);
        const endMs = parseInt(timeMatch[8]);
        
        const startTime = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;
        const endTime = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;
        
        currentCue = {
          start: startTime,
          end: endTime,
          duration: endTime - startTime,
          text: ''
        };
      }
    } else if (currentCue && line && !line.match(/^\d+$/)) {
      // This is caption text
      currentCue.text += (currentCue.text ? ' ' : '') + line.replace(/<[^>]*>/g, '');
      
      // Check if this is the last line of the cue (next line is empty or timestamp)
      const nextLine = lines[i + 1];
      if (!nextLine || nextLine.trim() === '' || nextLine.includes('-->')) {
        if (currentCue.text.trim()) {
          transcript.push({
            text: currentCue.text.trim(),
            start: currentCue.start,
            duration: currentCue.duration,
            end: currentCue.end
          });
        }
        currentCue = null;
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

// Fallback function to extract transcript from HTML
function extractTranscriptFromHTML(html) {
  try {
    console.log('Attempting to extract transcript from HTML...');
    
    // Look for embedded transcript data in ytInitialPlayerResponse specifically
    const patterns = [
      // Pattern 1: Look for transcript in engagement panel (most reliable)
      /\"transcriptRenderer\":\{\"body\":\{\"transcriptBodyRenderer\":\{\"cueGroups\":(\[.+?\])/,
      // Pattern 2: Look for transcript segments in player response
      /\"transcriptSegmentList\":\{\"transcriptSegments\":(\[.+?\])/,
      // Pattern 3: Look for caption tracks with transcript data
      /\"captionTracks\":\[.*?\"baseUrl\":\"[^"]*timedtext[^"]*\".*?\]/
    ];
    
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          console.log('Found potential transcript data:', data.length, 'items');
          
          // Only process if this looks like actual transcript data
          if (Array.isArray(data) && data.length > 0) {
            const transcript = [];
            
            for (const item of data) {
              // Handle transcript cue group format (most reliable)
              if (item.transcriptCueGroupRenderer && item.transcriptCueGroupRenderer.cues) {
                const cues = item.transcriptCueGroupRenderer.cues;
                for (const cue of cues) {
                  if (cue.transcriptCueRenderer && cue.transcriptCueRenderer.cue) {
                    const text = cue.transcriptCueRenderer.cue.simpleText || 
                                cue.transcriptCueRenderer.cue.runs?.[0]?.text;
                    const startMs = parseFloat(cue.transcriptCueRenderer.startOffsetMs || 0);
                    const durationMs = parseFloat(cue.transcriptCueRenderer.durationMs || 0);
                    
                    // Only add if this looks like actual spoken content
                    if (text && text.trim() && text.length > 2 && !text.includes('Subscribe') && !text.includes('Like')) {
                      transcript.push({
                        text: text.trim(),
                        start: startMs / 1000,
                        duration: durationMs / 1000,
                        end: (startMs + durationMs) / 1000
                      });
                    }
                  }
                }
              }
            }
            
            // Only return if we found a substantial amount of transcript data
            if (transcript.length > 5) {
              console.log('Successfully extracted transcript from HTML:', transcript.length, 'segments');
              return transcript;
            }
          }
        } catch (e) {
          console.log('Failed to parse potential transcript data:', e.message);
          continue;
        }
      }
    }
    
    console.log('No valid transcript data found in HTML - avoiding generic text extraction to prevent grabbing page content');
    return [];
  } catch (error) {
    console.log('Error extracting from HTML:', error.message);
    return [];
  }
}
