import { Redirect } from 'expo-router';

export default function Index() {
  // Redirect to the auth screen
  return <Redirect href="/auth" />;
}
