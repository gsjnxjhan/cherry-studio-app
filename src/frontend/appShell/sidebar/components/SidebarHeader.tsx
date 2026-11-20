import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Surface } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appSidebar } from '@/frontend/utils/constants';

import { useSidebarActions } from '../context';
import { useSidebarHeaderTop } from '../hooks/useSidebarHeaderTop';
import { useSidebarSelectionSnapshot } from '../SidebarSelectionProvider';
import { SidebarFade } from './SidebarFade/SidebarFade';
import { SidebarTitle } from './SidebarTitle';

/**
 * Brand row floating over the body, which scrolls underneath it. The blur band
 * dissolves rows as they rise past the title instead of cutting them at a hard
 * edge.
 *
 * `box-none` on the container: the band itself must not eat touches meant for
 * the rows underneath.
 */
export function SidebarHeader() {
  const { t } = useTranslation();
  const { openSearch } = useSidebarActions('SidebarHeader');
  const disabled = useSidebarSelectionSnapshot((state) => state.isSelecting || state.isDeleting);
  const insets = useSafeAreaInsets();
  const rowTop = useSidebarHeaderTop();
  const headerInset = rowTop + appSidebar.headerRowHeight + appSidebar.headerGapY;

  return (
    <View className="absolute top-0 right-0 left-0" pointerEvents="box-none">
      {/* Match the body's top inset so the first resting row stays outside the blur. */}
      <SidebarFade edge="top" size={headerInset} />
      <View
        className="absolute right-0 left-0 flex-row items-center gap-2 px-5"
        style={{
          height: appSidebar.headerRowHeight,
          paddingLeft: 20 + insets.left,
          top: rowTop,
        }}
      >
        <SidebarDeviceTitle />
        {openSearch ? (
          <Surface interactive shape="circle">
            <Pressable
              accessibilityLabel={t('session.search.placeholder')}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              hitSlop={4}
              onPress={openSearch}
              style={({ pressed }) => ({
                alignItems: 'center',
                height: appSidebar.headerRowHeight,
                justifyContent: 'center',
                opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
                width: appSidebar.headerRowHeight,
              })}
              testID="sidebar-search"
            >
              <SearchIcon className="size-5 text-sidebar-foreground" />
            </Pressable>
          </Surface>
        ) : null}
      </View>
    </View>
  );
}

const brand = 'DeepChat';
/** Brand title; device pairing was removed, so this is plain text. */
function SidebarDeviceTitle() {
  const [width, setWidth] = useState(0);
  return (
    <View
      className="flex-1 flex-row"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <SidebarTitle name={brand} width={width} />
    </View>
  );
}
