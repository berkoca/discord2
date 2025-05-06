// DOM Elements
const loginScreen = document.getElementById('login-screen');
const chatInterface = document.getElementById('chat-interface');
const voiceInterface = document.getElementById('voice-interface');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages-container');
const currentRoomName = document.getElementById('current-room-name');
const currentVoiceRoomName = document.getElementById('current-voice-room-name');
const roomUsersCount = document.getElementById('room-users-count');
const currentUser = document.getElementById('current-user');
const onlineUsersList = document.getElementById('online-users-list');
const textChannelsList = document.getElementById('text-channels-list');
const voiceChannelsList = document.getElementById('voice-channels-list');
const voiceUsersList = document.getElementById('voice-users-list');
const muteBtn = document.getElementById('mute-btn');
const leaveVoiceBtn = document.getElementById('leave-voice-btn');
const addTextChannelBtn = document.getElementById('add-text-channel');
const addVoiceChannelBtn = document.getElementById('add-voice-channel');
const createChannelModal = document.getElementById('create-channel-modal');
const modalTitle = document.getElementById('modal-title');
const channelNameInput = document.getElementById('channel-name-input');
const createChannelBtn = document.getElementById('create-channel-btn');
const closeModal = document.querySelector('.close-modal');

// App State
let socket;
let userData = null;
let currentRoom = 'general';
let currentRoomType = 'text';
let peers = {};
let localStream = null;
let isMuted = false;
let channelType = 'text'; // Used for modal

// Initialize the app
function init() {
    // Connect to the server
    socket = io();
    
    // Setup event listeners
    setupSocketListeners();
    setupUIListeners();
}

// Setup Socket.io event listeners
function setupSocketListeners() {
    // When connected to the server
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    // When user data is received
    socket.on('user-data', (data) => {
        userData = data;
        displayCurrentUser();
    });
    
    // When room list is received
    socket.on('room-list', (rooms) => {
        displayRooms(rooms);
    });
    
    // When a new message is received
    socket.on('new-message', (message) => {
        displayMessage(message);
    });
    
    // When user list is received
    socket.on('user-list', (users) => {
        displayOnlineUsers(users);
        updateRoomUsersCount(users);
    });
    
    // When a user joins
    socket.on('user-joined', (user) => {
        displaySystemMessage(`${user.username} joined the server`);
    });
    
    // When a user leaves
    socket.on('user-left', (userId) => {
        // Remove peer connection if exists
        if (peers[userId]) {
            peers[userId].destroy();
            delete peers[userId];
        }
        
        // Update UI
        const userElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            userElement.remove();
        }
        
        displaySystemMessage(`A user has left the server`);
    });
    
    // When room data is received
    socket.on('room-data', (data) => {
        if (data.room.type === 'text') {
            // Show chat interface for text rooms
            chatInterface.classList.remove('hidden');
            voiceInterface.classList.add('hidden');
            
            // Update room name
            currentRoomName.textContent = data.room.name;
            
            // Clear messages
            messagesContainer.innerHTML = '';
            
            // Display room messages if any
            if (data.room.messages && data.room.messages.length > 0) {
                data.room.messages.forEach(message => {
                    displayMessage(message);
                });
            }
        } else if (data.room.type === 'voice') {
            // Show voice interface for voice rooms
            chatInterface.classList.add('hidden');
            voiceInterface.classList.remove('hidden');
            
            // Update room name
            currentVoiceRoomName.textContent = data.room.name;
            
            // Setup WebRTC connections with other users in the room
            setupVoiceConnections(data.users);
        }
        
        // Update current room
        currentRoom = data.room.id;
        currentRoomType = data.room.type;
        
        // Update active channel in UI
        updateActiveChannel();
    });
    
    // When a new room is created
    socket.on('room-created', (room) => {
        addRoomToList(room);
    });
    
    // WebRTC signaling
    socket.on('voice-signal', async ({ userId, signal }) => {
        try {
            // If we don't have a peer connection with this user yet, create one
            if (!peers[userId]) {
                const peer = createPeer(userId);
                peers[userId] = peer;
            }
            
            // Add the signal to the peer connection
            await peers[userId].signal(signal);
        } catch (error) {
            console.error('Error handling voice signal:', error);
            displayVoiceError(`Connection error: ${error.message || 'Failed to connect to peer'}`);
        }
    });
    
    // Voice error handling
    socket.on('voice-error', ({ message, targetId }) => {
        console.error(`Voice error for ${targetId}: ${message}`);
        
        // Display error message
        displayVoiceError(message);
        
        // Clean up failed peer connection if it exists
        if (peers[targetId]) {
            peers[targetId].destroy();
            delete peers[targetId];
        }
    });
    
    // Voice status updates
    socket.on('user-voice-status', ({ userId, status }) => {
        // Update UI to show user's voice status (muted, etc.)
        const userElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            const statusElement = userElement.querySelector('.voice-user-status');
            if (statusElement) {
                if (status === 'muted') {
                    statusElement.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                    statusElement.classList.add('muted');
                } else {
                    statusElement.innerHTML = '<i class="fas fa-microphone"></i>';
                    statusElement.classList.remove('muted');
                }
            }
        }
    });
    
    // When a user joins a voice channel
    socket.on('user-joined-voice', (user) => {
        // Create a new peer connection with the user
        if (currentRoomType === 'voice' && user.id !== socket.id) {
            const peer = initiateCall(user.id);
            peers[user.id] = peer;
            
            // Add user to voice users list
            addUserToVoiceList(user);
        }
    });
}

