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

// Extract transcript directly from YouTube DOM
async function getTranscript(videoId, tabId) {
  try {
    console.log(`Attempting to fetch transcript from DOM for video ID: ${videoId}`);

    // Inject content script to extract transcript from DOM
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      function: extractTranscriptFromYouTubePage
    });

    if (results && results[0] && results[0].result) {
      const result = results[0].result;
      
      if (result.success && result.transcript && result.transcript.length > 0) {
        const fullText = result.transcript.map(segment => segment.text).join(' ');
        console.log(`Successfully extracted transcript with ${result.transcript.length} segments from DOM`);
        
        return {
          success: true,
          videoId: videoId,
          transcript: result.transcript,
          fullText: fullText,
          duration: result.transcript.length > 0 ? 
            result.transcript[result.transcript.length - 1].start + 
            result.transcript[result.transcript.length - 1].duration : 0
        };
      } else {
        return { success: false, error: result.error || 'Failed to extract transcript from page' };
      }
    } else {
      return { success: false, error: 'No response from content script' };
    }
  } catch (error) {
    console.error('Unexpected error during transcript extraction:', error);
    return { 
      success: false, 
      error: `Failed to extract transcript: ${error.message}. Make sure you're on a YouTube video page with captions available.` 
    };
  }
}

// Content script function to be injected into YouTube page
function extractTranscriptFromYouTubePage() {
  return new Promise((resolve) => {
    try {
      console.log('Starting DOM transcript extraction...');
      
      // Function to wait for transcript elements
      function waitForTranscriptElements(maxAttempts = 20) {
        let attempts = 0;
        
        const checkForTranscript = () => {
          attempts++;
          console.log(`Attempt ${attempts}: Looking for transcript elements...`);
          
          // Look for transcript segments
          let transcriptElements = document.querySelectorAll('yt-formatted-string.segment-text.style-scope.ytd-transcript-segment-renderer');
          
          if (transcriptElements.length > 0) {
            console.log(`Found ${transcriptElements.length} transcript elements!`);
            // check to make sure it's english
            selectEnglishSubtitles();
            transcriptElements = document.querySelectorAll('yt-formatted-string.segment-text.style-scope.ytd-transcript-segment-renderer');
            console.log(`Changed to enlgish and found ${transcriptElements.length} transcript elements!`);
            
            // Extract transcript data
            const transcript = [];
            transcriptElements.forEach((element, index) => {
              const text = element.textContent?.trim();
              if (text && text.length > 0) {
                // Try to find timestamp in parent element
                let startTime = index * 3; // Default fallback
                
                const parentSegment = element.closest('ytd-transcript-segment-renderer');
                if (parentSegment) {
                  const timestampElement = parentSegment.querySelector('[class*="cue-group-start-offset"]');
                  if (timestampElement) {
                    const timeText = timestampElement.textContent?.trim();
                    if (timeText) {
                      startTime = parseTimeString(timeText);
                    }
                  }
                }
                
                transcript.push({
                  text: text,
                  start: startTime,
                  duration: 3,
                  end: startTime + 3
                });
              }
            });
            
            resolve({
              success: true,
              transcript: transcript,
              message: `Extracted ${transcript.length} transcript segments from DOM`
            });
            return;
          }
          
          // If no transcript found yet, try to open transcript panel
          if (attempts <= 3) {
            console.log('No transcript elements found, attempting to open transcript panel...');
            const panelOpened = openTranscriptPanel();
            
            // If panel was opened successfully, try to select English subtitles
            if (panelOpened && attempts === 1) {
              console.log('Transcript panel opened, attempting to select English subtitles...');
              selectEnglishSubtitles();
            }
          }
          
          if (attempts >= maxAttempts) {
            resolve({
              success: false,
              error: 'Transcript elements not found. This video may not have captions available.'
            });
            return;
          }
          
          // Wait and try again
          setTimeout(checkForTranscript, 1000);
        };
        
        checkForTranscript();
      }
      
      // Function to open transcript panel
      function openTranscriptPanel() {
        try {
          console.log('Attempting to open transcript panel...');
          
          // Look for "Show transcript" button
          const transcriptButtons = [
            // Primary selector for the show transcript button
            'button[aria-label*="transcript" i]',
            'button[aria-label*="Show transcript" i]',
            '[role="button"][aria-label*="transcript" i]',
            // Look for the specific span text
            'span[role="text"]'
          ];
          
          for (const selector of transcriptButtons) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
              const text = element.textContent?.toLowerCase();
              if (text && text.includes('transcript')) {
                console.log('Found transcript button, clicking...');
                element.click();
                
                // Also try clicking parent elements
                let parent = element.parentElement;
                let attempts = 0;
                while (parent && attempts < 3) {
                  if (parent.tagName === 'BUTTON' || parent.hasAttribute('role')) {
                    parent.click();
                    break;
                  }
                  parent = parent.parentElement;
                  attempts++;
                }
                
                return true;
              }
            }
          }
          
          // Try the more actions menu
          const moreButton = document.querySelector('[aria-label="More actions"]');
          if (moreButton) {
            console.log('Trying more actions menu...');
            moreButton.click();
            
            setTimeout(() => {
              const menuItems = document.querySelectorAll('[role="menuitem"]');
              for (const item of menuItems) {
                if (item.textContent && item.textContent.toLowerCase().includes('transcript')) {
                  console.log('Found transcript in menu, clicking...');
                  item.click();
                  return true;
                }
              }
            }, 500);
            
            // Return true since we attempted the more actions menu
            return true;
          }
          
          console.log('Could not find transcript button');
          return false;
        } catch (error) {
          console.log('Error opening transcript panel:', error);
          return false;
        }
      }
      
      // Function to select English subtitles specifically
      function selectEnglishSubtitles() {
        try {
          console.log('Attempting to select English subtitles from dropdown...');
          
          // Wait for transcript panel to load
          setTimeout(() => {
            // Look for the language dropdown button in the transcript panel
            const transcriptContainer = document.querySelector('ytd-transcript-renderer') || 
                                      document.querySelector('[class*="transcript"]');
            
            if (!transcriptContainer) {
              console.log('Transcript container not found');
              return false;
            }
            
            // Look for language dropdown/selector within transcript container
            const languageDropdownSelectors = [
              // Common YouTube dropdown selectors
              'yt-dropdown-menu button',
              'button[aria-haspopup="true"]',
              'button[aria-expanded]',
              // Look for buttons with language-related aria labels
              'button[aria-label*="language"]',
              'button[aria-label*="Language"]',
              // Generic dropdown buttons within transcript area
              '.ytd-transcript-renderer button',
              'ytd-transcript-renderer yt-icon-button',
              // Look for any clickable elements that might be the dropdown
              '[role="button"]',
              'button'
            ];
            
            for (const selector of languageDropdownSelectors) {
              const buttons = transcriptContainer.querySelectorAll(selector);
              
              for (const button of buttons) {
                // Check if this looks like a language dropdown
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase();
                const buttonText = button.textContent?.toLowerCase();
                
                if ((ariaLabel && (ariaLabel.includes('language') || ariaLabel.includes('options'))) ||
                    (buttonText && buttonText.includes('language')) ||
                    button.getAttribute('aria-haspopup') === 'true' ||
                    button.getAttribute('aria-expanded') !== null) {
                  
                  console.log('Found potential language dropdown, clicking...');
                  button.click();
                  
                  // Wait for dropdown menu to appear, then select English
                  setTimeout(() => {
                    selectEnglishFromDropdown();
                  }, 800);
                  
                  return true;
                }
              }
            }
            
            // Alternative approach: Look for any dropdown-like elements in transcript area
            const dropdownElements = transcriptContainer.querySelectorAll([
              'yt-dropdown-menu',
              'iron-dropdown',
              '[role="listbox"]',
              '[role="menu"]',
              '.dropdown',
              '[class*="dropdown"]',
              '[class*="menu"]'
            ].join(', '));
            
            if (dropdownElements.length > 0) {
              console.log('Found dropdown elements, trying to interact...');
              dropdownElements[0].click();
              
              setTimeout(() => {
                selectEnglishFromDropdown();
              }, 800);
              
              return true;
            }
            
            console.log('Could not find language dropdown in transcript panel');
            return false;
            
          }, 1500); // Wait longer for transcript panel to fully load
          
        } catch (error) {
          console.log('Error selecting English subtitles:', error);
          return false;
        }
      }
      
      // Function to select English from opened dropdown
      function selectEnglishFromDropdown() {
        try {
          console.log('Looking for English options in opened dropdown...');
          
          // Wait a bit more for dropdown to fully render
          setTimeout(() => {
            // Look for dropdown menu items
            const dropdownSelectors = [
              '[role="menuitem"]',
              '[role="option"]',
              'yt-formatted-string',
              '.ytd-menu-service-item-renderer',
              '.ytd-transcript-language-menu-item-renderer',
              'paper-item',
              'iron-dropdown paper-item',
              'yt-dropdown-menu paper-item',
              // Generic text containers that might contain language options
              'div[class*="item"]',
              'span',
              'div'
            ];
            
            let foundEnglish = false;
            
            // Priority 1: Look for "English (auto-generated)"
            for (const selector of dropdownSelectors) {
              const items = document.querySelectorAll(selector);
              
              for (const item of items) {
                const text = item.textContent?.trim().toLowerCase();
                
                if (text && text.includes('english') && 
                    (text.includes('auto') || text.includes('generated'))) {
                  console.log('Found "English (auto-generated)" in dropdown, clicking...');
                  item.click();
                  foundEnglish = true;
                  return true;
                }
              }
            }
            
            // Priority 2: Look for plain "English"
            if (!foundEnglish) {
              for (const selector of dropdownSelectors) {
                const items = document.querySelectorAll(selector);
                
                for (const item of items) {
                  const text = item.textContent?.trim().toLowerCase();
                  
                  if (text && (text === 'english' || 
                              (text.includes('english') && text.length < 20))) {
                    console.log('Found "English" in dropdown, clicking...');
                    item.click();
                    foundEnglish = true;
                    return true;
                  }
                }
              }
            }
            
            if (!foundEnglish) {
              console.log('No English options found in dropdown menu');
            }
            
            return foundEnglish;
            
          }, 500);
          
        } catch (error) {
          console.log('Error selecting from dropdown:', error);
          return false;
        }
      }
      
      // Helper function to parse time strings
      function parseTimeString(timeStr) {
        const parts = timeStr.split(':');
        if (parts.length === 2) {
          const minutes = parseInt(parts[0]) || 0;
          const seconds = parseInt(parts[1]) || 0;
          return minutes * 60 + seconds;
        }
        return 0;
      }
      
      // Start the extraction process
      waitForTranscriptElements();
      
    } catch (error) {
      resolve({
        success: false,
        error: `DOM extraction error: ${error.message}`
      });
    }
  });
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
    if (summaryBox) {
      summaryBox.innerHTML = '<div class="loading-text">Loading<span class="loading-dots">...</span></div>';
      summaryBox.classList.add('loading');
    }
  } else {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = 'Summarize Current Video';
    if (summaryBox) {
      summaryBox.classList.remove('loading');
    }
  }
}

