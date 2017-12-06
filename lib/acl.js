/**
 * The access control list.
 * @typedef {Object} AccessControlList
 * @property {boolean} hasCourage - Indicates whether the Courage component is present.
 * @property {boolean} hasPower - Indicates whether the Power component is present.
 * @property {boolean} hasWisdom - Indicates whether the Wisdom component is present.
 */


const ALL_PERMISSIONS = ['create', 'read', 'update', 'delete', 'list'];
const NO_PERMISSION = ALL_PERMISSIONS.reduce((red, elm) => {
	red[elm] = { $fields: null, $all: false, $any: false };
	return red;
}, {});
const EVERY_PERMISSION = ALL_PERMISSIONS.reduce((red, elm) => {
	red[elm] = { $all: true, $any: true };
	return red;
}, {});

function getFallbackPermission (user) {
	return user._doc.isGod ? EVERY_PERMISSION : NO_PERMISSION;
}
async function aclFromUserModel (user, cb) {

	if (user._doc.isGod) {
		cb({ $fallbackPermission: getFallbackPermission(user) });
		return;
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
		},
	}, (err, populatedUser) => {
		const acl = buildAcl(populatedUser._doc.accessgroups._doc.permissions);
		acl.$fallbackPermission = getFallbackPermission(user);
		cb(acl);
	});

}


function buildAcl (permissions) {

	const acl = permissions.reduce((pRed, permission) => {
		const collection = permission._doc.coll;

		if (pRed[collection]) {
			const actionDuplicates = Object.keys(pRed[collection]).filter(existingAction => permission._doc.actions.some(permissionAction => permissionAction._doc.name === existingAction));
			if (actionDuplicates.length > 0) {
				console.error(`duplicate permissions for collection ${collection} and action ${actionDuplicates.join(', ')}`);
			}
		}
		// if (pRed[collection]) {
		// 	console.error(`duplicate permissions for collection ${collection}. Setting the latest one`);
		// }

		pRed[collection] = permission._doc.actions.reduce((aRed, a) => {

			aRed[a._doc.name] = permission._doc.fields.length ? {
				$fields: permission._doc.fields.length > 0 ? permission._doc.fields : null,
				$all: false,
				$any: true,
			} : { $all: true, $any: true };
			return aRed;
		}, pRed[collection] || {});

		return pRed;
	}, {});
	Object.keys(acl).forEach(coll => {
		// set all other permissions to no permission
		acl[coll] = Object.assign({}, NO_PERMISSION, acl[coll]);
	});

	return acl;

}

function getPermissions (acl, list) {
	const collection = (list.options && list.options.schema && list.options.schema.collection) || list.path;
	return acl[collection] || acl.$fallbackPermission;
}
module.exports = {
	aclFromUserModel,
	getPermissions,
};
