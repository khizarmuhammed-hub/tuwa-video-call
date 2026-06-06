// ============================================
// Tuwa Call - Zoom-like Video Calling App
// Built with WebRTC + Socket.IO
// ============================================

// Global State
let localStream = null;
let screenStream = null;
let originalVideoTrack = null;
let peerConnections = {}; // { socketId: RTCPeerConnection }
let socket = null;
let currentRoomId = null;
let currentUserName = null;
let currentUserId = null;
let isMicMuted = false;
let isCameraOff = false;
let isScreenSharing = false;
let meetingTimerInterval = null;
let startTime = null;

// STUN servers (public, free)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

// Tailwind script already loaded in HTML. Configure dark mode etc.
function initTailwind() {
    document.documentElement.style.setProperty('--accent', '#3b82f6');
}

// Generate a nice short room ID
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    document.getElementById('room-id').value = result;
}

// Show toast notification
function showToast(message, duration = 2800) {
    const toast = document.getElementById('toast');
    const text = document.getElementById('toast-text');
    text.textContent = message;
    toast.style.display = 'flex';
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.style.transition = 'all 0.2s ease';
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transition = '';
            toast.style.display = 'none';
            toast.classList.add('hidden');
        }, 180);
    }, duration);
}

// Copy room ID to clipboard
function copyRoomId() {
    if (!currentRoomId) return;
    
    navigator.clipboard.writeText(currentRoomId).then(() => {
        const originalText = event.currentTarget?.innerHTML;
        showToast('Meeting ID copied to clipboard!');
        
        // Also show full join link hint
        setTimeout(() => {
            showToast('Share this ID with participants', 2200);
        }, 900);
    }).catch(() => {
        // Fallback
        prompt('Copy this Meeting ID:', currentRoomId);
    });
}

// Update participant count badge
function updateParticipantCount() {
    const countEl = document.getElementById('participant-count');
    const videoGrid = document.getElementById('video-grid');
    const tiles = videoGrid.querySelectorAll('.video-tile');
    
    // Count = local + remotes
    let count = tiles.length;
    countEl.textContent = count;
    
    // Update grid layout based on number of participants
    updateVideoGridLayout(count);
}

// Dynamic responsive grid layout
function updateVideoGridLayout(count) {
    const grid = document.getElementById('video-grid');
    
    // Reset classes
    grid.className = 'video-grid flex-1 grid gap-3 p-4 content-center bg-zinc-950';
    
    if (count === 1) {
        grid.style.gridTemplateColumns = '1fr';
        grid.style.maxWidth = '860px';
        grid.style.margin = '0 auto';
    } else if (count === 2) {
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(420px, 1fr))';
        grid.style.maxWidth = '100%';
        grid.style.margin = '0';
    } else if (count <= 4) {
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
    } else if (count <= 6) {
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
    } else {
        grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
    }
}

