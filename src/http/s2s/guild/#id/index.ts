import { Router } from "express";
import { z } from "zod";
import { Channel, Guild, Role } from "../../../../entity";
import {
	addContext,
	config,
	getDatabase,
	makeInstanceUrl,
	orderedCollectionHandler,
	route,
} from "../../../../util";
import { handleInbox } from "../../../../util/activitypub/inbox";
import {
	buildAPActor,
	buildAPRole,
} from "../../../../util/activitypub/transformers";

const router = Router({ mergeParams: true });

router.get(
	"/",
	route({ params: z.object({ guild_id: z.string() }) }, async (req, res) => {
		const { guild_id } = req.params;

		const guild = await Guild.findOneOrFail({
			where: {
				id: guild_id,
				domain: config.federation.webapp_url.hostname,
			},
			relations: {
				owner: true,
			},
		});

		return res.json(addContext(buildAPActor(guild)));
	}),
);

router.post(
	"/inbox",
	route(
		{
			params: z.object({ guild_id: z.string() }),
			body: z.any(),
		},
		async (req, res) => {
			const guild = await Guild.findOneOrFail({
				where: {
					id: req.params.guild_id,
					domain: config.federation.webapp_url.hostname,
				},
			});

			await handleInbox(req.body, guild);

			return res.sendStatus(200);
		},
	),
);

const COLLECTION_PARAMS = {
	params: z.object({
		guild_id: z.string(),
	}),
	query: z.object({
		before: z.string().optional(),
		after: z.string().optional(),
	}),
};

router.get(
	"/followers",
	route(COLLECTION_PARAMS, async (req, res) =>
		res.json(
			await orderedCollectionHandler({
				id: makeInstanceUrl(`/guild/${req.params.guild_id}/followers`),
				before: req.query.before,
				after: req.query.after,
				convert: buildAPRole,
				entity: Role,
				qb: getDatabase()
					.getRepository(Role)
					.createQueryBuilder("role")
					.leftJoinAndSelect("role.guild", "guild")
					.where("guild.id = :guild_id", {
						guild_id: req.params.guild_id,
					}),
			}),
		),
	),
);

router.get(
	"/following",
	route(COLLECTION_PARAMS, async (req, res) =>
		res.json(
			await orderedCollectionHandler({
				id: makeInstanceUrl(`/guild/${req.params.guild_id}/following`),
				...req.query,
				convert: (x) => x.remote_address ?? buildAPActor(x),
				entity: Channel,
				qb: getDatabase()
					.getRepository(Channel)
					.createQueryBuilder("channel")
					.leftJoinAndSelect("channel.guild", "guild")
					.where("guild.id = :guild_id", {
						guild_id: req.params.guild_id,
					}),
			}),
		),
	),
);

// TODO: outbox = audit log?

export default router;
