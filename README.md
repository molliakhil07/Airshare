# AirShare 🚀

### Fast. Simple. Direct.

AirShare is a local-network file-sharing application that lets you transfer files between a phone and a computer without relying on a cloud storage service. Pair your devices using a PIN or QR code, send files directly over your local network, monitor transfer progress, and access received files from your computer.

Built with React, TypeScript, Vite, and Express, AirShare focuses on reliable file transfers, resumable chunk uploads, and a straightforward user experience.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [How It Works](#-how-it-works)
- [Technology Stack](#-technology-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Configuration](#-configuration)
- [Using AirShare](#-using-airshare)
- [API Overview](#-api-overview)
- [Storage and File Handling](#-storage-and-file-handling)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)
- [Development](#-development)
- [Future Improvements](#-future-improvements)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

AirShare is designed for transferring files between devices connected to the same local network.

Instead of uploading a file to a cloud service and downloading it again on another device, AirShare lets a paired phone send files directly to the computer running the AirShare server.

The application includes a web-based interface for pairing devices, monitoring active transfers, and viewing recently received files.

**Project highlights**

- Local-network file transfers
- PIN and QR-code device pairing
- Chunk-based uploads
- Transfer progress tracking
- Host dashboard for incoming files
- Received-file management through Windows File Explorer
- Session-based authentication for the host dashboard

## ✨ Features

### 🔗 Device Pairing

- Pair a phone with the host computer using a PIN or QR code.
- Authenticate the paired phone for transfer operations.
- Disconnect the paired device and return to the pairing screen.
- Use the host computer as the receiving destination.

### 📦 File Transfers

- Upload files from a paired phone to the computer.
- Transfer files in chunks instead of sending each entire file in one request.
- Track received bytes and transfer progress.
- Finalize completed uploads and assemble the received file.
- Verify file integrity when a client-side hash is available.
- Retain the existing transfer workflow while managing the device session.

### 🖥️ Host Dashboard

- View incoming transfers from paired devices.
- Monitor file names, received bytes, total size, and progress percentage.
- See recently completed transfers.
- View transfer completion timestamps.
- Refresh the dashboard automatically while it is open.

### 📂 Show in Folder

On Windows, click **Show in folder** on a completed file to open Windows File Explorer with the received file selected.

Received files are stored locally on the host computer. The feature uses the backend to resolve the completed transfer's file path and launch Explorer.

### 🔐 Authentication and Session Handling

- JWT-based authentication for paired-device operations.
- Dedicated host-dashboard session handling using an HTTP-only cookie.
- Protected dashboard endpoints.
- Server-side file-path resolution rather than accepting arbitrary file paths from the browser.

### 🌐 Local-Network Access

- Run the backend on the host computer.
- Access the application from another device on the same Wi-Fi or local network.
- Keep received files on the host computer instead of requiring cloud storage.

---

## 🔄 How It Works

```text
       PHONE                         HOST COMPUTER
   ┌─────────────┐                 ┌──────────────────┐
   │ Open browser│                 │ Run AirShare     │
   │     │       │                 │ frontend/backend │
   │     ▼       │                 │        │         │
   │ Pair by PIN │──── Pair ──────►│        ▼         │
   │ or QR code  │                 │ Authenticate     │
   │     │       │                 │ paired device    │
   │     ▼       │                 │        │         │
   │ Select file │                 │        ▼         │
   │     │       │                 │ Receive chunks   │
   │     └───────┼──── Upload ────►│        │         │
   │             │                 │        ▼         │
   │             │                 │ Assemble file    │
   │             │                 │        │         │
   │             │                 │        ▼         │
   │             │                 │ Save to uploads/ │
   │             │                 │        │         │
   │             │                 │        ▼         │
   │             │                 │ Host dashboard   │
   └─────────────┘                 └──────────────────┘
```

1. Start AirShare on the computer.
2. Open its web interface on the phone and computer.
3. Pair the phone with the host using the available PIN or QR workflow.
4. Select a file on the phone and start the transfer.
5. AirShare uploads the file in chunks and reports progress.
6. The backend assembles the chunks and stores the completed file.
7. The completed transfer appears in the host dashboard.
8. On Windows, select **Show in folder** to locate the received file.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| TypeScript | Type-safe frontend and backend development |
| Vite | Frontend development server and build tooling |
| Express | Backend HTTP API |
| Node.js | Backend runtime |
| JWT | Paired-device authentication |
| HTTP-only cookies | Host-dashboard session handling |
| Native Node.js file-system APIs | File storage and transfer handling |
| Windows File Explorer | Opening completed file locations on the host |

---

## 📁 Project Structure

```text
airbridge/
├── client/
│   ├── public/
│   │   └── Static assets
│   ├── src/
│   │   ├── components/
│   │   │   ├── HostDashboard.tsx
│   │   │   ├── PairingView.tsx
│   │   │   └── TransferView.tsx
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── upload.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.ts
│   │   ├── middleware/
│   │   │   └── index.ts
│   │   ├── routes/
│   │   │   ├── host.routes.ts
│   │   │   ├── pair.routes.ts
│   │   │   └── transfer.routes.ts
│   │   ├── services/
│   │   │   ├── host-auth.service.ts
│   │   │   ├── host-session.service.ts
│   │   │   └── transfer.service.ts
│   │   └── index.ts
│   ├── package.json
│   └── package-lock.json
│
├── storage/
│   ├── uploads/       # Completed received files
│   └── temp/          # Temporary transfer data
│
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

*The structure above highlights the main application files. Additional configuration, type definitions, and supporting files may also exist.*

---

## 📋 Prerequisites

Install the following before running AirShare:

- **Node.js** — a version compatible with the dependencies in the project.
- **npm** — included with Node.js.
- **Git** — for cloning and updating the repository.
- A modern browser on the host computer and phone.
- A shared Wi-Fi or local network for device-to-computer transfers.

Windows is required for the native **Show in folder** feature. Other platforms may run the web application and backend, but the Windows Explorer integration is platform-specific.

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/molliakhil07/Airbridge.git
cd Airbridge
```

### 2. Install frontend dependencies

Open a terminal in the project root:

```bash
cd client
npm install
```

### 3. Install backend dependencies

Open a second terminal:

```bash
cd server
npm install
```

### 4. Configure the backend

Create a `server/.env` file if your local configuration loads environment variables from that location.

Example:

```env
AIRBRIDGE_HOST=0.0.0.0
AIRBRIDGE_PORT=3456
AIRBRIDGE_JWT_SECRET=replace-with-a-long-random-secret
```

Use a securely generated secret for local development. Never commit actual secrets to GitHub.

The backend's configuration code is the source of truth for the environment-variable names and defaults. Review `server/src/config/index.ts` before adding or changing configuration options.

### 5. Start the backend

```bash
cd server
npm run dev
```

The default backend port is `3456`.

### 6. Start the frontend

In another terminal:

```bash
cd client
npm run dev
```

The Vite development server is available at:

```text
http://localhost:5173
```

The frontend uses `/api` as its default API base path, so the Vite proxy must be configured correctly for local development.

### 7. Open AirShare

On the host computer, open:

```text
http://localhost:5173
```

To access AirShare from your phone, use the host computer's local-network IP address with the frontend port, for example:

```text
http://192.168.1.10:5173
```

Replace `192.168.1.10` with the actual local IP address of your computer.

Make sure the phone and computer are on the same network, and allow the required ports through Windows Firewall when prompted. The backend must remain running while transfers are in progress.

> **Note:** The example IP address is illustrative. Find your computer's actual IPv4 address using `ipconfig` in Windows PowerShell or Command Prompt.

---

## ⚙️ Configuration

AirShare uses environment-based backend configuration.

| Variable | Purpose | Default / guidance |
|---|---|---|
| `AIRBRIDGE_HOST` | Backend bind address | `0.0.0.0` |
| `AIRBRIDGE_PORT` | Backend listening port | `3456` |
| `AIRBRIDGE_STORAGE` | Root directory for local transfer storage | Configured by the backend; verify `server/src/config/index.ts` |
| `AIRBRIDGE_JWT_SECRET` | Signs and verifies authentication tokens | Configure a strong, private secret |

The frontend's API base URL can be overridden using:

```env
VITE_API_BASE_URL=/api
```

For the standard local setup, the frontend defaults to `/api`.

Do not expose the backend's JWT secret through a `VITE_` environment variable. Vite variables prefixed with `VITE_` are intended for frontend code and can become visible in the browser.

---

## 📱 Using AirShare

### Pair your phone

1. Start the frontend and backend on your computer.
2. Open AirShare on the computer.
3. Open the application from your phone using the host computer's local IP address.
4. Follow the on-screen PIN or QR-code pairing process.
5. Complete pairing before starting a transfer.

### Send a file

1. Open the transfer interface on the paired phone.
2. Choose a file.
3. Start the transfer.
4. Keep the phone connected while the upload is running.
5. Monitor the transfer progress.
6. Wait until the upload is finalized.

### Locate a received file

1. Open the host dashboard on the computer.
2. Find the file under **Recently received**.
3. Click **Show in folder**.
4. Windows File Explorer should open with the received file selected.

The completed file is stored in the configured uploads directory. In the current Windows development setup, the directory is:

```text
C:\projects\airbridge\storage\uploads
```

### Disconnect a paired phone

Use the application's disconnect control. The phone should return to the pairing flow so another device can be paired when needed.

---

## 🔌 API Overview

AirShare exposes HTTP API routes for pairing, host sessions, and file transfers. The following transfer endpoints are confirmed in the current implementation.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/transfers/dashboard` | List transfer records for the host dashboard |
| `POST` | `/api/transfers/dashboard/:id/show-in-folder` | Open a completed file's location on the Windows host |
| `POST` | `/api/transfers` | Create a transfer |
| `PUT` | `/api/transfers/:id/chunks/:index` | Upload a file chunk |
| `GET` | `/api/transfers/:id/status` | Retrieve transfer status |
| `POST` | `/api/transfers/:id/finalize` | Finalize a transfer |
| `DELETE` | `/api/transfers/:id` | Cancel a transfer |
| `GET` | `/api/transfers` | List transfers, optionally filtered by status |

### Authentication

- Host dashboard endpoints use host-session authentication.
- Phone transfer operations use the paired-device authentication middleware.
- The exact request payloads and authentication requirements should be taken from the current route handlers and frontend API service.

The **Show in folder** endpoint is Windows-only. It resolves the file path from server-side transfer metadata rather than allowing the client to submit an arbitrary filesystem path.

---

## 💾 Storage and File Handling

AirShare keeps received files on the computer running the backend.

### Upload storage

Completed files are written to the configured uploads directory. In the local development setup, this is:

```text
storage/uploads/
```

Temporary transfer data is maintained separately while a transfer is being processed.

### Chunk-based uploads

Instead of requiring one large upload request, AirShare sends file data in chunks. The backend receives the chunks, tracks transfer state, and assembles the completed file.

This approach supports progress reporting and helps manage large transfers. Actual transfer capacity depends on available disk space, memory, network conditions, browser limitations, and the configured server limits.

### Data persistence

Received files remain on disk until they are deleted manually or by another operation.

The current transfer dashboard relies on in-memory metadata for completed transfers. As a result, after restarting the backend, an older completed file may still exist in `storage/uploads/` but no longer be selectable through the dashboard's **Show in folder** action.

---

## 🔐 Security

AirShare uses authentication and server-side path resolution to protect transfer operations.

Follow these practices when running or modifying the application:

- Keep `.env` files and authentication secrets out of Git.
- Never publish real JWT secrets or session credentials.
- Do not expose the application to untrusted networks without appropriate security controls.
- Use a trusted local network when transferring private files.
- Keep the Node.js runtime and project dependencies updated.
- Preserve authentication middleware when modifying API routes.
- Validate user input and file metadata on the backend.
- Keep received files and temporary transfer data excluded from source control.
- Review CORS, cookie settings, and network exposure before deploying beyond local development.

### Local network versus public hosting

AirShare's file-transfer workflow is intended for a computer running the backend on a local network. A public frontend deployment alone does not provide access to files stored on your local computer.

The backend must run on the machine that receives and stores the files for the current local-transfer workflow to work as intended.

---

## 🧰 Troubleshooting

### Frontend cannot connect to the backend

- Confirm the backend is running.
- Check that the backend listens on port `3456`, unless configured otherwise.
- Verify the Vite `/api` proxy configuration.
- Check the browser's Network panel and the backend terminal for errors.

### Phone cannot open AirShare

- Confirm the phone and computer are on the same Wi-Fi network.
- Use the computer's local IPv4 address instead of `localhost` on the phone.
- Check Windows Firewall rules for the frontend and backend ports.
- Confirm the frontend development server is running.

### Pairing or authentication fails

- Restart the backend if the host session is stale.
- Refresh the browser and retry the pairing flow if necessary.
- Check that the required authentication secret is configured.
- Avoid manually deleting session storage unless you are prepared to pair the phone again.

### Transfer stops before completion

- Keep both devices connected to the network.
- Check free disk space on the host.
- Inspect the backend logs for chunk-upload or finalization errors.
- Retry the transfer after resolving the underlying issue.

### Show in folder does nothing

- Confirm you are using Windows on the computer running the backend.
- Verify that the file exists in the configured uploads directory.
- Check the browser Network panel for the `show-in-folder` request.
- Inspect the backend terminal for Explorer launch errors.
- Confirm the completed transfer metadata is still available to the running backend.

### Completed files are missing from the dashboard after restarting

The file may still exist on disk even if its completed-transfer metadata is no longer available in memory. Check `storage/uploads/` directly.

---

## 🧑‍💻 Development

### Build the frontend

```bash
cd client
npm run build
```

### Run the frontend development server

```bash
cd client
npm run dev
```

### Run the backend in development

```bash
cd server
npm run dev
```

Available scripts depend on the current `package.json` files. Check those files for the exact supported commands before running additional build, test, or lint tasks.

### Git workflow

Check your working tree before committing:

```bash
git status
git diff
```

Stage and commit intended project changes:

```bash
git add <files-to-commit>
git commit -m "Describe your changes"
git push origin main
```

Never commit local environment files, credentials, generated build output, or received user files.

---

## 🛣️ Future Improvements

Potential improvements for future versions include:

- Persistent transfer history across backend restarts.
- A more complete transfer history and file-management interface.
- Better recovery and retry handling for interrupted transfers.
- Expanded automated tests for pairing, authentication, and file transfers.
- Additional platform-specific support for opening received-file locations.
- Improved deployment and production configuration documentation.
- More detailed network diagnostics and transfer error reporting.

These are possible future enhancements, not claims about features already implemented.

---

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Test the affected functionality.
5. Review your changes for credentials and private files.
6. Submit a pull request describing the change.

When modifying authentication, pairing, or transfer code, take care not to break existing device sessions or file-transfer behavior.

---

## 📄 License

No specific open-source license is declared here. Unless a license is added to the repository, the project should not be assumed to grant general permission to reuse, modify, or redistribute its code.

---

## 👨‍💻 Author

**Akhil Molli**

GitHub: [@molliakhil07](https://github.com/molliakhil07)

Repository: [AirShare — Airbridge](https://github.com/molliakhil07/Airbridge)

---

<p align="center">
  Built with ❤️ to make local file sharing simple.
</p>