// Create or update a video tile
function createVideoTile(userId, userName, stream, isLocal = false) {
    const grid = document.getElementById('video-grid');
    
    // Remove existing tile if present (for reconnection cases)
    const existing = document.getElementById(`tile-${userId}`);
    if (existing) existing.remove();

    const tile = document.createElement('div');
    tile.id = `tile-${userId}`;
    tile.className = `video-tile group ${isLocal ? 'ring-2 ring-blue-600/60' : ''}`;
    
    // Video element
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = isLocal; // Mute local to prevent echo
    video.className = 'w-full h-full object-cover';
    
    if (stream) {
        video.srcObject = stream;
    } else {
        // Placeholder until stream arrives
        video.style.background = '#111827';
    }

    // Overlay with name + status
    const overlay = document.createElement('div');
    overlay.className = `video-overlay absolute inset-x-0 bottom-0 h-12 flex items-end px-3 pb-2.5`;
    
    const nameContainer = document.createElement('div');
    nameContainer.className = 'flex items-center justify-between w-full';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'flex items-center gap-x-2';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'participant-label text-white px-2.5 py-px bg-black/40 backdrop-blur-md rounded-full';
    nameSpan.textContent = isLocal ? `${userName} (You)` : userName;
    
    // Status icons container
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex items-center gap-x-1.5 pr-1';
    statusDiv.innerHTML = `
        <div id="status-mic-${userId}" class="hidden w-5 h-5 flex items-center justify-center text-red-400">
            <i class="fa-solid fa-microphone-slash text-xs"></i>
        </div>
        <div id="status-video-${userId}" class="hidden w-5 h-5 flex items-center justify-center text-red-400">
            <i class="fa-solid fa-video-slash text-xs"></i>
        </div>
    `;
    
    nameDiv.appendChild(nameSpan);
    nameContainer.appendChild(nameDiv);
    nameContainer.appendChild(statusDiv);
    overlay.appendChild(nameContainer);
    
    // Avatar placeholder (shown when video is off)
    const avatar = document.createElement('div');
    avatar.id = `avatar-${userId}`;
    avatar.className = `absolute inset-0 hidden items-center justify-center tile-avatar`;
    avatar.innerHTML = `
        <div class="text-center">
            <div class="w-16 h-16 mx-auto bg-white/10 backdrop-blur rounded-full flex items-center justify-center ring-4 ring-white/10">
                <i class="fa-solid fa-user text-4xl text-white/80"></i>
            </div>
            <div class="mt-3 text-xs text-white/70 font-medium tracking-tight">${userName}</div>
        </div>
    `;
    
    tile.appendChild(video);
    tile.appendChild(overlay);
    tile.appendChild(avatar);
    
    // Store references for later control
    tile.videoElement = video;
    tile.avatarElement = avatar;
    
    grid.appendChild(tile);
    
    // Update layout
    updateParticipantCount();
    
    return tile;
}

