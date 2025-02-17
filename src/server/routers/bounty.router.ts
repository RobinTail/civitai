import {
  createBountyHandler,
  deleteBountyHandler,
  getBountyHandler,
  getBountyEntriesHandler,
  getInfiniteBountiesHandler,
  updateBountyHandler,
  addBenefactorUnitAmountHandler,
  getBountyBenefactorsHandler,
} from '../controllers/bounty.controller';
import { isFlagProtected, middleware, protectedProcedure, publicProcedure, router } from '../trpc';
import { getByIdSchema } from '~/server/schema/base.schema';
import {
  addBenefactorUnitAmountInputSchema,
  createBountyInputSchema,
  getBountyEntriesInputSchema,
  getInfiniteBountySchema,
  updateBountyInputSchema,
} from '~/server/schema/bounty.schema';
import { dbWrite } from '~/server/db/client';
import { throwAuthorizationError } from '~/server/utils/errorHandling';

const isOwnerOrModerator = middleware(async ({ ctx, next, input = {} }) => {
  if (!ctx.user) throw throwAuthorizationError();

  const { id } = input as { id: number };

  const userId = ctx.user.id;
  const isModerator = ctx?.user?.isModerator;
  if (!isModerator && !!id) {
    const ownerId = (await dbWrite.bounty.findUnique({ where: { id }, select: { userId: true } }))
      ?.userId;
    if (ownerId !== userId) throw throwAuthorizationError();
  }

  return next({
    ctx: {
      // infers the `user` as non-nullable
      user: ctx.user,
    },
  });
});

export const bountyRouter = router({
  getInfinite: publicProcedure
    .input(getInfiniteBountySchema)
    .use(isFlagProtected('bounties'))
    .query(getInfiniteBountiesHandler),
  getById: publicProcedure
    .input(getByIdSchema)
    .use(isFlagProtected('bounties'))
    .query(getBountyHandler),
  getEntries: publicProcedure
    .input(getBountyEntriesInputSchema)
    .use(isFlagProtected('bounties'))
    .query(getBountyEntriesHandler),
  getBenefactors: publicProcedure
    .input(getByIdSchema)
    .use(isFlagProtected('bounties'))
    .query(getBountyBenefactorsHandler),
  create: protectedProcedure
    .input(createBountyInputSchema)
    .use(isFlagProtected('bounties'))
    .mutation(createBountyHandler),
  update: protectedProcedure
    .input(updateBountyInputSchema)
    .use(isFlagProtected('bounties'))
    .use(isOwnerOrModerator)
    .mutation(updateBountyHandler),
  delete: protectedProcedure
    .input(getByIdSchema)
    .use(isFlagProtected('bounties'))
    .use(isOwnerOrModerator)
    .mutation(deleteBountyHandler),
  addBenefactorUnitAmount: protectedProcedure
    .input(addBenefactorUnitAmountInputSchema)
    .use(isFlagProtected('bounties'))
    .mutation(addBenefactorUnitAmountHandler),
});
