import { redirect } from 'next/navigation';

// The plans are the home screen; the proxy sends visitors who are not signed in to /signin.
export default function Home() {
  redirect('/plans');
}
