var async = require('async');
const { getPermissions } = require('../../../lib/acl');

module.exports = function (req, res) {
	var keystone = req.keystone;
	var counts = {};
	async.each(keystone.lists, function (list, next) {
		const permissions = getPermissions(req.acl, list);
		if (!permissions.read.$any) {
			next(null);
			return;
		}
		list.model.count(function (err, count) {
			counts[list.key] = count;
			next(err);
		});
	}, function (err) {
		if (err) return res.apiError('database error', err);
		return res.json({
			counts: counts,
		});
	});
};
