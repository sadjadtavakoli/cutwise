import { firebaseConfig } from './firebase-config.js';

let app = null;
let auth = null;
let _currentUser = null;
let _authReadyResolve = null;
const _authReadyPromise = new Promise(r => { _authReadyResolve = r; });
const _listeners = [];

export async function initAuth() {
  if (app) return;

  const { initializeApp } = await import('firebase/app');
  const { getAuth, onAuthStateChanged: onAuthChanged, GoogleAuthProvider, signInWithPopup, signOut: fbSignOut } = await import('firebase/auth');

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  auth._GoogleAuthProvider = GoogleAuthProvider;
  auth._signInWithPopup = signInWithPopup;
  auth._fbSignOut = fbSignOut;

  onAuthChanged(auth, (user) => {
    _currentUser = user;
    _authReadyResolve();
    for (const cb of _listeners) cb(user);
  });
}

export async function signInWithGoogle() {
  await initAuth();
  const provider = new auth._GoogleAuthProvider();
  try {
    await auth._signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') {
      throw new Error('Please allow popups for sign-in');
    }
    throw e;
  }
}

export async function signOut() {
  if (!auth) return;
  await auth._fbSignOut(auth);
}

export function onAuthStateChanged(callback) {
  _listeners.push(callback);
  if (_currentUser !== undefined) {
    callback(_currentUser);
  }
}

export async function waitForAuth() {
  await initAuth();
  return _authReadyPromise;
}

export function getCurrentUser() {
  return _currentUser;
}

export function isSignedIn() {
  return _currentUser != null;
}