async function getCurrentYouTubeVideo() {
  try {
    // Get the current active tab
    const tabs = await chrome.tabs.query({active: true, currentWindow: true});
    const currentTab = tabs[0];
    
    if (!currentTab || !currentTab.url) {
      throw new Error('No active tab found');
    }

    const url = currentTab.url;
    
    // Check if it's a YouTube page
    if (!url.includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video page');
    }

    // Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Could not extract video ID from current page');
    }

    // Get video title if possible
    let videoTitle = currentTab.title || 'Current YouTube Video';
    
    // Clean up the title (remove " - YouTube" suffix)
    videoTitle = videoTitle.replace(/ - YouTube$/, '');

    return {
      success: true,
      videoId: videoId,
      title: videoTitle,
      url: url,
      tabId: currentTab.id
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function updateVideoInfo(videoInfo) {
  const videoInfoDiv = document.getElementById('video-info');
  const videoTitle = document.getElementById('video-title');
  
  if (videoInfo.success) {
    videoInfoDiv.className = 'video-info detected';
    videoTitle.textContent = `📺 ${videoInfo.title}`;
    
    // Enable the summarize button
    const summarizeBtn = document.getElementById('summarize-btn');
    summarizeBtn.disabled = false;
  } else {
    videoInfoDiv.className = 'video-info error';
    videoTitle.textContent = `❌ ${videoInfo.error}`;
    
    // Disable the summarize button
    const summarizeBtn = document.getElementById('summarize-btn');
    summarizeBtn.disabled = true;
  }
}
// Function to pause YouTube video in the tab
function pauseYouTubeVideo() {
  // Pause the native <video> element (works for most YouTube pages)
  const video = document.querySelector('video');
  if (video && !video.paused) {
    video.pause();
  }
  // Pause embedded YouTube iframe if present
  const iframe = document.querySelector('iframe[src*="youtube.com/embed"], iframe[src*="youtube.com/watch"], iframe[src*="youtube.com/v/"]');
  if (iframe) {
    iframe.contentWindow.postMessage(
      '{"event":"command","func":"pauseVideo","args":""}',
      '*'
    );
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const summarizeBtn = document.getElementById('summarize-btn');
  const copyBtn = document.getElementById('copy-btn');
  const summaryBox = document.getElementById('summary-box');

  // Disable summarize button initially
  summarizeBtn.disabled = true;

  // Detect current YouTube video on load
  const videoInfo = await getCurrentYouTubeVideo();
  updateVideoInfo(videoInfo);

  // Store current video info globally
  window.currentVideoInfo = videoInfo;

  // Pause YouTube video in the tab 
  if (videoInfo.success) {
    await chrome.scripting.executeScript({
      target: { tabId: videoInfo.tabId },
      func: pauseYouTubeVideo
    });
  }

  summarizeBtn.addEventListener('click', async () => {
    if (!window.currentVideoInfo || !window.currentVideoInfo.success) {
      showToast("Please navigate to a YouTube video page first", "error");
      return;
    }

    setLoadingState(true);

    try {
      const transcriptResult = await getTranscript(window.currentVideoInfo.videoId, window.currentVideoInfo.tabId);
      console.log("Transcript result:", transcriptResult);
      console.log("Full transcript text:", transcriptResult.fullText);

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

      // Check transcript length (approximately 4 chars per token)
      const estimatedTokens = Math.ceil(transcriptResult.fullText.length / 4);
      if (estimatedTokens > 32000) { // Groq's context window limit
        summaryBox.textContent = `Error: Transcript is too long (estimated ${estimatedTokens} tokens). Please try a shorter video.`;
        showToast("Transcript too long to process", "error");
        setLoadingState(false);
        return;
      }

      showToast("Transcript extracted successfully!");
      
      // Send transcript to summarization API
      const summaryRes = await fetch('https://groq-summarizer-730135335149.us-central1.run.app/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptResult.fullText })
      });

      console.log('Server response status:', summaryRes.status);
      const responseText = await summaryRes.text();
      console.log('Server response:', responseText);

      if (!summaryRes.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
          console.log('Server response status:', summaryRes.status);
          console.log('Full error response:', responseText);
          console.log('Parsed error data:', errorData);
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorData = { error: responseText };
        }

        // Check for any token/transcript length related errors
        const isTokenError = 
          summaryRes.status === 429 || 
          errorData.error?.message?.includes('Request too large') ||
          errorData.error?.code === 'rate_limit_exceeded' ||
          errorData.error?.type === 'tokens' ||
          errorData.error?.message?.includes('tokens per minute') ||
          errorData.error?.message?.includes('TPM');

        if (isTokenError) {
          const errorMessage = "This video is too long to summarize. Please try a shorter video (under 10 minutes).";
          summaryBox.innerHTML = `
            <div class="error-message">${errorMessage}</div>
            <button id="copy-transcript" class="copy-btn">Copy Transcript to Clipboard</button>
          `;
          
          // Add click handler for copy button
          document.getElementById('copy-transcript').addEventListener('click', () => {
            navigator.clipboard.writeText(transcriptResult.fullText)
              .then(() => showToast("Transcript copied to clipboard!", "success"))
              .catch(err => {
                console.error("Failed to copy text: ", err);
                showToast("Failed to copy transcript", "error");
              });
          });
          
          showToast("Video too long to process", "error");
          setLoadingState(false);
          return;
        }

        // For other errors, show user-friendly messages
        let userMessage;
        if (errorData.error?.message?.includes('network')) {
          userMessage = "Unable to connect to the server. Please check your internet connection and try again.";
        } else if (errorData.error?.message?.includes('timeout')) {
          userMessage = "The request took too long to process. Please try again.";
        } else if (errorData.error?.message?.includes('transcript')) {
          userMessage = "Unable to get the video transcript. Please make sure the video has captions available.";
        } else {
          userMessage = "Unable to summarize the video. Please try again or try a different video.";
        }

        summaryBox.innerHTML = `
          <div class="error-message">${userMessage}</div>
          <button id="copy-transcript" class="copy-btn">Copy Transcript to Clipboard</button>
        `;

        // Add click handler for copy button
        document.getElementById('copy-transcript').addEventListener('click', () => {
          navigator.clipboard.writeText(transcriptResult.fullText)
            .then(() => showToast("Transcript copied to clipboard!", "success"))
            .catch(err => {
              console.error("Failed to copy text: ", err);
              showToast("Failed to copy transcript", "error");
            });
        });

        showToast("Failed to process video", "error");
        setLoadingState(false);
        return;
      }

      const summaryData = JSON.parse(responseText);
      
      if (summaryData.summary) {
        summaryBox.textContent = summaryData.summary;
        showToast("Summary generated successfully!", "success");
        await saveSummary(window.currentVideoInfo.videoId, summaryData.summary);
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
      } else if (err.message.includes('Rate limit exceeded')) {
        errorMessage = err.message;
      } else {
        errorMessage = err.message;
      }
      
      summaryBox.textContent = errorMessage;
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

  // Add refresh button functionality (detect video changes)
  const refreshVideoInfo = async () => {
    const newVideoInfo = await getCurrentYouTubeVideo();
    
    // Check if video changed
    if (newVideoInfo.success && window.currentVideoInfo.success && 
        newVideoInfo.videoId !== window.currentVideoInfo.videoId) {
      // Video changed, update info
      window.currentVideoInfo = newVideoInfo;
      updateVideoInfo(newVideoInfo);
      summaryBox.textContent = "Summary will appear here...";
      showToast("New video detected!", "info");
    } else if (newVideoInfo.success !== window.currentVideoInfo.success) {
      // Status changed (error to success or vice versa)
      window.currentVideoInfo = newVideoInfo;
      updateVideoInfo(newVideoInfo);
    }
  };

  // Refresh video info when extension popup is focused (optional)
  window.addEventListener('focus', refreshVideoInfo);

  chrome.storage.local.get('lastSummary', (data) => {
    if (data.lastSummary) {
      summaryBox.textContent = data.lastSummary;
    }
  });

  chrome.storage.local.get('summaries', (data) => {
    if (data.summaries && data.summaries.length) {
      // Render summaries in your popup, e.g. as a list
      data.summaries.forEach(item => {
        // create DOM elements for each summary
      });
    }
  });

  // History panel elements
  const historyBtn = document.getElementById('history-btn');
  const historyPanel = document.getElementById('history-panel');
  const historyList = document.getElementById('history-list');
  const backBtn = document.getElementById('back-btn');

  // Toggle history panel
  historyBtn.addEventListener('click', () => {
    historyPanel.classList.toggle('hidden');
    if (!historyPanel.classList.contains('hidden')) {
      loadHistory();
    }
  });

  // Back button handler
  backBtn.addEventListener('click', () => {
    historyPanel.classList.add('hidden');
  });

  // Confirmation dialog elements
  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmDeleteBtn = document.getElementById('confirm-delete');
  const cancelDeleteBtn = document.getElementById('cancel-delete');

  // Function to show confirmation dialog and handle delete
  function showDeleteConfirmation(historyItem, index) {
    confirmDialog.classList.remove('hidden');
    
    // Store the current item being deleted
    confirmDeleteBtn.onclick = async () => {
      try {
        const { summaries } = await chrome.storage.local.get('summaries');
        // Remove the summary at this index
        summaries.splice(index, 1);
        await chrome.storage.local.set({ summaries });
        
        // Hide dialog
        confirmDialog.classList.add('hidden');
        
        // Remove the item from UI with animation
        historyItem.style.opacity = '0';
        historyItem.style.transform = 'scale(0.9)';
        setTimeout(() => {
          historyItem.remove();
          // If no more summaries, show empty state
          if (summaries.length === 0) {
            loadHistory();
          }
        }, 200);
        
        showToast('Summary deleted', 'success');
      } catch (error) {
        console.error('Failed to delete summary:', error);
        showToast('Failed to delete summary', 'error');
        confirmDialog.classList.add('hidden');
      }
    };
    
    // Cancel button handler
    cancelDeleteBtn.onclick = () => {
      confirmDialog.classList.add('hidden');
    };
  }

  // Update the history loading function
  async function loadHistory() {
    try {
      const { summaries = [] } = await chrome.storage.local.get('summaries');
      historyList.innerHTML = '';
      
      if (summaries.length === 0) {
        historyList.innerHTML = `
          <div class="history-item">
            <p>No summaries yet. Start by summarizing a video!</p>
          </div>
        `;
        return;
      }

      // Sort by date, newest first
      summaries.sort((a, b) => new Date(b.date) - new Date(a.date));

      summaries.forEach((item, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
          <button class="delete-btn" title="Delete Summary">
            <i class="fas fa-times"></i>
          </button>
          <h3>${item.title || 'Unknown Video'}</h3>
          <p>${item.summary}</p>
          <button class="expand-btn">
            <span class="expand-text">Show More</span>
            <i class="fas fa-chevron-down"></i>
          </button>
          <div class="date">${new Date(item.date).toLocaleDateString()}</div>
        `;
        
        // Expand/collapse functionality
        const expandBtn = historyItem.querySelector('.expand-btn');
        const expandText = expandBtn.querySelector('.expand-text');
        
        expandBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isExpanded = historyItem.classList.toggle('expanded');
          expandText.textContent = isExpanded ? 'Show Less' : 'Show More';
        });

        // Delete button handler
        const deleteBtn = historyItem.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showDeleteConfirmation(historyItem, index);
        });
        
        historyList.appendChild(historyItem);
      });
    } catch (error) {
      console.error('Failed to load history:', error);
      showToast('Failed to load history', 'error');
    }
  }

  // Save summary to history when generated
  async function saveSummary(videoId, summary) {
    try {
      const { summaries } = await chrome.storage.local.get('summaries');
      const currentSummaries = summaries || [];
      
      // Find if there's an existing summary for this video
      const existingIndex = currentSummaries.findIndex(s => s.videoId === videoId);
      
      // Create new summary object with current timestamp
      const newSummary = {
        videoId,
        summary,
        timestamp: Date.now()
      };

      let updatedSummaries;
      if (existingIndex !== -1) {
        // Replace the old summary with the new one at the same position
        updatedSummaries = [...currentSummaries];
        updatedSummaries[existingIndex] = newSummary;
      } else {
        // Add new summary to the beginning
        updatedSummaries = [newSummary, ...currentSummaries];
        // Keep only the most recent 50 summaries
        if (updatedSummaries.length > 50) {
          updatedSummaries = updatedSummaries.slice(0, 50);
        }
      }

      await chrome.storage.local.set({ summaries: updatedSummaries });
      await displayHistory();
    } catch (error) {
      console.error('Error saving summary:', error);
    }
  }
});
