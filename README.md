# Hamaki - YouTube Channel App 🎮

A futuristic, neon-themed mobile app for the Hamaki YouTube channel with exclusive subscriber access.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Authentication Setup

This app uses Google OAuth authentication with YouTube API integration to verify channel subscriptions.

### Features

- **Google Sign-In**: Uses `expo-auth-session` to authenticate users with their Google accounts
- **YouTube API Integration**: Verifies if the user is subscribed to the Hamaki channel
- **Exclusive Access**: Only allows access to subscribers of the channel

### Configuration

The app is configured with the following OAuth credentials:

- **Client ID**: `986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com`
- **Redirect URI**: Uses the app scheme `hamaki://` for authentication redirects
- **Required Scopes**: `profile`, `email`, and `https://www.googleapis.com/auth/youtube.readonly`

### Testing Authentication

To test the authentication flow:

1. Make sure you're signed in to a Google account that is subscribed to the Hamaki YouTube channel (ID: `UCSI5XbaxsX1USijrfFVuJqA`)
2. Tap the "Continue with Google" button on the authentication screen
3. Complete the Google authentication process
4. The app will verify your subscription status and grant access if you're subscribed

## Design System

### Color Palette
- **Primary Neon Green**: `#C4FF00`
- **Deep Navy Background**: `#0B0C1A`
- **Accent White**: `#F5F5F5`

### Typography
- **Headings**: Custom font 'Hamaki Geo'
- **Body**: Space Mono

