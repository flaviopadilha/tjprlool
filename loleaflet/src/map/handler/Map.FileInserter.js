/* -*- js-indent-level: 8 -*- */
/*
 * L.Map.FileInserter is handling the fileInserter action
 */

/* global _ Uint8Array errorMessages */

L.Map.mergeOptions({
	fileInserter: true
});

L.Map.FileInserter = L.Handler.extend({

	initialize: function (map) {
		this._map = map;
		this._childId = null;
		this._toInsert = {};
		this._toInsertURL = {};
		this._toInsertBackground = {};
		var parser = document.createElement('a');
		parser.href = map.options.server;
	},

	getWopiUrl: function (map) {
		var wopiSrc = '';
		if (map.options.wopiSrc != '') {
			wopiSrc = '?WOPISrc=' + map.options.wopiSrc;
		}
		return map.options.webserver + map.options.serviceRoot + '/' + map.options.urlPrefix +
			'/' + encodeURIComponent(map.options.doc) + '/insertfile' + wopiSrc;
	},

	addHooks: function () {
		this._map.on('insertfile', this._onInsertFile, this);
		this._map.on('inserturl', this._onInsertURL, this);
		this._map.on('childid', this._onChildIdMsg, this);
		this._map.on('selectbackground', this._onSelectBackground, this);
	},

	removeHooks: function () {
		this._map.off('insertfile', this._onInsertFile, this);
		this._map.off('inserturl', this._onInsertURL, this);
		this._map.off('childid', this._onChildIdMsg, this);
		this._map.off('selectbackground', this._onSelectBackground, this);
	},

	_onInsertFile: function (e) {
		if (!this._childId) {
			this._map._socket.sendMessage('getchildid');
			this._toInsert[Date.now()] = e.file;
		}
		else {
			this._sendFile(Date.now(), e.file, 'graphic');
		}
	},

	_onInsertURL: function (e) {
		if (!this._childId) {
			this._map._socket.sendMessage('getchildid');
			this._toInsertURL[Date.now()] = e.url;
		}
		else {
			this._sendURL(Date.now(), e.url);
		}
	},

	_onSelectBackground: function (e) {
		if (!this._childId) {
			this._map._socket.sendMessage('getchildid');
			this._toInsertBackground[Date.now()] = e.file;
		}
		else {
			this._sendFile(Date.now(), e.file, 'selectbackground');
		}
	},

	_onChildIdMsg: function (e) {
		this._childId = e.id;
		for (var name in this._toInsert) {
			this._sendFile(name, this._toInsert[name], 'graphic');
		}
		this._toInsert = {};

		for (name in this._toInsertURL) {
			this._sendURL(name, this._toInsertURL[name]);
		}
		this._toInsertURL = {};
	},

	_sendFile: function (name, file, type) {
		var socket = this._map._socket;
		var map = this._map;
		var url = this.getWopiUrl(map);

		if (!(file.filename && file.url) && (file.name === '' || file.size === 0)) {
			var errMsg =  _('The file of type: %0 can not be uploaded to server since the file has no name');
			if (file.size === 0)
				errMsg = _('The file of type: %0 can not be uploaded to server since the file is empty');
			errMsg.replace('%0', file.type);
			map.fire('error', {msg: errMsg});
			return;
		}

		this._toInsertBackground = {};

		if (window.ThisIsAMobileApp) {
			// Pass the file contents as a base64-encoded parameter in an insertfile message
			var reader = new FileReader();
			reader.onload = (function(aFile) {
				return function(e) {
					var byteBuffer = new Uint8Array(e.target.result);
					var strBytes = '';
					for (var i = 0; i < byteBuffer.length; i++) {
						strBytes += String.fromCharCode(byteBuffer[i]);
					}
					window.postMobileMessage('insertfile name=' + aFile.name + ' type=' + type +
										       ' data=' + window.btoa(strBytes));
				};
			})(file);
			reader.onerror = function(e) {
				window.postMobileError('Error when reading file: ' + e);
			};
			reader.onprogress = function(e) {
				window.postMobileDebug('FileReader progress: ' + Math.round(e.loaded*100 / e.total) + '%');
			};
			reader.readAsArrayBuffer(file);
		} else {
			var xmlHttp = new XMLHttpRequest();
			this._map.showBusy(_('Uploading...'), false);
			xmlHttp.onreadystatechange = function () {
				if (xmlHttp.readyState === 4) {
					map.hideBusy();
					socket.sendMessage('insertfile name=' + name + ' type=' + type);
					if (xmlHttp.status === 200) {
						socket.sendMessage('insertfile name=' + name + ' type=' + type);
					}
					else if (xmlHttp.status === 404) {
						map.fire('error', {msg: errorMessages.uploadfile.notfound});
					}
					else if (xmlHttp.status === 413) {
						map.fire('error', {msg: errorMessages.uploadfile.toolarge});
					}
					else {
						var msg = _('Uploading file to server failed with status: %0');
						msg.replace('%0', xmlHttp.status);
						map.fire('error', {msg: msg});
					}
				}
			};
			xmlHttp.open('POST', url, true);
			var formData = new FormData();
			formData.append('name', name);
			formData.append('childid', this._childId);
			if (file.filename && file.url) {
				formData.append('url', file.url);
				formData.append('filename', file.filename);
			} else {
				formData.append('file', file);
			}
			xmlHttp.send(formData);
		}
	},

	_sendURL: function (name, url) {
		this._map._socket.sendMessage('insertfile name=' + encodeURIComponent(url) + ' type=graphicurl');
	}
});

L.Map.addInitHook('addHandler', 'fileInserter', L.Map.FileInserter);
