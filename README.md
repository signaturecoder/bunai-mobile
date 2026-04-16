# Bunai Mobile

React Native / Expo app for sending MOD files to power loom machines via USB Serial.

## Features

- 📱 **Phone + Password Login** - Same credentials as web app
- 📁 **MOD Files List** - View all your MOD files synced from the web
- 🔌 **USB Serial Send** - Send MOD files directly via USB-C to RS-232 adapter
- 🎯 **Android Only** - USB Serial requires native Android access

## Architecture

```
┌─────────────────────────────────────────┐
│           Your Next.js Backend          │
│  (Same server as web app - Vercel)      │
└───────────────────┬─────────────────────┘
                    │ HTTPS + Bearer Token
                    ▼
┌─────────────────────────────────────────┐
│           Bunai Mobile App              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  Login  │→ │  MODs   │→ │  Send   │ │
│  └─────────┘  └─────────┘  └────┬────┘ │
│                                 │       │
│                          USB Serial     │
└─────────────────────────────────┼───────┘
                                  ▼
                           ┌──────────────┐
                           │  ATmega328P  │
                           │  Drop Box    │
                           └──────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Android Studio (for emulator or USB debugging)
- USB-C to RS-232 adapter with Android OTG support

### Installation

```bash
cd bunai-mobile

# Install dependencies
npm install

# Start development server
npm start

# Run on Android
npm run android
```

### Environment Variables

Create `.env` file:

```env
# Your deployed Next.js app URL
EXPO_PUBLIC_API_URL=https://your-app.vercel.app
```

For local development, use your computer's local IP:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000
```

## Project Structure

```
bunai-mobile/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout with auth provider
│   ├── index.tsx           # Redirect based on auth state
│   ├── (auth)/
│   │   └── login.tsx       # Phone + password login
│   └── (app)/
│       ├── _layout.tsx     # Tab navigation
│       ├── mods.tsx        # MOD files list
│       ├── mod/[id].tsx    # MOD detail + send
│       └── settings.tsx    # Logout, about
├── components/
│   └── UsbSendButton.tsx   # USB serial send button
├── contexts/
│   └── AuthContext.tsx     # Authentication context
├── lib/
│   ├── api.ts              # API client
│   ├── auth.ts             # Token storage
│   ├── types.ts            # TypeScript types
│   └── usbSerial.ts        # USB serial protocol
└── assets/                 # App icons
```

## USB Serial Protocol

Same protocol as bunai-bridge and webSerial.ts:

- **Baud Rate**: 28800
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: None
- **Protocol**: Echo-based write
  - Send 'w' → Receive 'X'
  - Send 4-char hex address
  - Send 16 data bytes (each echoed)
  - Send 'Z' to commit

## Building for Production

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for Android
eas build --platform android
```

## Limitations

- **Android Only**: iOS does not allow USB serial access
- **USB OTG Required**: Phone must support USB OTG
- **Driver Dependent**: Some adapters may need specific drivers

## License

Private - Same as main Bunai project
