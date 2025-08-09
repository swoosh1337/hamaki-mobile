export default {
  expo: {
    name: "hamaki",
    slug: "hamaki",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    scheme: "com.googleusercontent.apps.986216455734-m439aeo0u7s8et0gvhgcs9t54j8uabn3",
    userInterfaceStyle: "dark",
    backgroundColor: "#0B0C1A",
    splash: {
      image: "./assets/images/logo-transparent.png",
      resizeMode: "contain",
      backgroundColor: "#0B0C1A"
    },
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      backgroundColor: "#0B0C1A",
      splash: {
        image: "./assets/images/logo-transparent.png",
        resizeMode: "contain",
        backgroundColor: "#0B0C1A"
      },
      bundleIdentifier: "com.igrigolia1.hamaki"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/logo-transparent.png",
        backgroundColor: "#0B0C1A"
      },
      splash: {
        image: "./assets/images/logo-transparent.png",
        resizeMode: "contain",
        backgroundColor: "#0B0C1A"
      },
      edgeToEdgeEnabled: true,
      package: "com.igrigolia1.hamaki"
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          backgroundColor: "#0B0C1A",
          image: "./assets/images/logo-transparent.png",
          dark: {
            backgroundColor: "#0B0C1A",
            image: "./assets/images/logo-transparent.png"
          }
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#C4FF00",
          defaultChannel: "hamaki-videos"
        }
      ]
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      youtubeApiKey: process.env.EXPO_PUBLIC_YOUTUBE_API_KEY,
      hamakiChannelId: process.env.EXPO_PUBLIC_HAMAKI_CHANNEL_ID,
    },
  },
};