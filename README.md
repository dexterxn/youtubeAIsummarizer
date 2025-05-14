# 📽️ YouTube AI Summarizer – Setup Guide

This guide will walk you through how to get your YouTube AI Summarizer project up and running. It includes a **Node.js backend** for summarization, a **Python backend** for transcript extraction, and a **Chrome extension** frontend.

---

## 🧱 Step 1: Set Up the Project

### A. Clone and Unzip

1. Clone this repository:
   ```
   git clone https://github.com/dexterxn/Chrome-Extension-Base-Template.git
   ```
   Or download and unzip it manually.

2. Navigate into the project directory:
   ```
   cd your-repo
   ```

---

### B. Install Node.js Dependencies

```bash
npm install express body-parser groq-sdk dotenv
npm install --save-dev nodemon
```

> This installs all the Node dependencies needed for the summarization API and auto-reloading with `nodemon`.

---

### C. Install Python Dependencies

```bash
pip install Flask flask-cors youtube-transcript-api
```

> This installs Flask for your Python server and the `youtube-transcript-api` for fetching YouTube captions.

---

## 🔑 Step 2: Set Up Your Groq API Key

1. Go to [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign in and **generate a new API key**.
3. In your project directory, create a `.env` file and add:

```
GROQ_API_KEY=your_api_key_here
```

> Make sure to replace `your_api_key_here` with your actual API key.

---

## 🚀 Step 3: Start the Backends

### A. Start the Node.js summarization server

```bash
npx nodemon server.js
```

### B. Start the Python transcript service

```bash
python transcript_api.py
```

---

## 🧩 Step 4: Add the Chrome Extension

1. Open Chrome and go to:  
   ```
   chrome://extensions/
   ```

2. In the top-right, enable **Developer Mode**.

3. Click **Load Unpacked**.

4. Select the **unzipped project folder**.

5. The extension will now appear in your toolbar.  
   After making changes to the extension code, click **Reload** on the extension page to apply updates.

---

## 📄 License
Please refer to LICENSE file.
