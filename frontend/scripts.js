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

  summarizeBtn.addEventListener('click', async () => {
    if (!window.currentVideoInfo || !window.currentVideoInfo.success) {
      showToast("Please navigate to a YouTube video page first", "error");
      return;
    }

    setLoadingState(true);

    try {
      const transcriptResult = await getTranscript(window.currentVideoInfo.videoId, window.currentVideoInfo.tabId);
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

      showToast("Transcript extracted successfully!");
      
      // Send transcript to summarization API
    //   const summaryRes = await fetch('https://groq-summarizer-730135335149.us-central1.run.app/api/summarize', {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ transcript: transcriptResult.fullText })
    //   });

    //   if (!summaryRes.ok) {
    //     throw new Error(`Server error: ${summaryRes.status} ${summaryRes.statusText}`);
    //   }

    //   const summaryData = await summaryRes.json();
      
    //   if (summaryData.summary) {
    //     summaryBox.textContent = summaryData.summary;
    //     showToast("Summary generated successfully!", "success");
    //   } else if (summaryData.error) {
    //     summaryBox.textContent = `Summary Error: ${summaryData.error}`;
    //     showToast("Failed to generate summary", "error");
    //   } else {
    //     summaryBox.textContent = "No summary was generated. Please try again.";
    //     showToast("No summary generated", "error");
    //   }
    // } catch (err) {
    //   console.error('Summarization error:', err);
    //   let errorMessage = "An error occurred while processing your request.";
      
    //   if (err.message.includes('fetch')) {
    //     errorMessage = "Network error: Unable to connect to the summarization service.";
    //   } else if (err.message.includes('Server error')) {
    //     errorMessage = `Server error: ${err.message}`;
    //   }
      
    //   summaryBox.textContent = `Error: ${errorMessage}`;
      summaryBox.textContent = transcriptResult.fullText;
      // showToast("Failed to generate summary", "error");
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
});
