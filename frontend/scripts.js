document.addEventListener('DOMContentLoaded', () => {
  const summarizeBtn = document.getElementById('summarize-btn');
  const copyBtn = document.getElementById('copy-btn');
  const summaryBox = document.getElementById('summary-box');
  const input = document.getElementById('youtube-link');

  summarizeBtn.addEventListener('click', async () => {
    const link = input.value;
    summaryBox.textContent = "Processing transcript...";

    try {
      // Step 1: Fetch transcript from Python API
      const transcriptRes = await fetch('http://localhost:5000/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link })
      });

      const transcriptData = await transcriptRes.json();

      if (!transcriptData.transcript) {
        summaryBox.textContent = "Transcript not available.";
        return;
      }

      // Step 2: Send transcript to summarization API
      summaryBox.textContent = "Summarizing...";
      const summaryRes = await fetch('https://groq-summarizer-730135335149.us-central1.run.app/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcriptData.transcript })
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
