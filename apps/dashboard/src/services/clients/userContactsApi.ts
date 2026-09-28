import { apiInstance } from './apiClient';

export type ContactsOAuthPlatform = 'web' | 'electron';
export type UserContactsProvider = 'GOOGLE' | 'MICROSOFT';

export interface UserContact {
  name: string | null;
  email: string;
}

type UserContactsProviderResponse = {
  success: true;
  provider: UserContactsProvider | null;
};

type UserContactsResponse = {
  success: true;
  provider: UserContactsProvider | null;
  connected: boolean;
  contacts: UserContact[];
};

type UserContactsOAuthInitResponse = {
  success: true;
  provider: UserContactsProvider;
  authUrl: string;
};

/** Which provider the signed-in user can import contacts from (null = email/password sign-in). */
export async function getUserContactsProvider(): Promise<UserContactsProvider | null> {
  const response = await apiInstance.get<UserContactsProviderResponse>('/user-contacts/provider');
  return response.data.provider;
}

/** The signed-in user's provider contacts. `connected` is false until the contacts OAuth grant exists. */
export async function getUserContacts(): Promise<UserContactsResponse> {
  const response = await apiInstance.get<UserContactsResponse>('/user-contacts');
  return response.data;
}

/**
 * Start the incremental contacts OAuth (asks the user to re-authorize with the
 * new contacts scopes). Returns the provider consent URL to redirect to.
 */
export async function initUserContactsOAuth(
  platform: ContactsOAuthPlatform = 'web',
  returnPath?: string,
): Promise<UserContactsOAuthInitResponse> {
  const response = await apiInstance.post<UserContactsOAuthInitResponse>(
    '/user-contacts/oauth/init',
    {
      platform,
      ...(returnPath ? { returnPath } : {}),
    },
  );
  return response.data;
}