// Setup UI event listeners
function setupUIListeners() {
    // Join button click
    joinBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) {
            joinServer(username);
        }
    });
    
    // Username input enter key
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const username = usernameInput.value.trim();
            if (username) {
                joinServer(username);
            }
        }
    });
    
    // Send message button click
    sendBtn.addEventListener('click', () => {
        sendMessage();
    });
    
    // Message input enter key
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Mute button click
    muteBtn.addEventListener('click', () => {
        toggleMute();
    });
    
    // Leave voice channel button click
    leaveVoiceBtn.addEventListener('click', () => {
        leaveVoiceChannel();
    });
    
    // Add text channel button click
    addTextChannelBtn.addEventListener('click', () => {
        openCreateChannelModal('text');
    });
    
    // Add voice channel button click
    addVoiceChannelBtn.addEventListener('click', () => {
        openCreateChannelModal('voice');
    });
    
    // Create channel button click
    createChannelBtn.addEventListener('click', () => {
        createChannel();
    });
    
    // Close modal button click
    closeModal.addEventListener('click', () => {
        closeCreateChannelModal();
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === createChannelModal) {
            closeCreateChannelModal();
        }
    });
}

// Join the server with a username
function joinServer(username) {
    socket.emit('join', username);
    loginScreen.classList.add('hidden');
    chatInterface.classList.remove('hidden');
}

// Send a message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoomType === 'text') {
        socket.emit('send-message', message);
        messageInput.value = '';
    }
}

// Display a message in the chat
function displayMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    const firstLetter = message.sender.charAt(0).toUpperCase();
    
    messageElement.innerHTML = `
        <div class="message-avatar">${firstLetter}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-sender">${message.sender}</span>
                <span class="message-time">${formatTime(message.timestamp)}</span>
            </div>
            <div class="message-text">${message.content}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Display a system message
function displaySystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system-message');
    
    messageElement.innerHTML = `
        <div class="message-content">
            <div class="message-text system-text">${message}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Format timestamp to readable time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Display current user info
function displayCurrentUser() {
    if (!userData) return;
    
    const firstLetter = userData.username.charAt(0).toUpperCase();
    
    currentUser.innerHTML = `
        <div class="user-avatar">${firstLetter}</div>
        <div class="user-name">${userData.username}</div>
    `;
}

// Display online users
function displayOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    
    users.forEach(user => {
        const userElement = document.createElement('li');
        userElement.classList.add('user-item');
        userElement.setAttribute('data-user-id', user.id);
        
        const firstLetter = user.username.charAt(0).toUpperCase();
        
        userElement.innerHTML = `
            <div class="user-avatar">${firstLetter}</div>
            <div class="user-name">${user.username}</div>
        `;
        
        onlineUsersList.appendChild(userElement);
    });
}

// Update room users count
function updateRoomUsersCount(users) {
    const roomUsers = users.filter(user => user.room === currentRoom);
    roomUsersCount.textContent = `${roomUsers.length} online`;
}

// Display rooms
function displayRooms(rooms) {
    textChannelsList.innerHTML = '';
    voiceChannelsList.innerHTML = '';
    
    Object.values(rooms).forEach(room => {
        addRoomToList(room);
    });
    
    // Set the first text channel as active
    updateActiveChannel();
}

// Add a room to the list
function addRoomToList(room) {
    const channelElement = document.createElement('li');
    channelElement.classList.add('channel-item');
    channelElement.setAttribute('data-room-id', room.id);
    channelElement.setAttribute('data-room-type', room.type);
    
    // Set icon based on channel type
    const iconClass = room.type === 'text' ? 'fa-hashtag' : 'fa-volume-high';
    
    channelElement.innerHTML = `
        <i class="channel-icon fas ${iconClass}"></i>
        <span>${room.name}</span>
    `;
    
    // Add click event to join the room
    channelElement.addEventListener('click', () => {
        joinRoom(room.id);
    });
    
    // Add to appropriate list
    if (room.type === 'text') {
        textChannelsList.appendChild(channelElement);
    } else {
        voiceChannelsList.appendChild(channelElement);
    }
    
    // If this is the current room, mark it as active
    if (room.id === currentRoom) {
        channelElement.classList.add('active');
    }
}

