import { type APAccept, ActivityIsFollow } from "activitypub-types";
import type { ActivityHandler } from ".";
import { Channel, Guild, Invite, User } from "../../../../entity";
import { RelationshipType } from "../../../../entity/relationship";
import { getExternalPathFromActor, sendActivity } from "../../../../sender";
import { config } from "../../../config";
import { getOrFetchUser, joinGuild } from "../../../entity";
import { acceptOrCreateRelationship } from "../../../entity/relationship";
import { APError } from "../../error";
import { addContext, splitQualifiedMention } from "../../util";
import { makeInstanceUrl } from "../../../url";

export const FollowActivityHandler: ActivityHandler = async (
	activity,
	target,
) => {
	if (!ActivityIsFollow(activity)) return;

	const from = activity.actor;
	if (typeof from !== "string")
		throw new APError("Follow activity must have single actor");

	const actor = await getOrFetchUser(from);
	if (!actor.collections?.inbox)
		throw new APError("Received follow from actor without inbox");

	if (target instanceof User) {
		const relationship = await acceptOrCreateRelationship(
			target,
			actor,
			activity,
		);
		if (relationship.to_state !== RelationshipType.accepted) return;
	} else if (target instanceof Channel) {
		// TODO: check for an invite to this channel
		throw new APError("not implemented");
	} else if (target instanceof Guild) {
		const invite_code = activity.instrument;
		if (
			!invite_code ||
			Array.isArray(invite_code) ||
			typeof invite_code !== "string"
		)
			throw new APError(
				"Only one invite_code string value in instrument properly allowed",
			);

		const code = splitQualifiedMention(invite_code);

		const invite = await Invite.findOneOrFail({
			where: { code: code.user },
			relations: { guild: true },
		});

		await joinGuild(actor.id, invite.guild.id);
	} else throw new APError("Cannot accept follows for this target");

	const accept: APAccept = addContext({
		id: `${activity.id}/accept`,
		type: "Accept",
		actor: makeInstanceUrl(getExternalPathFromActor(target)),
		object: activity,
	});

	await sendActivity(actor, accept, target);
};
