# StegoChat 🛡️🔐  
A modern, privacy-focused chat application with built-in image steganography, secure messaging, and advanced encryption settings.

StegoChat allows users to hide secret messages inside images, send encrypted chats, create group chats, manage settings with bcrypt-secured passwords, and switch between dark/light themes — all inside a clean and modern UI.  
This project is built as a secure, end-to-end controlled communication tool.

---

## 🚀 Features

### 🔒 Steganography
- Hide secret text messages inside images  
- Extract hidden messages from encoded images  
- Support for multiple embedding methods: LSB, Parity Check, Spread Spectrum
- Lossless encoding/decoding algorithm  
- Secure message handling and clean UI display  

### 💬 Real-Time Chat System
- Start **New Chat**  
- Supports **Group Chat**
- Media menu: Open, Download, Info, Delete  
- Smooth message rendering & clean layout  
- Auto-delete message settings  

### 🏞️ Image Management
- Upload images  
- Add hidden text  
- Download encoded images  
- Detailed image info popup  
- Delete button implemented (working in New Chat + Group Chat)
- Image metadata inspection
- Risk scanning for sensitive data

### 🎨 Modern UI & Theme System
- **Responsive design** - Mobile, tablet, and desktop optimized
- **Dark/Light Mode Switching** - Interactive theme toggle with visual feedback
- Sidebar navigation  
- Animated buttons & transitions  
- Logo: **StegoChat (modern & tech-focused)**  
- Material Design Icons
- Toast notifications for user feedback

### 🔐 Security & Settings
- **Profile Management**
  - Update username (3-50 characters with validation)
  - Update email address (with regex validation)
  - Save/Cancel functionality

- **Password Security**
  - Change vault password with verification
  - **Bcrypt password hashing** (cost factor 12)
  - Old password verification before change
  - Form validation (min 6 characters)

- **Encryption Preferences**
  - Select encryption protocol: AES-256, RSA-4096, ChaCha20
  - Choose embedding method: LSB, Parity Check, Spread Spectrum
  - Real-time save on selection change

- **Security Toggles**
  - Auto-delete messages (24-hour inactivity)
  - Passphrase lock on app launch
  - Biometric authentication option
  - Real-time toggle updates

- **Data Management**
  - Export settings as JSON backup
  - Import settings from JSON file
  - Session management
  - View vault statistics
  - Secure data destruction (DoD-standard zero-fill)

### 🛠️ Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Flask (Python)
- **Encryption**: bcrypt, PyCryptodome
- **Database**: JSON-based persistent storage
- **Steganography**: Custom LSB-based implementation
- **UI Framework**: Tailwind CSS with Material Design Icons
- **APIs**: RESTful endpoints with JSON

---

## 📁 Project Structure

```
StegoChat/
├── frontend/
│   ├── index.html              (Main chat page)
│   ├── login.html              (Login interface)
│   ├── settings.html           (Settings & configuration - NEW)
│   ├── embed.html              (Steganography embedding)
│   ├── extract.html            (Message extraction)
│   ├── app.js                  (Chat logic)
│   └── style.css               (Global styles)
│
├── backend/
│   ├── app.py                  (Flask server & API endpoints)
│   ├── stego_engine.py         (Steganography implementation)
│   ├── encryption.py           (Encryption utilities)
│   ├── data.json               (Persistent data storage)
│   ├── requirements.txt        (Python dependencies)
│   └── /uploads                (Temporary file storage)
│
├── sample_images/              (Sample images for demo)
├── README.md                   (This file)
├── SETTINGS_IMPLEMENTATION.md  (Settings feature documentation)
├── THEME_SWITCHING_FIXED.md    (Theme feature documentation)
└── license.txt                 (Project license)
```

---

## 🧪 How It Works

### 🟢 Hide Message in Image
1. Navigate to **Embed** page
2. Upload an image  
3. Enter secret text  
4. Click **Encode**  
5. Download the Stego Image  

### 🔵 Reveal Hidden Message
1. Navigate to **Extract** page
2. Upload encoded image  
3. Click **Decode**  
4. Hidden text appears instantly  

### ⚙️ Configure Settings
1. Navigate to **Settings** page
2. **Profile**: Update username and email
3. **Password**: Change vault password securely
4. **Encryption**: Select protocol and embedding method
5. **Security**: Toggle auto-delete, passphrase lock, biometric auth
6. **Interface**: Switch between Dark/Light modes
7. **Backup**: Export/Import settings as JSON
8. **Data**: View statistics or permanently wipe database

