import { Amplify } from "aws-amplify";
import {
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut,
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential
} from "aws-amplify/auth";

const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const userPoolClientId = import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID;

export const isAuthConfigured = Boolean(userPoolId && userPoolClientId);

if (isAuthConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId,
        userPoolClientId
      }
    }
  });
}

export async function getSignedInUsername() {
  if (!isAuthConfigured) return "local";
  const user = await getCurrentUser();
  return user.username;
}

export async function signInWithPassword(username: string, password: string) {
  const result = await signIn({
    username,
    password,
    options: {
      clientMetadata: {
        authMethod: "password"
      }
    }
  });
  if (!result.isSignedIn) {
    throw new Error("追加の認証ステップが必要です。Cognitoの初回パスワード変更などを完了してください。");
  }
}

export async function signInWithPasskey(username: string) {
  const result = await signIn({
    username,
    options: {
      authFlowType: "USER_AUTH",
      preferredChallenge: "WEB_AUTHN",
      clientMetadata: {
        authMethod: "passkey"
      }
    }
  });
  return result;
}

export async function registerPasskey() {
  await associateWebAuthnCredential();
}

export async function listPasskeys() {
  const result = await listWebAuthnCredentials();
  return result.credentials;
}

export async function deletePasskey(credentialId: string) {
  await deleteWebAuthnCredential({ credentialId });
}

export function isPasskeySupported() {
  return isAuthConfigured && typeof window !== "undefined" && Boolean(window.PublicKeyCredential);
}

export async function signOutCurrentUser() {
  if (!isAuthConfigured) return;
  await signOut();
}

export async function getAuthToken() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error("ログインが必要です");
  return token;
}
