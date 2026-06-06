# Tuwa Call — Zoom-like Video Calling App

A complete, production-ready **video conferencing application** similar to Zoom, built entirely from scratch using modern web technologies.

![Tuwa Call](https://via.placeholder.com/1200x630/18181b/3b82f6?text=Tuwa+Call+-+Secure+Video+Meetings)

## ✨ Features

- **Multi-participant video calls** (mesh WebRTC — works great for 2–8 people)
- **Screen sharing** with one-click start/stop + automatic track replacement
- **Real-time text chat** in a beautiful sidebar
- **Mute/unmute microphone** and **start/stop video** with synced status indicators across all participants
- **Professional dark UI** inspired by Zoom (zinc + blue accents, smooth interactions)
- **Dynamic video grid** that adapts beautifully to 1, 2, 3–4, or many participants
- **Meeting timer** and participant counter
- **One-click room ID copy** + easy sharing
- **Keyboard shortcuts**: `M` = toggle mic, `V` = toggle camera, `Shift + ?` = toggle chat
- **Responsive** and works on desktop + tablets
- **No account required** — just enter name + meeting ID

## 🛠 Tech Stack

| Layer       | Technology                          | Purpose                              |
|-------------|-------------------------------------|--------------------------------------|
| Backend     | Node.js + Express + Socket.IO       | Signaling server for WebRTC          |
| Frontend    | Vanilla JS + Tailwind CSS (CDN)     | UI + WebRTC logic                    |
| Media       | WebRTC (getUserMedia + RTCPeerConnection) | Peer-to-peer audio/video        |
| Styling     | Tailwind Play CDN + Font Awesome    | Modern professional look             |

## 📁 Project Structure

```
zoom-clone/
├── package.json
├── server.js                 # Signaling + room management
├── README.md
└── public/
    ├── index.html            # Complete UI (join + call screens)
    └── app.js                # All WebRTC, Socket, UI logic
```

## 🚀 Quick Start (Ready to Use)

### 1. Install dependencies

```bash
cd zoom-clone
npm install
```

### 2. Start the server

```bash
npm start
```

You will see:

```
🚀 Zoom Clone Server Started Successfully
Open in browser: http://localhost:3000
```

### 3. Open in browser

Go to **http://localhost:3000**

- Enter your display name
- Use the pre-generated Meeting ID or click **New** to create one
- Click **Join Meeting**
- Allow camera & microphone when prompted
- Share the Meeting ID with friends/colleagues

Multiple people can join the same Meeting ID from different tabs or devices on the same network (or over internet if deployed).

## 📝 The Prompt Used to Build This App

> Create a fully functional, production-ready video calling web application similar to Zoom using modern web technologies.
>
> **Tech Stack:**
> - Backend: Node.js with Express and Socket.IO for real-time signaling.
> - Frontend: Single-page application with HTML5, Tailwind CSS (via CDN), Vanilla JavaScript.
> - WebRTC for peer-to-peer audio and video with mesh topology for small groups.
> - Use public STUN servers.
>
> **Core Requirements:**
> - Clean join screen with name + room ID (generate button)
> - In-call experience with header (room info, timer, participants), adaptive video grid, bottom control bar (mic, camera, screen share, chat, leave)
> - Right sidebar chat with real-time messages
> - Full WebRTC implementation: peer connection management, offer/answer/ICE forwarding via Socket.IO, dynamic video tile creation, screen sharing using `replaceTrack`
> - Media state synchronization (mute indicators visible to everyone)
> - Beautiful professional dark theme matching Zoom aesthetics
> - Proper cleanup on leave/disconnect
> - Keyboard shortcuts and nice UX touches (toasts, avatars when video off, etc.)
>
> Output complete working code with package.json, server.js, index.html, and app.js. Include comments, error handling, and a detailed README.

This prompt was used to guide the creation of every file in this project.

## ⚠️ Limitations & Production Notes

**Current limitations (demo scope):**
- Uses **mesh topology** — every participant connects directly to every other. Fine up to ~6–8 people. For larger meetings you need an **SFU** (Selective Forwarding Unit) like mediasoup, LiveKit, or Jitsi.
- No **TURN server** — connections may fail for users behind strict corporate firewalls/NAT. In production add a TURN server (coturn, Twilio, Metered.ca, etc.).
- No authentication, persistent rooms, or recording.
- No end-to-end encryption UI (WebRTC is encrypted in transit by default).
- Chat and media state are not persisted.

**Recommended production upgrades:**
1. Add a TURN server
2. Replace mesh with **mediasoup** or **LiveKit** for 20+ participants
3. Add user authentication (JWT + login page)
4. Implement recording using `MediaRecorder` + server upload
5. Add virtual backgrounds / blur (using TensorFlow.js or MediaPipe)
6. Deploy on Vercel / Railway / Render with proper SSL
7. Add participant list sidebar + raise hand feature

## 🧠 How WebRTC + Socket.IO Works Here

1. User joins → `getUserMedia()` gets local camera/mic
2. Socket.IO connects → emits `join-room`
3. Server sends existing participants → new user creates offers to all
4. Existing users receive `user-joined` → prepare `RTCPeerConnection`
5. New user sends `offer` → recipient replies with `answer`
6. ICE candidates exchanged until connection established
7. `ontrack` fires → remote video tile created and stream attached
8. Screen share uses `replaceTrack()` on all senders

## 📄 License

MIT — feel free to use, modify, and deploy for personal or commercial projects.

---

Built from scratch for **Tuwa InvestWise** by Grok (xAI) — June 2026.

Enjoy your meetings! 🎥
