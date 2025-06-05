chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle content script messages (if needed for future features)
  if (request.action === 'transcriptElementsFound') {
    sendResponse({success: true});
    return true;
  }
  
  // Future message handlers can be added here
  console.log('Background script received message:', request);
  sendResponse({success: true, message: 'Message received'});
  return true;
});

// Background script is now simplified since transcript extraction 
// is handled directly in the frontend via DOM injection 