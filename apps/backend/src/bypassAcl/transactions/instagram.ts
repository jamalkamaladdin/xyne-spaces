import { transaction } from '../base';
import { ExternalSourcePlatform } from '@/integrations/core/types';
import { db } from '@/database/client';
import type { InstagramOAuthState } from '@/integrations/adapters/social-media/instagram/oauthStateService';
import {
  ChannelType,
  ChannelScopeType,
  ChannelVisibility,
  ChannelRole,
  DeskType,
  EmailMergeMode,
} from '@xyne/shared';

export function getInstagramOauthCallbackTx(
  state: InstagramOAuthState,
  sourceName: string,
  igUsername: string | undefined,
  igUserId: string,
  encryptedCredentials: string,
  now: Date,
) {
  return transaction(
    ['Channel', 'ChannelParticipant', 'ChannelUserStatus', 'ChannelStats', 'EmailChannelPreference', 'ExternalSource'],
    'getInstagramOauthCallback: channel, participant, status, preference and external-source rows must commit atomically; tx is not ACL-wrapped',
    db,
    async (tx) => {
      const channel = await tx.channel.create({
        data: {
          name: state.channelName,
          type: ChannelType.SOCIAL_MEDIA,
          scopeType: ChannelScopeType.DEFAULT,
          visibility: state.visibility === 'PUBLIC' ? ChannelVisibility.PUBLIC : ChannelVisibility.PRIVATE,
          createdBy: state.userId,
          projectId: state.projectId,
          workspaceId: state.workspaceId,
        },
      });
      await tx.channelParticipant.create({
        data: {
          workspaceId: state.workspaceId,
          channelId: channel.id,
          userId: state.userId,
          role: ChannelRole.ADMIN,
        },
      });
      await tx.channelUserStatus.create({
        data: {
          workspaceId: state.workspaceId,
          channelId: channel.id,
          userId: state.userId,
          updatedAt: now,
        },
      });
      await tx.channelStats.create({
        data: {
          workspaceId: state.workspaceId,
          channelId: channel.id,
          participantCount: 1,
          lastActivityAt: now,
        },
      });
      await tx.emailChannelPreference.create({
        data: {
          channelId: channel.id,
          workspaceId: state.workspaceId,
          ownerUserId: state.userId,
          assigneeUserGroupId: state.assigneeUserGroupId,
          boardId: state.boardId,
          deskType: DeskType.SOCIAL_MEDIA,
          emailMergeMode: EmailMergeMode.DISABLED,
        },
      });
      const source = await tx.externalSource.create({
        data: {
          name: sourceName,
          sourceType: ExternalSourcePlatform.INSTAGRAM,
          displayName: igUsername || state.channelName,
          channelId: channel.id,
          externalIdentifier: igUserId,
          workspaceId: state.workspaceId,
          boardId: state.boardId,
          ownerUserId: state.userId,
          credentials: encryptedCredentials,
          isActive: true,
        },
        select: { id: true },
      });
      return { channelId: channel.id, sourceId: source.id };
    },
  );
}
