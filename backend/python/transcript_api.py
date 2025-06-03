from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs
from flask_cors import CORS
import os


app = Flask(__name__)
CORS(app)  # Enable cross-origin requests for frontend use

def get_video_id(url):
    query = urlparse(url)
    if query.hostname == 'youtu.be':
        return query.path[1:]
    if query.hostname in ('www.youtube.com', 'youtube.com'):
        return parse_qs(query.query).get('v', [None])[0]
    return None

@app.route("/transcript", methods=["POST"])
def get_transcript():
    data = request.get_json()
    url = data.get("url")
    video_id = get_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400
    try:
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        full_text = "\n".join([entry["text"] for entry in transcript])
        
        return jsonify({"transcript": full_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)