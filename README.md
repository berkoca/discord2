# Discord Clone

A basic Discord-like application with text and voice channels built using WebRTC, Socket.io, and Node.js.

## Features

- Real-time text chat
- Voice channels using WebRTC
- Create custom text and voice channels
- User presence (online users)
- Modern Discord-inspired UI

## Technologies Used

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: HTML, CSS, JavaScript
- **Real-time Communication**: Socket.io
- **Voice Chat**: WebRTC with Simple-Peer

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/discord-clone.git
   ```

2. Navigate to the project directory:
   ```
   cd discord-clone
   ```

3. Install dependencies:
   ```
   npm install
   ```

4. Start the server:
   ```
   npm start
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Usage

1. Enter a username to join the server
2. Use the text channels for text communication
3. Join voice channels for voice communication
4. Create new channels using the + buttons in the sidebar

## Project Structure

```
discord-clone/
├── public/              # Frontend files
│   ├── css/             # CSS styles
│   │   └── style.css    # Main stylesheet
│   ├── js/              # JavaScript files
│   │   └── app.js       # Main frontend logic
│   └── index.html       # Main HTML file
├── server.js            # Server-side code
├── package.json         # Project dependencies
└── README.md            # Project documentation
```

## License

This project is licensed under the MIT License.