// Join a room
function joinRoom(roomId) {
    socket.emit('join-room', roomId);
}

// Update active channel in UI
function updateActiveChannel() {
    // Remove active class from all channels
    document.querySelectorAll('.channel-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to current channel
    const currentChannel = document.querySelector(`[data-room-id="${currentRoom}"]`);
    if (currentChannel) {
        currentChannel.classList.add('active');
    }
}

// Setup WebRTC voice connections
async function setupVoiceConnections(users) {
    // Clear existing connections
    Object.keys(peers).forEach(userId => {
        if (peers[userId]) {
            peers[userId].destroy();
            delete peers[userId];
        }
    });
    
    // Clear voice users list
    voiceUsersList.innerHTML = '';
    
    // Get user media if not already available
    if (!localStream) {
        try {
            // First check if getUserMedia is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Your browser does not support accessing media devices');
            }
            
            // Request microphone access with constraints
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            
            // Add mute functionality
            muteBtn.addEventListener('click', toggleMute);
        } catch (error) {
            console.error('Error accessing microphone:', error);
            
            // Show a more detailed error message in the voice interface
            displayVoiceError('Microphone access error: ' + (error.message || 'Permission denied'));
            
            // Create a dummy stream for connection purposes
            createDummyStream();
            return;
        }
    }
    
    // Add current user to voice users list
    if (userData) {
        addUserToVoiceList(userData, true);
    }
    
    // Create peer connections with other users in the room
    users.forEach(user => {
        if (user.id !== socket.id) {
            // Create peer connection
            const peer = initiateCall(user.id);
            peers[user.id] = peer;
            
            // Add user to voice users list
            addUserToVoiceList(user);
        }
    });
}

// Create a peer connection as the initiator
function initiateCall(userId) {
    try {
        // Configure ICE servers for better connectivity
        const iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        const peer = new SimplePeer({
            initiator: true,
            stream: localStream,
            trickle: true, // Enable trickle ICE for better connectivity
            config: iceServers
        });
        
        // Handle signaling
        peer.on('signal', signal => {
            console.log('Initiator sending signal', signal.type);
            socket.emit('voice-signal', { userId, signal });
        });
        
        // Handle incoming stream
        peer.on('stream', stream => {
            console.log('Received stream from', userId);
            addAudioElement(userId, stream);
        });
        
        // Handle connection state changes
        peer.on('connect', () => {
            console.log('Connected to peer', userId);
        });
        
        peer.on('close', () => {
            console.log('Connection closed with', userId);
            removeAudioElement(userId);
        });
        
        // Handle errors
        peer.on('error', err => {
            console.error('Peer connection error:', err);
            displayVoiceError(`Connection error with peer: ${err.message || 'Unknown error'}`);
            
            // Clean up the failed connection
            setTimeout(() => {
                if (peers[userId]) {
                    peers[userId].destroy();
                    delete peers[userId];
                }
            }, 1000);
        });
        
        return peer;
    } catch (err) {
        console.error('Failed to create peer connection:', err);
        displayVoiceError('Failed to create voice connection');
        return null;
    }
}

// Create a peer connection as the receiver
function createPeer(userId) {
    try {
        // Configure ICE servers for better connectivity
        const iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        const peer = new SimplePeer({
            initiator: false,
            stream: localStream,
            trickle: true, // Enable trickle ICE for better connectivity
            config: iceServers
        });
        
        // Handle signaling
        peer.on('signal', signal => {
            console.log('Receiver sending signal', signal.type);
            socket.emit('voice-signal', { userId, signal });
        });
        
        // Handle incoming stream
        peer.on('stream', stream => {
            console.log('Received stream from', userId);
            addAudioElement(userId, stream);
        });
        
        // Handle connection state changes
        peer.on('connect', () => {
            console.log('Connected to peer', userId);
        });
        
        peer.on('close', () => {
            console.log('Connection closed with', userId);
            removeAudioElement(userId);
        });
        
        // Handle errors
        peer.on('error', err => {
            console.error('Peer connection error:', err);
            displayVoiceError(`Connection error with peer: ${err.message || 'Unknown error'}`);
            
            // Clean up the failed connection
            setTimeout(() => {
                if (peers[userId]) {
                    peers[userId].destroy();
                    delete peers[userId];
                }
            }, 1000);
        });
        
        return peer;
    } catch (err) {
        console.error('Failed to create peer connection:', err);
        displayVoiceError('Failed to create voice connection');
        return null;
    }
}

