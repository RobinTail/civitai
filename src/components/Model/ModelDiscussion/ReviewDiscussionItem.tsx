import { Carousel } from '@mantine/carousel';
import {
  ActionIcon,
  AspectRatio,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Rating,
  Stack,
  Text,
} from '@mantine/core';
import { closeAllModals, openConfirmModal } from '@mantine/modals';
import { showNotification, hideNotification } from '@mantine/notifications';
import { ReportReason, ReviewReactions } from '@prisma/client';
import { IconDotsVertical, IconTrash, IconEdit, IconFlag, IconMessageCircle2 } from '@tabler/icons';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

import { ContentClamp } from '~/components/ContentClamp/ContentClamp';
import { MediaHash } from '~/components/ImageHash/ImageHash';
import { ImagePreview } from '~/components/ImagePreview/ImagePreview';
import { LoginRedirect } from '~/components/LoginRedirect/LoginRedirect';
import { ReactionPicker } from '~/components/ReactionPicker/ReactionPicker';
import { SensitiveContent } from '~/components/SensitiveContent/SensitiveContent';
import { UserAvatar } from '~/components/UserAvatar/UserAvatar';
import { useImageLightbox } from '~/hooks/useImageLightbox';
import { useIsMobile } from '~/hooks/useIsMobile';
import { useModalsContext } from '~/providers/CustomModalsProvider';
import { ReactionDetails } from '~/server/selectors/review.selector';
import { ReviewGetAllItem } from '~/types/router';
import { daysFromNow } from '~/utils/date-helpers';
import { showErrorNotification, showSuccessNotification } from '~/utils/notifications';
import { abbreviateNumber } from '~/utils/number-helpers';
import { trpc } from '~/utils/trpc';

