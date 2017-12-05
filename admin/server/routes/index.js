var _ = require('lodash');
var ejs = require('ejs');
var path = require('path');
const { getPermissions } = require('../../../lib/acl');
const listToArray = require('list-to-array');

var templatePath = path.resolve(__dirname, '../templates/index.html');

module.exports = function IndexRoute (req, res) {
	var keystone = req.keystone;
	var lists = {};
	_.forEach(keystone.lists, function (list, key) {
		const permissions = getPermissions(req.acl, list);
		if (permissions.read.$any) {
			lists[key] = list.getOptions();
			lists[key].can = permissions;
			if (!permissions.read.$all) {
				lists[key].uiElements = lists[key].uiElements.filter((e) => {
					if (e.type === 'field') {
						return permissions.read.$fields.indexOf(e.field) !== -1;
					}
					return true;
				}).filter((e, ind, all) => {
					if (e.type === 'heading' && (ind === all.length - 1 || all[ind + 1].type === 'heading')) {
						return false;
					}
					return true;
				});
				// mimic client side expandcolumns behaviour
				lists[key].defaultColumns = listToArray(lists[key].defaultColumns).filter(c => permissions.read.$fields.indexOf(c.split('|')[0]) !== -1).join(',');
			}
			if (!permissions.delete.$any) {
				lists[key].nodelete = true;
			}
			if (!permissions.update.$any) {
				lists[key].noedit = true;
			}
			if (!permissions.create.$any) {
				lists[key].nocreate = true;
			}
		}
	});

	var UserList = keystone.list(keystone.get('user model'));

	var orphanedLists = keystone.getOrphanedLists()
		.reduce((red, list) => {
			const permissions = getPermissions(req.acl, list);
			if (permissions.list.$any) {
				red.push(_.pick(list, ['key', 'label', 'path']));
			}
			return red;
		}, []);

	// copy keystone nav
	const nav = Object.assign({}, keystone.nav);
	nav.sections = nav.sections.reduce((red, s) => {
		// copy section
		const section = Object.assign({}, s);
		section.lists = section.lists.filter((list) => {
			const permission = getPermissions(req.acl, list);
			return permission.list.$any;
		});
		if (section.lists.length > 0) {
			red.push(section);
		}
		return red;
	}, []);
	if (nav.sections.length === 0) {
		nav.flat = true;
	}


	var backUrl = keystone.get('back url');
	if (backUrl === undefined) {
		// backUrl can be falsy, to disable the link altogether
		// but if it's undefined, default it to "/"
		backUrl = '/';
	}

	var keystoneData = {
		adminPath: '/' + keystone.get('admin path'),
		appversion: keystone.get('appversion'),
		backUrl: backUrl,
		brand: keystone.get('brand'),
		csrf: { header: {} },
		devMode: !!process.env.KEYSTONE_DEV,
		lists: lists,
		nav,
		orphanedLists: orphanedLists,
		signoutUrl: keystone.get('signout url'),
		user: {
			id: req.user.id,
			name: UserList.getDocumentName(req.user) || '(no name)',
		},
		userList: UserList.key,
		version: keystone.version,
		wysiwyg: { options: {
			enableImages: keystone.get('wysiwyg images') ? true : false,
			enableCloudinaryUploads: keystone.get('wysiwyg cloudinary images') ? true : false,
			enableS3Uploads: keystone.get('wysiwyg s3 images') ? true : false,
			additionalButtons: keystone.get('wysiwyg additional buttons') || '',
			additionalPlugins: keystone.get('wysiwyg additional plugins') || '',
			additionalOptions: keystone.get('wysiwyg additional options') || {},
			overrideToolbar: keystone.get('wysiwyg override toolbar'),
			skin: keystone.get('wysiwyg skin') || 'keystone',
			menubar: keystone.get('wysiwyg menubar'),
			importcss: keystone.get('wysiwyg importcss') || '',
		} },
	};
	keystoneData.csrf.header[keystone.security.csrf.CSRF_HEADER_KEY] = keystone.security.csrf.getToken(req, res);

	var codemirrorPath = keystone.get('codemirror url path')
		? '/' + keystone.get('codemirror url path')
		: '/' + keystone.get('admin path') + '/js/lib/codemirror';

	var locals = {
		adminPath: keystoneData.adminPath,
		cloudinaryScript: false,
		codemirrorPath: codemirrorPath,
		env: keystone.get('env'),
		fieldTypes: keystone.fieldTypes,
		ga: {
			property: keystone.get('ga property'),
			domain: keystone.get('ga domain'),
		},
		keystone: keystoneData,
		title: keystone.get('name') || 'Keystone',
	};

	var cloudinaryConfig = keystone.get('cloudinary config');
	if (cloudinaryConfig) {
		var cloudinary = require('cloudinary');
		var cloudinaryUpload = cloudinary.uploader.direct_upload();
		keystoneData.cloudinary = {
			cloud_name: keystone.get('cloudinary config').cloud_name,
			api_key: keystone.get('cloudinary config').api_key,
			timestamp: cloudinaryUpload.hidden_fields.timestamp,
			signature: cloudinaryUpload.hidden_fields.signature,
		};
		locals.cloudinaryScript = cloudinary.cloudinary_js_config();
	};

	ejs.renderFile(templatePath, locals, { delimiter: '%' }, function (err, str) {
		if (err) {
			console.error('Could not render Admin UI Index Template:', err);
			return res.status(500).send(keystone.wrapHTMLError('Error Rendering Admin UI', err.message));
		}
		res.send(str);
	});
};