// Helper function to add audio element
function addAudioElement(userId, stream) {
    // Remove existing audio element if any
    removeAudioElement(userId);
    
    // Create new audio element
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.id = `audio-${userId}`;
    audio.autoplay = true;
    document.body.appendChild(audio);
}

// Helper function to remove audio element
function removeAudioElement(userId) {
    const existingAudio = document.getElementById(`audio-${userId}`);
    if (existingAudio) {
        existingAudio.srcObject = null;
        existingAudio.remove();
    }
}

// Add a user to the voice users list
function addUserToVoiceList(user, isCurrentUser = false) {
    const userElement = document.createElement('li');
    userElement.classList.add('voice-user');
    userElement.setAttribute('data-user-id', user.id);
    
    const firstLetter = user.username.charAt(0).toUpperCase();
    
    userElement.innerHTML = `
        <div class="voice-user-avatar">${firstLetter}</div>
        <div class="voice-user-name">${user.username}${isCurrentUser ? ' (You)' : ''}</div>
        <div class="voice-user-status${isCurrentUser && isMuted ? ' muted' : ''}">
            <i class="fas ${isCurrentUser && isMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
        </div>
    `;
    
    voiceUsersList.appendChild(userElement);
}

// Toggle mute
function toggleMute() {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            isMuted = !isMuted;
            audioTracks[0].enabled = !isMuted;
            
            // Update UI
            if (isMuted) {
                muteBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                muteBtn.classList.add('muted');
            } else {
                muteBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                muteBtn.classList.remove('muted');
            }
            
            // Update voice user list
            const currentUserElement = document.querySelector(`[data-user-id="${socket.id}"]`);
            if (currentUserElement) {
                const statusElement = currentUserElement.querySelector('.voice-user-status');
                if (statusElement) {
                    if (isMuted) {
                        statusElement.innerHTML = '<i class="fas fa-microphone-slash"></i>';
                        statusElement.classList.add('muted');
                    } else {
                        statusElement.innerHTML = '<i class="fas fa-microphone"></i>';
                        statusElement.classList.remove('muted');
                    }
                }
            }
            
            // Notify server about mute status change
            if (userData && userData.room) {
                socket.emit('voice-status', {
                    status: isMuted ? 'muted' : 'unmuted',
                    roomId: userData.room
                });
            }
        }
    }
}

// Create a dummy stream when microphone access fails
function createDummyStream() {
    // Create a silent audio context to use as a fallback
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const destination = audioContext.createMediaStreamDestination();
        
        oscillator.connect(destination);
        oscillator.frequency.setValueAtTime(0, audioContext.currentTime); // Silent
        oscillator.start();
        
        localStream = destination.stream;
        
        // Display warning to user
        displayVoiceError('Running in listen-only mode. You cannot speak but can hear others.');
    } catch (err) {
        console.error('Failed to create dummy audio stream:', err);
        displayVoiceError('Voice chat is not available in your browser.');
    }
}

// Display error message in voice interface
function displayVoiceError(message) {
    const errorElement = document.createElement('div');
    errorElement.classList.add('voice-error');
    errorElement.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <span>${message}</span>
    `;
    
    // Clear any existing error messages
    const existingError = voiceUsersList.querySelector('.voice-error');
    if (existingError) {
        existingError.remove();
    }
    
    voiceUsersList.prepend(errorElement);
}

// Leave voice channel
function leaveVoiceChannel() {
    // Destroy all peer connections
    Object.keys(peers).forEach(userId => {
        if (peers[userId]) {
            peers[userId].destroy();
            delete peers[userId];
        }
    });
    
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Remove all audio elements
    document.querySelectorAll('audio').forEach(audio => audio.remove());
    
    // Join the general text channel
    joinRoom('general');
}

// Open create channel modal
function openCreateChannelModal(type) {
    channelType = type;
    modalTitle.textContent = `Create New ${type === 'text' ? 'Text' : 'Voice'} Channel`;
    createChannelModal.classList.remove('hidden');
    channelNameInput.focus();
}

// Close create channel modal
function closeCreateChannelModal() {
    createChannelModal.classList.add('hidden');
    channelNameInput.value = '';
}

// Create a new channel
function createChannel() {
    const channelName = channelNameInput.value.trim();
    if (!channelName) return;
    
    // Send request to create channel
    fetch(`/api/channels/${channelType}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: channelName })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to create channel');
        }
        return response.json();
    })
    .then(data => {
        // Close modal
        closeCreateChannelModal();
    })
    .catch(error => {
        console.error('Error creating channel:', error);
        alert('Failed to create channel. Please try again.');
    });
}

// Initialize the app when the page loads
window.addEventListener('load', init);
