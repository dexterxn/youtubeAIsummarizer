document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('button');
  const summaryBox = document.getElementById('summary-box');
  const input = document.getElementById('youtube-link');

  button.addEventListener('click', async () => {
    const link = input.value;
    summaryBox.textContent = "Processing transcript...";

    try {
      // Step 1: Fetch transcript from Python API
      console.log("link: ", link);
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
      const summaryRes = await fetch('http://localhost:3000/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcriptData.transcript }) // <- using transcript, not URL
      });

      const summaryData = await summaryRes.json();
      summaryBox.textContent = summaryData.summary || "No summary found.";

    } catch (err) {
      summaryBox.textContent = "Error occurred.";
      console.error(err);
    }
  });
});