export function ReviewDiscussionItem({ review }: Props) {
  const mobile = useIsMobile();
  const { openModal } = useModalsContext();
  const { data: session } = useSession();
  const currentUser = session?.user;
  const isOwner = currentUser?.id === review.user.id;
  const isMod = currentUser?.isModerator ?? false;
  const { openImageLightbox } = useImageLightbox();

  const [showNsfw, setShowNsfw] = useState(false);

  const { data: reactions = [] } = trpc.review.getReactions.useQuery({ reviewId: review.id });

  const queryUtils = trpc.useContext();
  const deleteMutation = trpc.review.delete.useMutation({
    async onSuccess() {
      await queryUtils.review.getAll.invalidate({ modelId: review.modelId });
      closeAllModals();
    },
    onError(error) {
      showErrorNotification({
        error: new Error(error.message),
        title: 'Could not delete review',
      });
    },
  });
  const handleDeleteReview = () => {
    openConfirmModal({
      title: 'Delete Review',
      children: (
        <Text size="sm">
          Are you sure you want to delete this review? This action is destructive and cannot be
          reverted.
        </Text>
      ),
      centered: true,
      labels: { confirm: 'Delete Review', cancel: "No, don't delete it" },
      confirmProps: { color: 'red', loading: deleteMutation.isLoading },
      closeOnConfirm: false,
      onConfirm: () => {
        deleteMutation.mutate({ id: review.id });
      },
    });
  };

  const reportMutation = trpc.review.report.useMutation({
    onMutate() {
      showNotification({
        id: 'sending-review-report',
        loading: true,
        disallowClose: true,
        autoClose: false,
        message: 'Sending report...',
      });
    },
    async onSuccess() {
      await queryUtils.review.getAll.invalidate({ modelId: review.modelId });
      showSuccessNotification({
        title: 'Review reported',
        message: 'Your request has been received',
      });
    },
    onError(error) {
      showErrorNotification({
        error: new Error(error.message),
        title: 'Unable to send report',
        reason: 'An unexpected error occurred, please try again',
      });
    },
    onSettled() {
      hideNotification('sending-review-report');
    },
  });
  const handleReportReview = (reason: ReportReason) => {
    reportMutation.mutate({ id: review.id, reason });
  };

  const toggleReactionMutation = trpc.review.toggleReaction.useMutation({
    async onMutate({ id, reaction }) {
      await queryUtils.review.getReactions.cancel({ reviewId: id });

      const previousReactions = queryUtils.review.getReactions.getData({ reviewId: id }) ?? [];
      const latestReaction =
        previousReactions.length > 0 ? previousReactions[previousReactions.length - 1] : { id: 0 };

      if (currentUser) {
        const newReaction: ReactionDetails = {
          id: latestReaction.id + 1,
          reaction,
          user: {
            id: currentUser.id,
            name: currentUser.name ?? '',
            username: currentUser.username ?? '',
            image: currentUser.image ?? '',
          },
        };
        const reacted = previousReactions.find(
          (r) => r.reaction === reaction && r.user.id === currentUser.id
        );
        queryUtils.review.getReactions.setData({ reviewId: id }, (old = []) =>
          reacted
            ? old.filter((oldReaction) => oldReaction.id !== reacted.id)
            : [...old, newReaction]
        );
      }

      return { previousReactions };
    },
    onError(_error, variables, context) {
      queryUtils.review.getReactions.setData(
        { reviewId: variables.id },
        context?.previousReactions
      );
    },
    async onSettled() {
      await queryUtils.review.getReactions.invalidate({ reviewId: review.id });
    },
  });
  const handleReactionClick = (reaction: ReviewReactions) => {
    toggleReactionMutation.mutate({ id: review.id, reaction });
  };

  const hasImages = review.images.length > 0;
  const hasMultipleImages = review.images.length > 1;
  const firstImage = hasImages ? review.images[0] : undefined;

  const carousel = (
    <Carousel withControls={hasMultipleImages} draggable={hasMultipleImages} loop>
      {review.images.map((image, index) => (
        <Carousel.Slide key={image.id}>
          <ImagePreview
            image={image}
            edgeImageProps={{ width: 400 }}
            aspectRatio={1}
            onClick={() =>
              openImageLightbox({
                initialSlide: index,
                images: review.images.map((image) => image),
              })
            }
            withMeta
          />
        </Carousel.Slide>
      ))}
    </Carousel>
  );

  return (
    <Card radius="md" p="md" withBorder>
      <Stack spacing={4} mb="sm">
        <Group align="flex-start" sx={{ justifyContent: 'space-between' }} noWrap>
          <UserAvatar
            user={review.user}
            subText={`${daysFromNow(review.createdAt)} - ${review.modelVersion?.name}`}
            withUsername
          />
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size="xs" variant="subtle">
                <IconDotsVertical size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {isOwner || isMod ? (
                <>
                  <Menu.Item
                    icon={<IconTrash size={14} stroke={1.5} />}
                    color="red"
                    onClick={handleDeleteReview}
                  >
                    Delete review
                  </Menu.Item>
                  <Menu.Item
                    icon={<IconEdit size={14} stroke={1.5} />}
                    onClick={() =>
                      openModal({
                        modal: 'reviewEdit',
                        title: `Editing review`,
                        closeOnClickOutside: false,
                        innerProps: { review },
                      })
                    }
                  >
                    Edit review
                  </Menu.Item>
                </>
              ) : null}
              {!session || !isOwner ? (
                <>
                  <LoginRedirect reason="report-review">
                    <Menu.Item
                      icon={<IconFlag size={14} stroke={1.5} />}
                      onClick={() => handleReportReview(ReportReason.NSFW)}
                    >
                      Report as NSFW
                    </Menu.Item>
                  </LoginRedirect>
                  <LoginRedirect reason="report-review">
                    <Menu.Item
                      icon={<IconFlag size={14} stroke={1.5} />}
                      onClick={() => handleReportReview(ReportReason.TOSViolation)}
                    >
                      Report as Terms Violation
                    </Menu.Item>
                  </LoginRedirect>
                </>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <Rating
          value={review.rating}
          fractions={2}
          size={!hasImages && !review.text ? 'xl' : undefined}
          sx={{ alignSelf: !hasImages && !review.text ? 'center' : undefined }}
          readOnly
        />
      </Stack>
      {hasImages && (
        <Card.Section mb="sm" style={{ position: 'relative' }}>
          {review.nsfw ? (
            <SensitiveContent
              controls={<SensitiveContent.Toggle my="xs" mx="md" />}
              placeholder={
                <AspectRatio ratio={1}>{firstImage && <MediaHash {...firstImage} />}</AspectRatio>
              }
              onToggleClick={(value) => setShowNsfw(value)}
            >
              {carousel}
            </SensitiveContent>
          ) : (
            carousel
          )}
          {hasMultipleImages && (
            <Badge
              variant="filled"
              color="gray"
              size="sm"
              sx={(theme) => ({
                position: 'absolute',
                top: theme.spacing.xs,
                right: theme.spacing.md,
              })}
            >
              {review.images.length}
            </Badge>
          )}
        </Card.Section>
      )}

      <ContentClamp maxHeight={100}>
        <Text>{review.text}</Text>
      </ContentClamp>

      <Group mt="sm" align="flex-start" position="apart" noWrap>
        <ReactionPicker
          reactions={reactions}
          onSelect={handleReactionClick}
          disabled={toggleReactionMutation.isLoading}
        />
        <Button
          size="xs"
          radius="xl"
          variant="subtle"
          onClick={() =>
            openModal({
              modal: 'reviewThread',
              innerProps: { review, showNsfw },
              size: mobile ? '100%' : '50%',
              title: (
                <Group spacing="xs" align="center">
                  <UserAvatar
                    user={review.user}
                    subText={daysFromNow(review.createdAt)}
                    size="lg"
                    spacing="xs"
                    withUsername
                  />
                  <Rating value={review.rating} fractions={2} readOnly />
                </Group>
              ),
            })
          }
          compact
        >
          <Group spacing={2} noWrap>
            <IconMessageCircle2 size={14} />
            <Text>{abbreviateNumber(review._count.comments)}</Text>
          </Group>
        </Button>
      </Group>
    </Card>
  );
}

type Props = { review: ReviewGetAllItem };
