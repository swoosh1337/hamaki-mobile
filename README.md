# Hamaki Mobile 🎮

A futuristic, neon-themed mobile app for the Hamaki YouTube channel with exclusive subscriber access, XP system, games, and community features.

## 📱 Features

- **Google OAuth Authentication** - Sign in with Google
- **YouTube Integration** - Verify channel subscription
- **XP & Leaderboard System** - Earn points by liking videos
- **Mini Games** - Nu Pogodi and Hammock Jump
- **Community Posts** - Share video ideas and upvote
- **Profile Management** - Track stats and customize avatar

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (Mac) or Android Emulator

### Installation

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Run on specific platform
npx expo run:ios
npx expo run:android
```

## 📖 Documentation

- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Comprehensive guide for developers
  - Architecture overview
  - Folder structure
  - How to add new features
  - Coding patterns & best practices
  - Testing guidelines
  - Error handling & logging

- **[Refactoring Guide](./documentation/refactoring-guide.md)** - Project architecture and refactoring roadmap

## 🏗️ Architecture

Hamaki Mobile follows **Clean Architecture** principles:

```
Screens → Hooks → Services → Supabase/APIs
   ↓        ↓
Components  Types
```

### Key Directories

- `app/` - Expo Router screens
- `components/` - Reusable UI components
- `hooks/` - Custom React hooks for state management
- `services/` - API services (Supabase, YouTube)
- `types/` - TypeScript type definitions
- `utils/` - Utility functions
- `features/` - Feature modules (games, etc.)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- path/to/test.test.ts

# Coverage report
npm test -- --coverage
```

**Test Coverage:** ~470 tests
- Services: 92 tests
- Hooks: 70+ tests
- Components: 92 tests
- Games: 148 tests
- Utils & Contexts: 68+ tests

## 🎨 Design System

### Colors
- **Primary Neon Green:** `#C4FF00`
- **Deep Navy Background:** `#0B0C1A`
- **Accent White:** `#F5F5F5`

### Typography
- **Headings:** HamakiEng (custom font)
- **Body:** Space Mono

## 🔐 Authentication Setup

### OAuth Configuration

- **Client ID:** `986216455734-km0t9srahthpebl4dvb9gc8o9j2ehru5.apps.googleusercontent.com`
- **Redirect URI:** `hamaki://`
- **Required Scopes:** 
  - `profile`
  - `email`
  - `https://www.googleapis.com/auth/youtube.readonly`

### Testing Auth Flow

1. Sign in with a Google account subscribed to Hamaki channel (ID: `UCSI5XbaxsX1USijrfFVuJqA`)
2. Tap "Continue with Google"
3. Complete Google authentication
4. App verifies subscription and grants access

## 🗄️ Supabase Setup

### Environment Variables

Create a `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Tables

- `users` - User profiles and XP stats
- `posts` - Community video ideas
- `leaderboard` - XP rankings
- `game_cooldowns` - Game cooldown tracking
- `video_likes` - User video like history

## 📝 Development Workflow

### Adding a New Feature

1. **Define Types** in `types/`
2. **Create Service** in `services/`
3. **Create Hook** in `hooks/`
4. **Create Components** in `components/`
5. **Use in Screen** in `app/`
6. **Write Tests** in `__tests__/`

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed examples.

### Code Quality

```bash
# Run TypeScript checks
npx tsc --noEmit

# Run linter
npm run lint

# Auto-fix linting issues
npm run lint -- --fix
```

## 🎮 Games

### Nu Pogodi (No Pogod)
- Classic egg-catching game
- Canvas-based with sprite animations
- XP rewards based on score
- Cooldown system

### Hammock Jump
- Platformer jumping game
- Physics-based gameplay
- Progressive difficulty
- XP rewards on completion

## 🏆 XP System

Users earn XP by:
- Liking new Hamaki videos (+10 XP)
- Playing games (score-based XP)
- Weekly leaderboard competition

## 📦 Project Structure

```
hamaki-mobile/
├── app/                    # Expo Router screens
├── components/             # UI components
│   ├── community/         # Community features
│   ├── games/            # Game components
│   ├── profile/          # Profile components
│   └── ui/               # Shared UI elements
├── hooks/                  # Custom React hooks
├── services/               # API services
│   ├── auth/             # Authentication
│   └── supabase/         # Supabase services
├── features/               # Feature modules
│   └── games/            # Game engines
├── types/                  # TypeScript types
├── utils/                  # Utilities
├── contexts/               # React contexts
├── constants/              # App constants
└── __tests__/             # Test suites
```

## 🤝 Contributing

We follow strict coding standards and architecture patterns. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before making changes.

### Key Principles

- **KISS** - Keep it simple
- **DRY** - Don't repeat yourself
- **Type Safety** - No `any` types
- **Testing** - Write tests for new features
- **Logging** - Use centralized logger

### Pull Request Process

1. Create feature branch from `main`
2. Follow coding patterns in CONTRIBUTING.md
3. Write tests (aim for 80%+ coverage)
4. Update documentation if needed
5. Submit PR with clear description

## 📄 License

This project is proprietary software for the Hamaki YouTube channel.

## 🐛 Known Issues

Check the [Issues](https://github.com/your-repo/issues) page for known bugs and feature requests.

## 📞 Support

For questions or issues:
- Create a GitHub issue
- Check the documentation in `documentation/`
- Review CONTRIBUTING.md for development questions

---

Built with ❤️ for the Hamaki community
