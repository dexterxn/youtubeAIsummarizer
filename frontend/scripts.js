function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
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
    const videoId = extractVideoId(url); // Add this function
    if (!videoId) {
      return { success: false, error: 'Invalid YouTube URL provided' };
    }

    // Send message to background script
    const response = await chrome.runtime.sendMessage({
      action: 'fetchTranscript',
      videoId: videoId
    });

    if (response.success) {
      const fullText = response.transcript.map(segment => segment.text).join(' ');
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
      return { success: false, error: response.error };
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return { success: false, error: error.message };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarize-btn');
  const copyBtn = document.getElementById('copy-btn');
  const summaryBox = document.getElementById('summary-box');
  const input = document.getElementById('youtube-link');

  summarizeBtn.addEventListener('click', async () => {
    const link = input.value;
    if (!link) {
      summaryBox.textContent = "Please enter a YouTube URL";
      return;
    }

    summaryBox.textContent = "Processing transcript...";

    try {
      const transcriptResult = await getTranscript(link);
      console.log("Transcript fetched:", transcriptResult);

      if (!transcriptResult.success) {
        summaryBox.textContent = `Error: ${transcriptResult.error}`;
        return;
      }

      // Step 2: Send transcript to summarization API
      summaryBox.textContent = "Summarizing...";
      const summaryRes = await fetch('https://groq-summarizer-730135335149.us-central1.run.app/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptResult.fullText })
      });

      const summaryData = await summaryRes.json();
      summaryBox.textContent = summaryData.summary || "No summary found.";
    } catch (err) {
      summaryBox.textContent = "Error occurred.";
      console.error(err);
    }
  });
  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000); // 2 seconds
  }

  copyBtn.addEventListener('click', () => {
    const text = summaryBox.textContent || summaryBox.innerText;
    if (!text || text.trim() === "Summary will appear here...") {
      showToast("There's no summary to copy!");
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => showToast("Summary copied to clipboard!"))
      .catch(err => console.error("Failed to copy text: ", err));
  });
});
