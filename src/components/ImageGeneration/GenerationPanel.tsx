import { Drawer, Center, Loader, Text, Stack } from '@mantine/core';
import { useDidUpdate } from '@mantine/hooks';
import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useIsMobile } from '~/hooks/useIsMobile';
import { constants } from '~/server/common/constants';
import { GetGenerationDataInput } from '~/server/schema/generation.schema';
import { useGenerationStore } from '~/store/generation.store';
import { useDebouncer } from '~/utils/debouncer';

const GenerationTabs = dynamic(() => import('~/components/ImageGeneration/GenerationTabs'), {
  loading: () => (
    <Center
      py="xl"
      sx={(theme) => ({
        [theme.fn.smallerThan('sm')]: {
          position: 'relative',
          height: '600px',
        },
      })}
    >
      <Stack spacing="xs" align="center">
        <Text weight={500}>Loading...</Text>
        <Loader variant="bars" />
      </Stack>
    </Center>
  ),
});

type View = 'queue' | 'generate' | 'feed';
type State = {
  opened: boolean;
  input?: GetGenerationDataInput;
  view: View;
  open: (input?: GetGenerationDataInput) => void;
  close: () => void;
  setView: (view: View) => void;
};

export const useGenerationPanelControls = create<State>()(
  devtools(
    immer((set, get) => ({
      opened: false,
      view: 'generate',
      open: (input) => {
        set((state) => {
          state.opened = true;
          if (input) {
            state.input = input;
            state.view = 'generate';
          }
        });
      },
      close: () => {
        set((state) => {
          state.opened = false;
          state.input = undefined;
        });
      },
      setView: (view) =>
        set((state) => {
          state.view = view;
          state.input = undefined;
        }),
    })),
    {
      name: 'generation-panel-controls',
    }
  )
);

const store = useGenerationPanelControls.getState();
export const generationPanel = {
  open: store.open,
  setView: store.setView,
};

export function GenerationPanel() {
  const debouncer = useDebouncer(300);
  const mobile = useIsMobile({ breakpoint: 'md' });
  const [isPending, startTransition] = useTransition();

  const opened = useGenerationStore((state) => state.opened);
  const onClose = useGenerationStore((state) => state.close);
  const [showContent, setShowContent] = useState(false);

  useDidUpdate(() => {
    startTransition(() => {
      if (opened) setShowContent(true);
      else debouncer(() => setShowContent(false));
    });
  }, [opened]); //eslint-disable-line

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      size={mobile ? '90%' : 600}
      position={mobile ? 'bottom' : 'right'}
      withCloseButton={false}
      zIndex={constants.imageGeneration.drawerZIndex}
      styles={(theme) => ({
        drawer: { [theme.fn.smallerThan('md')]: { position: 'absolute', height: 'auto' } },
      })}
    >
      {showContent && <GenerationTabs />}
    </Drawer>
  );
}
