chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'parseXML') {
    try {
      console.log('Received XML to parse:', message.xmlText.substring(0, 200) + '...');
      
      // Check if XML is empty or invalid
      if (!message.xmlText || message.xmlText.trim() === '') {
        sendResponse({ success: false, error: 'Empty XML content' });
        return;
      }

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(message.xmlText, 'text/xml');
      
      // Check for parser errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        console.error('XML Parser Error:', parserError.textContent);
        sendResponse({ success: false, error: `XML parsing failed: ${parserError.textContent}` });
        return;
      }
      
      // Check if we have the expected structure
      const textElements = xmlDoc.getElementsByTagName('text');
      console.log('Found text elements:', textElements.length);
      
      if (textElements.length === 0) {
        // Try alternative parsing methods
        const transcript = tryAlternativeParsing(message.xmlText);
        if (transcript.length > 0) {
          sendResponse({ success: true, transcript });
          return;
        }
        sendResponse({ success: false, error: 'No text elements found in XML' });
        return;
      }
      
      const transcript = [];
      
      for (let i = 0; i < textElements.length; i++) {
        const element = textElements[i];
        const text = decodeHTMLEntities(element.textContent || element.innerText || '');
        const start = parseFloat(element.getAttribute('start') || '0');
        const duration = parseFloat(element.getAttribute('dur') || '0');
        
        if (text.trim()) {
          transcript.push({
            text: text.trim(),
            start: Math.round(start * 100) / 100,
            duration: Math.round(duration * 100) / 100,
            end: Math.round((start + duration) * 100) / 100
          });
        }
      }
      
      console.log('Parsed transcript segments:', transcript.length);
      sendResponse({ success: true, transcript });
    } catch (error) {
      console.error('Parsing error:', error);
      sendResponse({ success: false, error: error.message });
    }
  }
});

function tryAlternativeParsing(xmlText) {
  try {
    // Try parsing as JSON (sometimes YouTube returns JSON instead of XML)
    const jsonData = JSON.parse(xmlText);
    if (jsonData.events) {
      return jsonData.events.map(event => ({
        text: event.segs ? event.segs.map(seg => seg.utf8).join('') : '',
        start: event.tStartMs / 1000,
        duration: event.dDurationMs / 1000,
        end: (event.tStartMs + event.dDurationMs) / 1000
      })).filter(item => item.text.trim());
    }
  } catch (e) {
    // Not JSON, try other methods
  }
  
  // Try regex extraction for simple text
  const textMatches = xmlText.match(/<text[^>]*>(.*?)<\/text>/g);
  if (textMatches) {
    return textMatches.map((match, index) => {
      const text = match.replace(/<[^>]*>/g, '');
      return {
        text: decodeHTMLEntities(text).trim(),
        start: index * 5, // Approximate timing
        duration: 5,
        end: (index + 1) * 5
      };
    }).filter(item => item.text);
  }
  
  return [];
}

function decodeHTMLEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  return textArea.value;
}
