# AirShare

**Fast, wireless file transfers between Android phones and Windows PCs over the local Wi-Fi network.**

AirShare lets you pair your phone with your computer using a QR code or PIN and transfer files without cables.

## Features

- Wireless file transfers over your local network
- QR code and PIN pairing
- Chunked and resumable transfers for large files
- Windows desktop application with a custom icon
- Transfer history and file management
- Local file storage on your computer

## Windows Installation

1. Open the [GitHub Releases page](https://github.com/molliakhil07/Airbridge/releases).
2. Download `AirShare Setup 1.0.0.exe` from the release assets.
3. Run the installer and follow the setup instructions.
4. Launch AirShare from the desktop shortcut or Start menu.
5. Connect your Android phone and Windows PC to the same Wi-Fi network.
6. Follow the pairing instructions in AirShare.

Windows Firewall may ask for permission to allow network access. Allow it on your trusted private network if you want your phone to connect.

## Development Setup

Requirements:
- Node.js and npm
- Windows for building the Windows installer

Install dependencies from the project root:

    npm run install:all

Start the development servers:

    npm run dev

Build the application:

    npm run build

Create the Windows installer:

    npm run desktop:dist

The installer is generated in the `release` directory.

## Privacy and Security

AirShare is designed for transfers over your local network. Use it only on trusted networks and devices. Keep pairing credentials private.

Local application data and authentication files should not be committed to Git or shared publicly.

## Project Status

AirShare v1.0.0 — initial Windows desktop release.

## Feedback

Report bugs and suggest features through [GitHub Issues](https://github.com/molliakhil07/Airbridge/issues).
