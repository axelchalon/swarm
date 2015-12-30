'use strict';

exports.config = {
	paths: {
		'public': 'app'
	},
	modules: {
		definition: false,
		wrapper: false
	},
	files: {
		stylesheets: {
			joinTo: {'style.css': /./}
		}
	}
};