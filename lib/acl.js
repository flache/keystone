/**
 * The access control list.
 * @typedef {Object} AccessControlList
 * @property {boolean} hasCourage - Indicates whether the Courage component is present.
 * @property {boolean} hasPower - Indicates whether the Power component is present.
 * @property {boolean} hasWisdom - Indicates whether the Wisdom component is present.
 */


async function aclFromUserModel (user, cb) {

	if (user._doc.isGod) {
		return { isGod: true };
	}

	const accessGroupId = user._doc.accessgroups;

	if (!accessGroupId) {
		throw new Error('User must have an access group if not god');
	}


	user.populate({
		path: 'accessgroups',
		model: 'Accessgroup',
		populate: {
			path: 'permissions',
			model: 'Permission',
			populate: {
				path: 'actions',
				model: 'Permissionoperation',
			},
		}
	}, (err, populatedUser) => {
		const acl = buildAcl(populatedUser._doc.accessgroups._doc.permissions);
		cb(acl);
	});


}


function checkPermission (acl, operation, collection, field = []) {

	if (acl.isGod) {
		return true;
	}

	return acl[collection] && acl[collection][operation];
}

function buildAcl (permissions) {

	return permissions.reduce((red, permission) => {
		const collection = permission._doc.coll;
		if (red[collection]) {
			throw new Error(`duplicate permissions for collection ${collection}`);
		}
		red[collection] = permission._doc.actions.reduce((red, a) => {
			red[a._doc.name] = permission._doc.fields.length ? permission._doc.fields : true;
			return red;
		}, {});
		return red;
	}, {});
}

module.exports = {
	aclFromUserModel,
	checkPermission,
};
