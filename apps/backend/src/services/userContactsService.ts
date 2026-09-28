/**
 * User Contacts Service
 *
 * Per-user Google/Microsoft contacts access for the workspace invite flow.
 * Contacts OAuth credentials are stored encrypted in ExternalSource (sourceType
 * `google_contacts` / `microsoft_contacts`, one row per user), following the
 * same convention as the per-user calendar sources.
 */

import { AuthProvider } from '@xyne/shared';
import { DatabaseClient } from '@/database/client';
import { encrypt } from '@/services/encryptionService';
import { GoogleService } from '@/services/googleService';
import { MicrosoftDeskService } from '@/services/microsoftDeskService';
import { logger } from '@/utils/logger';

export type UserContactsProvider = 'GOOGLE' | 'MICROSOFT';

export interface UserContact {
  name: string | null;
  email: string;
}

/** Shape stored for Google sources — matches GoogleCredentials used by GoogleService. */
interface GoogleContactsCredentials {
  accessToken: string;
  refreshToken: string;
  email: string;
}

/** Shape stored for Microsoft sources — matches MicrosoftCredentials used by MicrosoftDeskService. */
interface MicrosoftContactsCredentials {
  accessToken: string;
  refreshToken: string;
  email: string;
  expiresAt?: string;
}

const CONTACTS_SOURCE_TYPES: Record<UserContactsProvider, string> = {
  GOOGLE: 'google_contacts',
  MICROSOFT: 'microsoft_contacts',
};

export function providerFromAuthProvider(provider: AuthProvider): UserContactsProvider | null {
  if (provider === AuthProvider.GOOGLE) return 'GOOGLE';
  if (provider === AuthProvider.MICROSOFT) return 'MICROSOFT';
  return null;
}

export function getUserContactsSourceType(provider: UserContactsProvider): string {
  return CONTACTS_SOURCE_TYPES[provider];
}

function contactsSourceName(ownerUserId: string, provider: UserContactsProvider): string {
  const suffix = provider === 'GOOGLE' ? 'google' : 'microsoft';
  return `contacts-${suffix}-${ownerUserId}`;
}

export async function getUserContactsSource(
  ownerUserId: string,
  provider: UserContactsProvider,
) {
  const db = DatabaseClient.getInstance();
  const sourceType = CONTACTS_SOURCE_TYPES[provider];

  return db.externalSource.findFirst({
    where: { sourceType, ownerUserId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function persistUserContactsCredentials(params: {
  provider: UserContactsProvider;
  email: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiry?: Date;
  ownerUserId: string;
}): Promise<string> {
  const db = DatabaseClient.getInstance();
  const sourceType = CONTACTS_SOURCE_TYPES[params.provider];
  const name = contactsSourceName(params.ownerUserId, params.provider);

  const credentials: string =
    params.provider === 'GOOGLE'
      ? encrypt(
          JSON.stringify({
            accessToken: params.accessToken,
            refreshToken: params.refreshToken,
            email: params.email,
          } satisfies GoogleContactsCredentials),
        )
      : encrypt(
          JSON.stringify({
            accessToken: params.accessToken,
            refreshToken: params.refreshToken,
            email: params.email,
            ...(params.accessTokenExpiry
              ? { expiresAt: params.accessTokenExpiry.toISOString() }
              : {}),
          } satisfies MicrosoftContactsCredentials),
        );

  const existing = await getUserContactsSource(params.ownerUserId, params.provider);
  if (existing) {
    await db.externalSource.update({
      where: { id: existing.id },
      data: {
        name,
        displayName: params.email,
        credentials,
        ownerUserId: params.ownerUserId,
        isActive: true,
      },
    });
    return existing.id;
  }

  const owner = await db.user.findUniqueOrThrow({
    where: { id: params.ownerUserId },
    select: { workspaceId: true },
  });

  const created = await db.externalSource.create({
    data: {
      name,
      sourceType,
      displayName: params.email,
      credentials,
      ownerUserId: params.ownerUserId,
      isActive: true,
      workspaceId: owner.workspaceId,
    },
  });

  return created.id;
}

/**
 * List the user's provider contacts using their stored contacts grant.
 *
 * - Google: GoogleService.listContacts handles People API pagination and
 *   persists refreshed tokens back (google-auth-library refreshes without
 *   pinning scopes, so the contacts-only grant works as-is).
 * - Microsoft: refreshScope=null omits the scope parameter on token refresh so
 *   the grant's original (contacts-only) scopes are inherited — the desk
 *   default would request Mail.* scopes this grant never received.
 */
export async function listUserContacts(
  ownerUserId: string,
  provider: UserContactsProvider,
): Promise<UserContact[]> {
  const source = await getUserContactsSource(ownerUserId, provider);
  if (!source) return [];

  if (provider === 'GOOGLE') {
    return GoogleService.listContacts(source.credentials, source.id);
  }

  return MicrosoftDeskService.listContacts(source.credentials, source.id, null);
}

export async function isUserContactsConnected(
  ownerUserId: string,
  provider: UserContactsProvider,
): Promise<boolean> {
  const source = await getUserContactsSource(ownerUserId, provider);
  return !!source?.isActive;
}

export function logContactsOAuthEvent(event: string, data: Record<string, unknown>): void {
  logger.info(`[USER_CONTACTS][OAUTH] ${event}`, data);
}
