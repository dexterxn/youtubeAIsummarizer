function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
    /youtube\.com\/live\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Extract transcript from URL
async function getTranscript(url) {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { success: false, error: 'Invalid YouTube URL. Please enter a valid YouTube video URL.' };
    }

    console.log(`Attempting to fetch transcript for video ID: ${videoId}`);

    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'fetchTranscript',
      videoId: videoId
    });

    if (response && response.success) {
      const fullText = response.transcript.map(segment => segment.text).join(' ');
      console.log(`Successfully fetched transcript with ${response.transcript.length} segments`);
      return {
        success: true,
        videoId: videoId,
        transcript: response.transcript,
        fullText: fullText,
        duration: response.transcript.length > 0 ? 
          response.transcript[response.transcript.length - 1].start + 
          response.transcript[response.transcript.length - 1].duration : 0
      };
    } else {
      const errorMessage = response && response.error ? response.error : 'Unknown error occurred';
      console.error('Transcript fetch failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    console.error('Unexpected error during transcript fetch:', error);
    return { 
      success: false, 
      error: `Failed to get transcript: ${error.message}. This might be due to no captions available or the video being private/restricted.` 
    };
  }
}

function showToast(message, type = 'info') {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }
}

function setLoadingState(isLoading, message = '') {
  const summarizeBtn = document.getElementById('summarize-btn');
  const summaryBox = document.getElementById('summary-box');
  
  if (isLoading) {
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = 'Processing...';
    if (summaryBox && message) {
      summaryBox.textContent = message;
      summaryBox.classList.add('loading');
    }
  } else {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarize';
    if (summaryBox) {
      summaryBox.classList.remove('loading');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarize-btn');
  const copyBtn = document.getElementById('copy-btn');
  const summaryBox = document.getElementById('summary-box');
  const input = document.getElementById('youtube-link');

  // Test with a known working video
  const testWorkingVideo = async () => {
    console.log('Testing with a known working video...');
    
    // Try a popular video that should have captions
    const testVideoIds = [
      'dQw4w9WgXcQ', // Rick Roll (very popular, should have captions)
      'jNQXAC9IVRw', // Me at the zoo (first YouTube video)
      'kJQP7kiw5Fk'  // Despacito (very popular)
    ];
    
    for (const videoId of testVideoIds) {
      try {
        console.log(`Testing video ID: ${videoId}`);
        const response = await chrome.runtime.sendMessage({
          action: 'fetchTranscript',
          videoId: videoId
        });
        
        if (response && response.success && response.transcript.length > 0) {
          console.log(`SUCCESS! Video ${videoId} returned ${response.transcript.length} transcript segments`);
          console.log('Sample text:', response.transcript.slice(0, 3).map(t => t.text).join(' '));
          break;
        } else {
          console.log(`Video ${videoId} failed:`, response ? response.error : 'No response');
        }
      } catch (error) {
        console.log(`Video ${videoId} error:`, error.message);
      }
    }
  };

  // Add test button (temporary for debugging)
  if (window.location.search.includes('debug')) {
    const testBtn = document.createElement('button');
    testBtn.textContent = 'Test Known Video';
    testBtn.onclick = testWorkingVideo;
    document.body.insertBefore(testBtn, summarizeBtn);
  }

  // Auto-fill current tab URL if it's a YouTube video
  chrome.tabs?.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && tabs[0].url && tabs[0].url.includes('youtube.com/watch')) {
      if (input) {
        input.value = tabs[0].url;
        showToast('Auto-filled with current YouTube video!');
      }
    }
  });

  summarizeBtn.addEventListener('click', async () => {
    const link = input.value.trim();
    if (!link) {
      summaryBox.textContent = "Please enter a YouTube URL";
      showToast("Please enter a YouTube URL", "error");
      return;
    }

    setLoadingState(true, "Processing transcript...");

    try {
      const transcriptResult = await getTranscript(link);
      console.log("Transcript result:", transcriptResult);

      if (!transcriptResult.success) {
        summaryBox.textContent = `Error: ${transcriptResult.error}`;
        showToast("Failed to get transcript", "error");
        setLoadingState(false);
        return;
      }

      // Check if transcript is meaningful
      if (!transcriptResult.fullText || transcriptResult.fullText.trim().length < 10) {
        summaryBox.textContent = "Error: The transcript appears to be empty or too short to summarize.";
        showToast("Transcript too short to summarize", "error");
        setLoadingState(false);
        return;
      }

      showToast(`Transcript extracted successfully! (${transcriptResult.transcript.length} segments)`);
      setLoadingState(true, "Sending to AI for summarization...");
      
      // Send transcript to summarization API
      const summaryRes = await fetch('https://groq-summarizer-730135335149.us-central1.run.app/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptResult.fullText })
      });

      if (!summaryRes.ok) {
        throw new Error(`Server error: ${summaryRes.status} ${summaryRes.statusText}`);
      }

      const summaryData = await summaryRes.json();
      
      if (summaryData.summary) {
        summaryBox.textContent = summaryData.summary;
        showToast("Summary generated successfully!", "success");
      } else if (summaryData.error) {
        summaryBox.textContent = `Summary Error: ${summaryData.error}`;
        showToast("Failed to generate summary", "error");
      } else {
        summaryBox.textContent = "No summary was generated. Please try again.";
        showToast("No summary generated", "error");
      }
    } catch (err) {
      console.error('Summarization error:', err);
      let errorMessage = "An error occurred while processing your request.";
      
      if (err.message.includes('fetch')) {
        errorMessage = "Network error: Unable to connect to the summarization service.";
      } else if (err.message.includes('Server error')) {
        errorMessage = `Server error: ${err.message}`;
      }
      
      summaryBox.textContent = `Error: ${errorMessage}`;
      showToast("Failed to generate summary", "error");
    } finally {
      setLoadingState(false);
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = summaryBox.textContent || summaryBox.innerText;
    if (!text || text.trim() === "Summary will appear here..." || text.includes("Error:")) {
      showToast("There's no summary to copy!", "error");
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => showToast("Summary copied to clipboard!", "success"))
      .catch(err => {
        console.error("Failed to copy text: ", err);
        showToast("Failed to copy text", "error");
      });
  });

  // Allow Enter key to trigger summarization
  input?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      summarizeBtn.click();
    }
  });
});
