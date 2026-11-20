import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import {
  backupContentNoticeKey,
  formatStorageSize,
  useBackupErrorReporter,
} from '@/frontend/appShell/backup';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import {
  downloadLatestBackup,
  loadConfig,
  saveConfig,
  uploadBackup,
  type WebDavConfig,
} from '@/frontend/appShell/backup/webdav';
import { useBackupState } from '@/frontend/hooks/useBackupState';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

/** Backup and local storage maintenance; the app-wide `BackupDialog` shows backup progress. */
export function DataScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const report = useBackupErrorReporter();
  const { backup, state } = useBackupState();
  const [clearing, setClearing] = useState(false);
  const busy = state.phase !== 'idle' || clearing;
  const available = backup.isAvailable();

  const create = () => {
    void backup.createBackup().catch(report);
  };
  const select = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const { uri } = result.assets[0];
        try {
          await backup.prepareRestore(uri);
        } finally {
          // DocumentPicker was asked for a cache copy; never unlink a user's source document.
          if (uri.startsWith(Paths.cache.uri)) {
            try {
              const file = new File(uri);
              if (file.exists) file.delete();
            } catch {
              /* A cache cleanup failure must not change the import outcome. */
            }
          }
        }
      }
    } catch (error) {
      report(error);
    }
  };

  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: t('settings.data.title') }}>
      <Section
        title={t('backup.title')}
        footer={t(available ? backupContentNoticeKey() : 'backup.unavailable')}
      >
        <Section.Item
          label={t('backup.create')}
          onPress={create}
          showChevron={false}
          disabled={!available || busy}
        />
        <Section.Item
          label={t('backup.select')}
          onPress={() => void select()}
          showChevron={false}
          disabled={!available || busy}
        />
      </Section>
      <Section title={t('settings.data.import')}>
        <Section.Item
          label={t('settings.data.deepseek.title')}
          onPress={() => router.push('/settings/data/deepseek')}
          disabled={busy}
        />
      </Section>
      <WebDavSection disabled={busy} />
      <StorageSection disabled={busy} onClearingChange={setClearing} />
    </SettingsScrollPage>
  );
}

function StorageSection({
  disabled,
  onClearingChange,
}: {
  disabled: boolean;
  onClearingChange: (clearing: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const report = useBackupErrorReporter();
  const agent = useBackendModule('agent');
  const [size, setSize] = useState<number>();

  const refresh = useCallback(() => agent.getWorkingStorageSize().then(setSize), [agent]);
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const clear = async () => {
    onClearingChange(true);
    try {
      const before = await agent.getWorkingStorageSize();
      await agent.clearWorkingStorage();
      const after = await agent.getWorkingStorageSize();
      setSize(after);
      toast.show({
        label: t('settings.data.runtimeCache.cleared', {
          size: formatStorageSize(Math.max(before - after, 0), t, i18n.language),
        }),
        variant: 'success',
      });
    } catch (error) {
      report(error);
      void refresh().catch(() => undefined);
    } finally {
      onClearingChange(false);
    }
  };
  const confirm = () =>
    alert.confirm({
      confirmLabel: t('settings.data.runtimeCache.confirm'),
      description: t('settings.data.runtimeCache.confirmDescription'),
      role: 'destructive',
      title: t('settings.data.runtimeCache.confirmTitle'),
      onConfirm: () => void clear(),
    });

  return (
    <Section title={t('settings.data.storage')} footer={t('settings.data.runtimeCache.footer')}>
      <Section.Item
        label={t('settings.data.runtimeCache.clear')}
        onPress={confirm}
        showChevron={false}
        disabled={disabled}
        testID="settings-data-clear-runtime-cache"
        trailing={
          size === undefined ? undefined : (
            <Text className="text-muted-foreground">
              {formatStorageSize(size, t, i18n.language)}
            </Text>
          )
        }
      />
    </Section>
  );
}

/** DeepChat: WebDAV 备份上传 / 下载恢复。 */
function WebDavSection({ disabled }: { disabled: boolean }) {
  const { alert } = useAlert();
  const { toast } = useToast();
  const { backup } = useBackupState();
  const report = useBackupErrorReporter();
  const [cfg, setCfg] = useState<WebDavConfig | null>(() => loadConfig());
  const [busy, setBusy] = useState(false);

  const ask = (title: string, initial: string, onDone: (value: string) => void) =>
    alert.prompt({
      title,
      confirmLabel: '保存',
      input: { accessibilityLabel: title, initialValue: initial, placeholder: initial },
      onConfirm: (value) => onDone(value.trim()),
    });

  const editAddress = () =>
    ask('WebDAV 地址', cfg?.baseUrl ?? '', (baseUrl) => {
      if (!baseUrl) return;
      const next: WebDavConfig = {
        baseUrl,
        username: cfg?.username ?? '',
        password: cfg?.password ?? '',
        directory: cfg?.directory ?? '/deepchat',
      };
      saveConfig(next);
      setCfg(next);
      toast.show({ label: '地址已保存', variant: 'success' });
    });

  const editUser = () =>
    ask('WebDAV 用户名', cfg?.username ?? '', (username) => {
      const next: WebDavConfig = {
        baseUrl: cfg?.baseUrl ?? '',
        username,
        password: cfg?.password ?? '',
        directory: cfg?.directory ?? '/deepchat',
      };
      saveConfig(next);
      setCfg(next);
    });

  const editPass = () =>
    ask('WebDAV 密码', cfg?.password ?? '', (password) => {
      const next: WebDavConfig = {
        baseUrl: cfg?.baseUrl ?? '',
        username: cfg?.username ?? '',
        password,
        directory: cfg?.directory ?? '/deepchat',
      };
      saveConfig(next);
      setCfg(next);
    });

  const editDir = () =>
    ask('备份目录', cfg?.directory ?? '/deepchat', (directory) => {
      const next: WebDavConfig = {
        baseUrl: cfg?.baseUrl ?? '',
        username: cfg?.username ?? '',
        password: cfg?.password ?? '',
        directory: directory || '/deepchat',
      };
      saveConfig(next);
      setCfg(next);
    });

  const doUpload = async () => {
    if (!cfg?.baseUrl) return editAddress();
    setBusy(true);
    try {
      const name = await uploadBackup(cfg, backup);
      toast.show({ label: `已上传 ${name}`, variant: 'success' });
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async () => {
    if (!cfg?.baseUrl) return editAddress();
    setBusy(true);
    try {
      const uri = await downloadLatestBackup(cfg);
      await backup.prepareRestore(uri);
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  const off = busy || disabled;
  return (
    <Section
      title="WebDAV 备份"
      footer={cfg?.baseUrl ? `${cfg.baseUrl}${cfg.directory}` : '未配置：先填地址、用户名、密码'}
    >
      <Section.Item label="地址" onPress={editAddress} disabled={off} trailing={cfg?.baseUrl ? '已设置' : '未设置'} />
      <Section.Item label="用户名" onPress={editUser} disabled={off} trailing={cfg?.username || '未设置'} />
      <Section.Item label="密码" onPress={editPass} disabled={off} trailing={cfg?.password ? '已设置' : '未设置'} />
      <Section.Item label="备份目录" onPress={editDir} disabled={off} trailing={cfg?.directory ?? '/deepchat'} />
      <Section.Item
        label={busy ? '处理中…' : '上传备份到 WebDAV'}
        onPress={() => void doUpload()}
        showChevron={false}
        disabled={off}
      />
      <Section.Item
        label="从 WebDAV 恢复最新备份"
        onPress={() => void doRestore()}
        showChevron={false}
        disabled={off}
      />
    </Section>
  );
}