// Remove a video tile
function removeVideoTile(userId) {
    const tile = document.getElementById(`tile-${userId}`);
    if (tile) {
        // Stop any playing video
        const video = tile.querySelector('video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        tile.remove();
    }
    updateParticipantCount();
}

// Add local video tile immediately
function addLocalVideoTile() {
    const userId = currentUserId || 'local';
    const tile = createVideoTile(userId, currentUserName, localStream, true);
    
    // Store reference
    window.localTile = tile;
    
    // Initially show avatar if camera starts off (rare)
    if (isCameraOff) {
        showVideoOffState(userId, true);
    }
}

// Create peer connection for a remote user
function createPeerConnection(remoteId, remoteName, isInitiator = false) {
    if (peerConnections[remoteId]) {
        console.log('Peer connection already exists for', remoteId);
        return peerConnections[remoteId];
    }

    console.log(`Creating peer connection with ${remoteName} (${remoteId}). Initiator: ${isInitiator}`);

    const pc = new RTCPeerConnection(iceServers);
    peerConnections[remoteId] = pc;

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    // Handle incoming remote stream
    pc.ontrack = (event) => {
        console.log(`Received remote track from ${remoteName}`);
        const remoteStream = event.streams[0];
        
        let tile = document.getElementById(`tile-${remoteId}`);
        
        if (!tile) {
            // Create tile now that we have stream
            tile = createVideoTile(remoteId, remoteName, remoteStream, false);
        } else {
            // Update existing placeholder tile
            const videoEl = tile.querySelector('video');
            if (videoEl) videoEl.srcObject = remoteStream;
            
            // Hide avatar if it was showing
            const avatar = tile.querySelector(`#avatar-${remoteId}`);
            if (avatar) avatar.style.display = 'none';
        }
        
        // Store stream reference
        if (tile) tile.remoteStream = remoteStream;
    };

    // ICE candidate handling
    pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
            socket.emit('ice-candidate', {
                to: remoteId,
                candidate: event.candidate
            });
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${remoteName}:`, pc.connectionState);
        
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            // Attempt to recover or clean up
            setTimeout(() => {
                if (pc.connectionState === 'failed' && peerConnections[remoteId]) {
                    console.warn('Connection failed, cleaning up peer:', remoteId);
                    removePeer(remoteId);
                }
            }, 2500);
        }
    };

    // If we are the initiator, create and send offer
    if (isInitiator && localStream) {
        pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            socket.emit('offer', {
                to: remoteId,
                offer: pc.localDescription,
                fromName: currentUserName
            });
        })
        .catch(err => console.error('Error creating offer:', err));
    }

    return pc;
}

// Remove peer connection and its tile
function removePeer(remoteId) {
    const pc = peerConnections[remoteId];
    if (pc) {
        pc.close();
        delete peerConnections[remoteId];
    }
    removeVideoTile(remoteId);
}

// Setup all Socket.IO event listeners
function setupSocketListeners() {
    if (!socket) return;

    socket.on('connect', () => {
        console.log('✅ Connected to signaling server. Socket ID:', socket.id);
        currentUserId = socket.id;
    });

    // Received when you first join a room (list of people already there)
    socket.on('room-users', (users) => {
        console.log('Existing users in room:', users);
        
        users.forEach(user => {
            // We (the new joiner) initiate the connection
            createPeerConnection(user.id, user.name, true);
        });
    });

    // Someone new joined the room (we are existing participant)
    socket.on('user-joined', (user) => {
        console.log('New user joined:', user);
        showToast(`${user.name} joined the meeting`);
        
        // Prepare connection but do NOT create offer yet — wait for their offer
        createPeerConnection(user.id, user.name, false);
        
        updateParticipantCount();
    });

    // WebRTC signaling
    socket.on('offer', async ({ from, offer, fromName }) => {
        console.log(`Received offer from ${fromName}`);
        
        let pc = peerConnections[from];
        if (!pc) {
            pc = createPeerConnection(from, fromName, false);
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            socket.emit('answer', {
                to: from,
                answer: pc.localDescription
            });
        } catch (err) {
            console.error('Error handling offer:', err);
        }
    });

    socket.on('answer', async ({ from, answer }) => {
        const pc = peerConnections[from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (err) {
                console.error('Error setting remote answer:', err);
            }
        }
    });

    socket.on('ice-candidate', async ({ from, candidate }) => {
        const pc = peerConnections[from];
        if (pc && candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (err) {
                console.warn('Error adding ICE candidate:', err);
            }
        }
    });

    socket.on('user-left', ({ id, name }) => {
        console.log(`${name} left the meeting`);
        showToast(`${name} left the meeting`);
        removePeer(id);
    });

    // Chat messages
    socket.on('chat-message', (data) => {
        addChatMessage(data.fromName, data.message, data.timestamp, false);
    });

    // Remote user changed mic/video state
    socket.on('media-state-change', ({ userId, type, enabled }) => {
        updateRemoteMediaState(userId, type, enabled);
    });

    socket.on('error', (data) => {
        showToast(data.message || 'An error occurred');
    });
}

// Update remote participant's mic/video status icon
function updateRemoteMediaState(userId, type, enabled) {
    const micStatus = document.getElementById(`status-mic-${userId}`);
    const videoStatus = document.getElementById(`status-video-${userId}`);
    
    if (!micStatus || !videoStatus) return;

    if (type === 'audio') {
        if (!enabled) {
            micStatus.classList.remove('hidden');
            micStatus.style.display = 'flex';
        } else {
            micStatus.style.display = 'none';
        }
    }
    
    if (type === 'video') {
        const tile = document.getElementById(`tile-${userId}`);
        const avatar = document.getElementById(`avatar-${userId}`);
        
        if (!enabled) {
            videoStatus.style.display = 'flex';
            if (avatar && tile) {
                avatar.style.display = 'flex';
                const videoEl = tile.querySelector('video');
                if (videoEl) videoEl.style.opacity = '0.15';
            }
        } else {
            videoStatus.style.display = 'none';
            if (avatar) avatar.style.display = 'none';
            const videoEl = tile ? tile.querySelector('video') : null;
            if (videoEl) videoEl.style.opacity = '1';
        }
    }
}

// Show/hide avatar when local video is toggled off
function showVideoOffState(userId, show) {
    const tile = document.getElementById(`tile-${userId}`);
    if (!tile) return;
    
    const avatar = document.getElementById(`avatar-${userId}`);
    const video = tile.querySelector('video');
    
    if (show) {
        if (avatar) avatar.style.display = 'flex';
        if (video) video.style.opacity = '0.1';
    } else {
        if (avatar) avatar.style.display = 'none';
        if (video) video.style.opacity = '1';
    }
}

// Toggle local microphone
function toggleMicrophone() {
    if (!localStream) return;

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    isMicMuted = !isMicMuted;
    audioTrack.enabled = !isMicMuted;

    const btn = document.getElementById('mic-btn');
    const icon = btn.querySelector('i');
    
    if (isMicMuted) {
        btn.classList.add('muted', 'bg-red-600', 'border-red-500');
        btn.classList.remove('bg-zinc-800', 'hover:bg-zinc-700');
        icon.classList.remove('fa-microphone');
        icon.classList.add('fa-microphone-slash');
        btn.querySelector('span').textContent = 'Unmute';
        
        // Sync to others
        if (socket && currentRoomId) {
            socket.emit('media-state-change', {
                roomId: currentRoomId,
                type: 'audio',
                enabled: false
            });
        }
    } else {
        btn.classList.remove('muted', 'bg-red-600', 'border-red-500');
        btn.classList.add('bg-zinc-800', 'hover:bg-zinc-700');
        icon.classList.remove('fa-microphone-slash');
        icon.classList.add('fa-microphone');
        btn.querySelector('span').textContent = 'Mute';
        
        if (socket && currentRoomId) {
            socket.emit('media-state-change', {
                roomId: currentRoomId,
                type: 'audio',
                enabled: true
            });
        }
    }
}

// Toggle local camera
function toggleCamera() {
    if (!localStream) return;

    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    isCameraOff = !isCameraOff;
    videoTrack.enabled = !isCameraOff;

    const btn = document.getElementById('camera-btn');
    const icon = btn.querySelector('i');
    
    const localUserId = currentUserId || 'local';
    
    if (isCameraOff) {
        btn.classList.add('muted', 'bg-red-600', 'border-red-500');
        btn.classList.remove('bg-zinc-800', 'hover:bg-zinc-700');
        icon.classList.remove('fa-video');
        icon.classList.add('fa-video-slash');
        btn.querySelector('span').textContent = 'Start Video';
        
        showVideoOffState(localUserId, true);
        
        if (socket && currentRoomId) {
            socket.emit('media-state-change', {
                roomId: currentRoomId,
                type: 'video',
                enabled: false
            });
        }
    } else {
        btn.classList.remove('muted', 'bg-red-600', 'border-red-500');
        btn.classList.add('bg-zinc-800', 'hover:bg-zinc-700');
        icon.classList.remove('fa-video-slash');
        icon.classList.add('fa-video');
        btn.querySelector('span').textContent = 'Stop Video';
        
        showVideoOffState(localUserId, false);
        
        if (socket && currentRoomId) {
            socket.emit('media-state-change', {
                roomId: currentRoomId,
                type: 'video',
                enabled: true
            });
        }
    }
}

// Toggle screen sharing
async function toggleScreenShare() {
    const btn = document.getElementById('screen-btn');
    
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                    cursor: "always",
                    displaySurface: "monitor"
                },
                audio: false
            });

            const screenTrack = screenStream.getVideoTracks()[0];
            originalVideoTrack = localStream.getVideoTracks()[0];

            // Replace video track in all peer connections
            Object.keys(peerConnections).forEach(remoteId => {
                const pc = peerConnections[remoteId];
                const sender = pc.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                if (sender) {
                    sender.replaceTrack(screenTrack).catch(console.error);
                }
            });

            // Update local preview to show what is being shared
            const localTile = document.getElementById(`tile-${currentUserId || 'local'}`);
            if (localTile) {
                const videoEl = localTile.querySelector('video');
                if (videoEl) videoEl.srcObject = screenStream;
            }

            // Show banner
            document.getElementById('screen-share-banner').classList.remove('hidden');
            document.getElementById('screen-share-banner').classList.add('flex');

            // Button state
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-500');
            btn.classList.remove('bg-zinc-800');
            btn.innerHTML = `
                <i class="fa-solid fa-stop text-xl mb-0.5"></i>
                <span class="text-[10px] font-medium tracking-tight">Stop Share</span>
            `;

            isScreenSharing = true;

            // Auto stop when user stops sharing from browser UI
            screenTrack.onended = () => {
                stopScreenShare();
            };

            showToast('Screen sharing started');

        } catch (err) {
            console.error('Screen share error:', err);
            if (err.name !== 'NotAllowedError') {
                showToast('Failed to start screen sharing');
            }
        }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (!screenStream) return;

    // Stop screen tracks
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;

    const videoTrack = originalVideoTrack || (localStream && localStream.getVideoTracks()[0]);
    
    // Restore original camera track to all peers
    Object.keys(peerConnections).forEach(remoteId => {
        const pc = peerConnections[remoteId];
        const sender = pc.getSenders().find(s => 
            s.track && s.track.kind === 'video'
        );
        if (sender && videoTrack) {
            sender.replaceTrack(videoTrack).catch(console.error);
        }
    });

    // Restore local video preview
    const localTile = document.getElementById(`tile-${currentUserId || 'local'}`);
    if (localTile && localStream) {
        const videoEl = localTile.querySelector('video');
        if (videoEl) videoEl.srcObject = localStream;
    }

    // Hide banner
    document.getElementById('screen-share-banner').classList.remove('flex');
    document.getElementById('screen-share-banner').classList.add('hidden');

    // Reset button
    const btn = document.getElementById('screen-btn');
    btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-500');
    btn.classList.add('bg-zinc-800');
    btn.innerHTML = `
        <i class="fa-solid fa-desktop text-xl mb-0.5"></i>
        <span class="text-[10px] font-medium tracking-tight">Share</span>
    `;

    isScreenSharing = false;
    showToast('Screen sharing stopped');
}

// Send chat message
function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    
    if (!message || !socket || !currentRoomId) return;

    // Add to own chat immediately (optimistic)
    addChatMessage(currentUserName, message, new Date().toISOString(), true);
    
    // Send to server
    socket.emit('chat-message', {
        roomId: currentRoomId,
        message: message
    });

    input.value = '';
}

// Add message to chat UI
function addChatMessage(fromName, message, timestamp, isOwn = false) {
    const container = document.getElementById('chat-messages');
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message flex ${isOwn ? 'justify-end' : ''}`;
    
    const time = new Date(timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    const bubbleClass = isOwn 
        ? 'bg-blue-600 text-white rounded-2xl rounded-br-none' 
        : 'bg-zinc-800 text-white rounded-2xl rounded-bl-none';
    
    msgDiv.innerHTML = `
        <div class="max-w-[78%]">
            ${!isOwn ? `<div class="text-[10px] text-zinc-400 mb-px pl-1 font-medium">${fromName}</div>` : ''}
            <div class="${bubbleClass} px-3.5 py-2 text-sm leading-snug break-words">
                ${message}
            </div>
            <div class="text-[10px] text-zinc-500 mt-px px-1 ${isOwn ? 'text-right' : ''}">${time}</div>
        </div>
    `;
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

// Toggle chat sidebar
function toggleChat() {
    const sidebar = document.getElementById('chat-sidebar');
    const videoArea = document.getElementById('video-area');
    
    if (sidebar.classList.contains('hidden')) {
        sidebar.classList.remove('hidden');
        sidebar.classList.add('flex');
        // On larger screens keep video area flexible
    } else {
        sidebar.classList.add('hidden');
        sidebar.classList.remove('flex');
    }
}

// Start meeting timer
function startMeetingTimer() {
    startTime = Date.now();
    const timerEl = document.getElementById('meeting-timer');
    
    if (meetingTimerInterval) clearInterval(meetingTimerInterval);
    
    meetingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Main function to join the meeting
async function joinMeeting() {
    const nameInput = document.getElementById('user-name').value.trim();
    let roomInput = document.getElementById('room-id').value.trim().toUpperCase();

    if (!nameInput) {
        alert('Please enter your name');
        return;
    }

    if (!roomInput) {
        // Auto generate if empty
        generateRoomId();
        roomInput = document.getElementById('room-id').value;
    }

    currentUserName = nameInput;
    currentRoomId = roomInput;

    // Request camera and microphone
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
    } catch (err) {
        console.error('Media error:', err);
        let msg = 'Could not access camera or microphone. ';
        if (err.name === 'NotAllowedError') {
            msg += 'Please allow camera and microphone permissions in your browser settings.';
        } else if (err.name === 'NotFoundError') {
            msg += 'No camera or microphone found on this device.';
        } else {
            msg += err.message;
        }
        alert(msg);
        return;
    }

    // Switch UI
    document.getElementById('join-screen').classList.add('hidden');
    document.getElementById('call-screen').classList.remove('hidden');

    // Set header info
    document.getElementById('room-id-display').textContent = currentRoomId;
    document.getElementById('meeting-title').textContent = 'Meeting in progress';

    // Initialize Tailwind (already done)
    initTailwind();

    // Add local video tile right away
    addLocalVideoTile();

    // Connect to Socket.IO server
    socket = io();

    // Setup listeners
    setupSocketListeners();

    // Join the room after connection is ready
    setTimeout(() => {
        if (socket && socket.connected) {
            socket.emit('join-room', {
                roomId: currentRoomId,
                userName: currentUserName
            });
        } else {
            // If not yet connected, wait for connect event
            socket.on('connect', () => {
                socket.emit('join-room', {
                    roomId: currentRoomId,
                    userName: currentUserName
                });
            });
        }
    }, 120);

    // Start timer
    startMeetingTimer();

    // Initial participant count
    setTimeout(updateParticipantCount, 600);

    // Welcome toast
    setTimeout(() => {
        showToast(`Welcome to the meeting, ${currentUserName.split(' ')[0]}!`, 2400);
    }, 1400);

    // Keyboard shortcut hint (optional)
    console.log('%c[Tuwa Call] Pro tip: Press "M" to toggle mic, "V" to toggle camera', 'color:#666');
}

// Leave meeting and cleanup everything
function leaveMeeting() {
    // Stop timer
    if (meetingTimerInterval) {
        clearInterval(meetingTimerInterval);
        meetingTimerInterval = null;
    }

    // Stop screen share if active
    if (isScreenSharing) {
        stopScreenShare();
    }

    // Close all peer connections
    Object.keys(peerConnections).forEach(id => {
        if (peerConnections[id]) {
            peerConnections[id].close();
        }
    });
    peerConnections = {};

    // Stop local media
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Notify server
    if (socket && currentRoomId) {
        socket.emit('leave-room', { roomId: currentRoomId });
        socket.disconnect();
    }

    // Reset state
    socket = null;
    currentRoomId = null;
    isMicMuted = false;
    isCameraOff = false;
    isScreenSharing = false;

    // Reset UI
    document.getElementById('call-screen').classList.add('hidden');
    document.getElementById('join-screen').classList.remove('hidden');
    
    // Clear video grid
    document.getElementById('video-grid').innerHTML = '';
    
    // Clear chat
    document.getElementById('chat-messages').innerHTML = '';
    
    // Reset buttons
    const micBtn = document.getElementById('mic-btn');
    const camBtn = document.getElementById('camera-btn');
    if (micBtn) micBtn.className = 'control-btn bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700';
    if (camBtn) camBtn.className = 'control-btn bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700';
    
    // Reset icons
    if (micBtn) micBtn.innerHTML = `<i class="fa-solid fa-microphone text-xl mb-0.5"></i><span class="text-[10px] font-medium tracking-tight">Mute</span>`;
    if (camBtn) camBtn.innerHTML = `<i class="fa-solid fa-video text-xl mb-0.5"></i><span class="text-[10px] font-medium tracking-tight">Stop Video</span>`;

    // Hide screen banner
    document.getElementById('screen-share-banner').classList.add('hidden');
    document.getElementById('screen-share-banner').classList.remove('flex');

    showToast('You have left the meeting');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (document.getElementById('call-screen').classList.contains('hidden')) return;

    if (e.key.toLowerCase() === 'm' && !e.target.matches('input')) {
        e.preventDefault();
        toggleMicrophone();
    }
    
    if (e.key.toLowerCase() === 'v' && !e.target.matches('input')) {
        e.preventDefault();
        toggleCamera();
    }
    
    if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        toggleChat();
    }
});

// Pre-generate a room ID on page load for convenience
window.onload = function() {
    initTailwind();
    
    // Pre-fill a room ID
    setTimeout(() => {
        const roomInput = document.getElementById('room-id');
        if (roomInput && !roomInput.value) {
            generateRoomId();
        }
    }, 300);
    
    // Optional: Check URL for room param (nice to have)
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        document.getElementById('room-id').value = roomFromUrl.toUpperCase();
    }
    
    console.log('%c[Tuwa Call] Video calling app ready. Built from scratch with ❤️ by Grok', 'color:#555');
};

// Make some functions global for inline onclick handlers
window.generateRoomId = generateRoomId;
window.joinMeeting = joinMeeting;
window.leaveMeeting = leaveMeeting;
window.toggleChat = toggleChat;
window.copyRoomId = copyRoomId;
window.toggleScreenShare = toggleScreenShare;
window.stopScreenShare = stopScreenShare;