### 🌓 Switch Themes
1. Go to **Settings** → **Interface** section
2. Click **Dark Mode** or **Light Mode** button
3. Theme updates instantly
4. Preference saved to backend & localStorage
5. Theme restored on next visit

---

## 📦 Running the Project

### Prerequisites
- Python 3.8+
- pip (Python package manager)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Option 1 — Local Development Server (Recommended)

#### Step 1: Install Dependencies
```bash
cd StegoChat/backend
pip install -r requirements.txt
```

#### Step 2: Start Flask Server
```bash
cd StegoChat/backend
python app.py
```

The server will start at `http://127.0.0.1:5000`

#### Step 3: Access the Application
Open your browser and navigate to:
```
http://127.0.0.1:5000
```

#### Step 4: Login
Use default credentials or create new account:
- Default password: `stego123`

### Option 2 — Docker (Coming Soon)
```bash
docker build -t stegochat .
docker run -p 5000:5000 stegochat
```

---

## 🔌 API Endpoints

### Settings Management
```
GET  /api/settings              - Get current settings
POST /api/settings              - Update settings
```

### Profile Management
```
GET  /api/settings/profile      - Get user profile
POST /api/settings/profile      - Update username/email
```

### Password Security
```
POST /api/settings/password     - Change password (bcrypt secured)
```

### Sessions & Data
```
GET  /api/settings/sessions     - Get active sessions
DELETE /api/settings/sessions   - Delete session
GET  /api/settings/export       - Export settings as JSON
POST /api/settings/import       - Import settings from JSON
GET  /api/settings/statistics   - Get vault statistics
POST /api/shred-all             - Secure data destruction
```

### Chat & Steganography
```
GET/POST /api/embed             - Embed messages in images
GET/POST /api/extract           - Extract hidden messages
POST /api/dead-drop             - Temporary secure message drops
POST /api/scan-risk             - Scan messages for sensitive data
POST /api/inspect-image         - Get image metadata
```

---

## 🔐 Security Features

### Password Hashing
- **bcrypt** with cost factor 12
- Hash format: `$2b$12$[salt][hash]`
- Old password verification before change
- Plaintext fallback for backwards compatibility

### Form Validation
- **Client-side**: Immediate feedback
- **Server-side**: All inputs validated
- Email format validation (regex)
- Username length: 3-50 characters
- Password length: minimum 6 characters

### Data Protection
- DoD-standard secure deletion
- Encrypted message storage
- Session management
- Risk scanning for sensitive data
- Secure message dropoffs with tokens

---

## 📋 Recent Updates (v1.1)

### ✨ New Features
- ✅ **Complete Settings Page** with profile and password management
- ✅ **Bcrypt Password Hashing** for secure vault password storage
- ✅ **Theme Switching** between Dark and Light modes
- ✅ **Form Validation** with client-side and server-side checks
- ✅ **Toast Notifications** for user feedback
- ✅ **Settings Export/Import** for backup and restore

### 🔒 Security Improvements
- ✅ Passwords no longer stored in plaintext
- ✅ Enhanced validation for all user inputs
- ✅ Email format validation
- ✅ Username length restrictions
- ✅ Session management

### 🎨 UI Improvements
- ✅ Interactive theme selector buttons
- ✅ Real-time form feedback
- ✅ Improved accessibility
- ✅ Better error messages
- ✅ Loading states for async operations

---

## 🛡️ License

This project uses an **Ultra-Restrictive Private License**.  
➡️ **Only the owner (Nirbhay Satapa Patil) has the rights to use, view, modify, or distribute the code.**  
No rights are granted to anyone else.

See **license.txt** for full details.

---

## 👨‍💻 Author

**Nirbhay Satapa Patil**  
Creator & Owner of StegoChat  
Contact: *(ff4056232@gmail.com)*

---

## ⭐ Future Enhancements

### Planned Features
- Real server backend with user accounts & authentication
- Cloud-secured encrypted chat system  
- End-to-end encryption (E2EE) for all messages
- Mobile app version (iOS & Android)
- Two-factor authentication (2FA)
- Password strength meter
- Biometric setup flow
- Language preferences
- Theme customization (custom colors)
- Scheduled theme switching (day/night)
- Message scheduling
- Chat history export
- Advanced search functionality
- File sharing beyond images
- Voice message support
- Video call integration

### Development
- Unit test coverage
- Integration tests
- Performance optimization
- Database migration to SQL
- Containerization improvements
- CI/CD pipeline setup
- Automated backups

---

## 📞 Support

For issues, questions, or feature requests, contact the author at **ff4056232@gmail.com**

---

**Last Updated:** March 2026  
**Version:** 1.1
