import { useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, TextInput, View, type TextInputInstance } from 'react-native';

import { AvatarImagePicker, ProfileEditableAvatar } from '@/frontend/components/Avatar';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const profileAvatarSize = 96;
const logger = loggerService.withContext('ProfileSettingsScreen');

/** The person's avatar and nickname. */
export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const inputRef = useRef<TextInputInstance>(null);
  const [userName, setUserName] = usePreference('app.user.name');
  const profile = useBackendModule('profile');
  const [nameDraft, setNameDraft] = useState(userName);
  const mutedForegroundColor = useThemeColor('muted-foreground');
  const persistSelectedAvatar = useCallback(
    (sourceUri: string) => profile.persistAvatar(sourceUri),
    [profile],
  );
  const reportAvatarSaveError = useCallback(
    (error: unknown) => {
      logger.error('Failed to save user avatar', error as Error);
      toast.show({ label: t('settings.profile.avatarSaveError'), variant: 'danger' });
    },
    [t, toast],
  );

  // The nickname saves as soon as editing ends, including when the page closes mid-edit.
  const saveName = () => {
    if (nameDraft === userName) return;
    void setUserName(nameDraft, { optimistic: true }).catch((error: unknown) => {
      logger.error('Failed to save user name', error as Error);
      toast.show({ label: t('settings.profile.userNameSaveError'), variant: 'danger' });
    });
  };
  const saveNameOnLeave = useEffectEvent(saveName);
  useEffect(() => () => saveNameOnLeave(), []);
  const blurInput = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.profile.title') }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-3">
        <AvatarImagePicker
          accessibilityLabel={t('settings.profile.changeAvatar')}
          onBeforeOpen={blurInput}
          onError={reportAvatarSaveError}
          onSelect={persistSelectedAvatar}
          size={profileAvatarSize}
        >
          <ProfileEditableAvatar
            accessibilityLabel={t('settings.profile.changeAvatar')}
            icon="camera"
            size={profileAvatarSize}
          />
        </AvatarImagePicker>
        <TextInput
          accessibilityLabel={t('settings.profile.userName')}
          autoCorrect={false}
          className="min-w-40 max-w-full border-b border-border-strong px-2 pb-1.5 text-center font-semibold text-xl text-foreground"
          cursorColor={mutedForegroundColor}
          onBlur={saveName}
          onChangeText={setNameDraft}
          onSubmitEditing={blurInput}
          placeholder={t('settings.profile.namePlaceholder')}
          placeholderTextColor={mutedForegroundColor}
          ref={inputRef}
          returnKeyLabel="done"
          returnKeyType="done"
          selectionColor={mutedForegroundColor}
          value={nameDraft}
        />
      </View>
    </SettingsScrollPage>
  );
}
