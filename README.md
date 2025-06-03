# 🎥 YouTube AI Summarizer Chrome Extension

A modern Chrome extension that extracts YouTube video transcripts and generates AI-powered summaries using your existing Groq backend.

## ✨ Features

- **Advanced Transcript Extraction**: Multi-method approach to reliably get transcripts from YouTube videos
- **Smart Error Handling**: Comprehensive error messages and user feedback
- **Modern UI**: Beautiful, responsive design with loading animations
- **Auto-Detection**: Automatically fills in the current YouTube video URL
- **Keyboard Support**: Press Enter to start summarization
- **Copy to Clipboard**: Easy one-click copying of summaries
- **Chrome Web Store Ready**: Fully compliant with Chrome extension policies

## 🚀 Enhanced Transcript Extraction

The extension now uses a robust three-method approach to extract transcripts:

1. **Direct Timedtext API**: Multiple language and format combinations
2. **Video Page Extraction**: Extracts from YouTube's embedded player data
3. **Innertube API**: Fallback using YouTube's internal API

Supports multiple transcript formats:
- JSON (srv3)
- XML/TTML
- WebVTT
- Auto-generated captions
- Manual captions

## 🔧 Setup Instructions

### 1. Backend (Your Groq Service)
Your backend at `https://groq-summarizer-730135335149.us-central1.run.app/api/summarize` is already working! No changes needed.

### 2. Install the Extension

1. **Load in Chrome**:
   ```
   1. Open Chrome and go to: chrome://extensions/
   2. Enable "Developer Mode" (top-right toggle)
   3. Click "Load Unpacked"
   4. Select your project folder
   ```

2. **Use the Extension**:
   - Click the extension icon in your toolbar
   - Paste a YouTube URL or it will auto-fill if you're on a YouTube video
   - Click "Summarize" or press Enter
   - Copy the summary when ready!

## 🛠️ Technical Improvements

### Enhanced Error Handling
- Clear, user-friendly error messages
- Network error detection
- Transcript validation
- Server response handling

### Better User Experience
- Loading states with animations
- Toast notifications with different types (success, error, info)
- Auto-fill current YouTube video
- Keyboard shortcuts
- Responsive design

### Robust Transcript Extraction
- Multiple YouTube API endpoints
- Fallback mechanisms
- Support for various caption formats
- Better parsing for edge cases

## 📁 Project Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Enhanced transcript extraction logic
├── offscreen.js           # XML parsing in offscreen document
├── offscreen.html         # Offscreen document for DOM parsing
├── frontend/
│   ├── index.html         # Modern popup UI
│   ├── scripts.js         # Enhanced frontend logic
│   ├── style.css          # Beautiful modern styling
│   └── assets/            # Extension icons
└── README.md              # This file
```

## 🔍 Debugging

The extension includes comprehensive logging. To debug:

1. **Open Chrome DevTools** for the extension:
   - Right-click extension → "Inspect popup"
   - Or go to `chrome://extensions/` → Details → "Inspect views: popup"

2. **Check console logs** for:
   - Transcript extraction attempts
   - API responses
   - Error details

3. **Common issues**:
   - **"No transcript available"**: Video has no captions/transcripts
   - **"Private/restricted video"**: Video is not publicly accessible
   - **Network errors**: Check your backend service status

## 🚀 Chrome Web Store Deployment

Your extension is now ready for the Chrome Web Store! It includes:

- ✅ Proper manifest v3 configuration
- ✅ Secure API calls with proper headers
- ✅ Content Security Policy compliance
- ✅ No external dependencies
- ✅ User-friendly error handling
- ✅ Modern, responsive UI

## 🎯 Usage Tips

1. **Works best with**: Videos that have captions (auto-generated or manual)
2. **Supports**: Regular videos, Shorts, live streams
3. **Languages**: Prioritizes English captions but can handle others
4. **Video length**: Works with any length video (transcript is sent to your backend)

## 🔧 Backend Integration

Your backend should expect:
```json
POST /api/summarize
{
  "transcript": "Full video transcript text..."
}
```

And return:
```json
{
  "summary": "AI-generated summary of the video..."
}
```

## 📄 License

Please refer to LICENSE file.

---

## 🎉 Ready to Use!

Your extension now has robust transcript extraction that should work with most YouTube videos. The enhanced error handling will help users understand any issues, and the modern UI provides a great user experience.

Test it with various YouTube videos to see the improved transcript extraction in action!
