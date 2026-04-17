# Vision-Verse 👁️📚

An accessible, AI-powered online examination system designed specifically for students with visual and motor impairments. Vision-Verse leverages modern web technologies and computer vision to create an inclusive testing environment.

[![GitHub Repository](https://img.shields.io/badge/GitHub-KartikChincholkar%2FVision--Verse-blue?logo=github)](https://github.com/KartikChincholkar/Vision-Verse)

## ⚡ Direct CLI Commands to Run the Project

If you want to quickly set up and run the project from scratch, simply copy and paste these direct CLI commands into your terminal:

### For Windows (Command Prompt / PowerShell)
```cmd
# 1. Clone the repository and navigate into it
git clone https://github.com/KartikChincholkar/Vision-Verse.git
cd Vision-Verse

# 2. Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate

# 3. Install required Python packages
pip install flask flask-socketio flask-session eventlet opencv-python "mediapipe>=0.10.9"

# 4. Download the MediaPipe hand tracking AI model
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" -OutFile "hand_landmarker.task"

# 5. Launch the application
python app.py
```

### For macOS / Linux
```bash
# 1. Clone the repository and navigate into it
git clone https://github.com/KartikChincholkar/Vision-Verse.git
cd Vision-Verse

# 2. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate

# 3. Install required Python packages
pip install flask flask-socketio flask-session eventlet opencv-python "mediapipe>=0.10.9"

# 4. Download the MediaPipe hand tracking AI model
curl -sL https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task -o hand_landmarker.task

# 5. Launch the application
python app.py
```
*(Once running, open your browser and navigate to: http://127.0.0.1:5000)*

---

## ✨ Core Features

- **Dual Mode Accessibility**: Tailored interfaces and interaction modes for both visually impaired and motor-impaired students.
- **AI Hand Gesture Recognition (Gesture Mode)**: Uses Google MediaPipe and OpenCV to allow students with visual impairments to answer questions using simple hand gestures without a keyboard:
  - 👆 **1 Finger** → Option A
  - ✌️ **2 Fingers** → Option B
  - 🤟 **3 Fingers** → Option C
  - 💐 **4 Fingers** → Option D
  - 👍 **Thumb Up** → Confirm & Next Question / Submit
- **Voice-Driven Commands (Voice Mode)**: Integrates the Web Speech API so students with motor impairments can navigate and answer purely using voice commands.
- **Text-to-Speech (TTS)**: Automatically reads questions and options aloud to ensure a hands-free and eyes-free experience.
- **Dynamic Content**: Questions list (`questions.json`) and student accounts (`students.json`) are fetched from flexible local JSON databases.

## 🛠️ Tech Stack

- **Backend**: Python, Flask, Flask-SocketIO, Eventlet
- **Computer Vision**: OpenCV (`cv2`), MediaPipe Tasks API (`HandLandmarker`)
- **Frontend**: HTML5, Vanilla CSS, JavaScript
- **APIs**: Web Speech API (Speech Recognition & Synthesis)

---

## 📁 Project Structure

```text
Vision-Verse/
├── app.py                   # Main Flask backend and routing 
├── gesture_engine.py        # OpenCV & MediaPipe hand tracking background worker
├── hand_landmarker.task     # Downloaded MediaPipe AI Model 
├── data/                    
│   ├── students.json        # Database of student credentials
│   └── questions.json       # Database of exam questions
├── static/
│   ├── images/logo.png      #VisionVerse logo          
│   ├── css/style.css        # Custom UI styling and responsive layouts
│   └── js/                  # Application networking and frontend logic hooks
└── templates/               
    ├── login.html           # Authentication portal
    ├── home.html            # Exam mode selection page
    ├── permissions.html     # Pre-flight hardware checks
    └── exam.html            # Core examination interface
```

