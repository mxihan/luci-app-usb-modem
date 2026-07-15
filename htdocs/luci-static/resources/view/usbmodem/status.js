'use strict';
'require view';
'require fs';
'require ui';
'require poll';
'require dom';

const STATUS_CMD = '/usr/bin/usbmodem-status';
const RESTART_CMD = '/usr/bin/usbmodem-restart';

function badge(ok, yes, no) {
	return E('span', { 'class': ok ? 'label success' : 'label danger' }, ok ? yes : no);
}

function row(label, value) {
	return E('div', { 'class': 'tr' }, [
		E('div', { 'class': 'td left', 'style': 'width:35%' }, label),
		E('div', { 'class': 'td left' }, value == null || value === '' ? '-' : value)
	]);
}

function card(title, rows) {
	return E('div', { 'class': 'cbi-section' }, [
		E('h3', {}, title),
		E('div', { 'class': 'table' }, rows)
	]);
}

function operationalState(network) {
	if (network.operstate === 'unknown')
		return network.carrier ? _('Connected') : _('Inactive');

	return network.operstate;
}

function statusHelperError(detail) {
	detail = detail && (detail.message || detail.stderr || detail.stdout || detail);

	return new Error(detail
		? _('Status helper is unavailable or inaccessible: %s').format(String(detail))
		: _('Status helper is unavailable or inaccessible.'));
}

function hasFields(value, fields) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return false;

	for (var i = 0; i < fields.length; i++)
		if (!Object.prototype.hasOwnProperty.call(value, fields[i]))
			return false;

	return true;
}

function normalizeStatus(data) {
	data = data && typeof data === 'object' ? data : {};
	var complete = hasFields(data, [ 'controller', 'modem', 'network', 'drivers', 'diagnosis', 'logs' ]) &&
		hasFields(data.controller, [ 'driver', 'device', 'bound', 'crashed' ]) &&
		hasFields(data.modem, [ 'detected' ]) &&
		hasFields(data.network, [ 'interface', 'operstate', 'carrier', 'mac', 'ipv4' ]) &&
		hasFields(data.drivers, [ 'rndis_host', 'usbnet', 'cdc_ether', 'cdc_ncm' ]) &&
		hasFields(data.diagnosis, [ 'healthy', 'message' ]) &&
		typeof data.logs === 'string';

	var normalized = {
		controller: Object.assign({
			driver: '-',
			device: '-',
			bound: false,
			crashed: false
		}, data.controller || {}),
		modem: Object.assign({ detected: false }, data.modem || {}),
		network: Object.assign({
			interface: '',
			operstate: 'missing',
			carrier: false,
			mac: '',
			ipv4: ''
		}, data.network || {}),
		drivers: Object.assign({
			rndis_host: false,
			usbnet: false,
			cdc_ether: false,
			cdc_ncm: false
		}, data.drivers || {}),
		diagnosis: Object.assign({
			healthy: false,
			message: _('Status data is incomplete.')
		}, data.diagnosis || {}),
		logs: typeof data.logs === 'string' ? data.logs : ''
	};

	if (!complete)
		normalized.diagnosis = {
			healthy: false,
			message: _('Status data is incomplete.')
		};

	return normalized;
}

return view.extend({
	loadStatus: function() {
		return fs.exec(STATUS_CMD).catch(function(err) {
			throw statusHelperError(err);
		}).then(function(res) {
			if (!res || res.code !== 0)
				throw statusHelperError(res);

			if (!res.stdout || !res.stdout.trim())
				throw new Error(_('Invalid status response: empty output'));

			try {
				var parsed = JSON.parse(res.stdout);

				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
					throw new Error(_('expected a JSON object'));

				return normalizeStatus(parsed);
			}
			catch (err) {
				throw new Error(_('Invalid status response: %s').format(err.message));
			}
		});
	},

	load: function() {
		return this.loadStatus().catch(function(err) {
			return {
				loadError: err.message || String(err)
			};
		});
	},

	renderStatus: function(rawData) {
		if (rawData && rawData.loadError)
			return E('div', { 'class': 'alert-message error' }, rawData.loadError);

		const data = normalizeStatus(rawData);
		const diagnosis = E('div', {
			'class': 'alert-message ' + (data.diagnosis.healthy ? 'success' : 'warning')
		}, [
			E('strong', {}, data.diagnosis.healthy ? _('Healthy') : _('Attention required')),
			E('br'),
			data.diagnosis.message
		]);

		return E('div', {}, [
			diagnosis,
			card(_('USB Controller'), [
				row(_('State'), badge(data.controller.bound && !data.controller.crashed, _('Running'), _('Unavailable'))),
				row(_('Driver'), data.controller.driver),
				row(_('Device'), data.controller.device),
				row(_('Crash detected'), badge(!data.controller.crashed, _('No'), _('Yes')))
			]),
			card(_('USB Modem Network'), [
				row(_('Detected'), badge(data.modem.detected, _('Yes'), _('No'))),
				row(_('Interface'), data.network.interface),
				row(_('Operational state'), operationalState(data.network)),
				row(_('Carrier'), badge(data.network.carrier, _('Present'), _('Missing'))),
				row(_('IPv4 address'), data.network.ipv4),
				row(_('MAC address'), data.network.mac)
			]),
			card(_('Drivers'), [
				row('rndis_host', badge(data.drivers.rndis_host, _('Loaded'), _('Not loaded'))),
				row('usbnet', badge(data.drivers.usbnet, _('Loaded'), _('Not loaded'))),
				row('cdc_ether', badge(data.drivers.cdc_ether, _('Loaded'), _('Not loaded'))),
				row('cdc_ncm', badge(data.drivers.cdc_ncm, _('Loaded'), _('Not loaded')))
			]),
			card(_('Recent USB log'), [
				E('div', { 'class': 'tr' }, E('pre', {
					'style': 'white-space:pre-wrap;max-height:320px;overflow:auto;width:100%'
				}, data.logs || _('No matching log entries.')))
			])
		]);
	},

	refresh: function() {
		const target = document.getElementById('usbmodem-status-body');
		if (!target)
			return Promise.resolve();

		return this.loadStatus().then(L.bind(function(data) {
			dom.content(target, this.renderStatus(data));
		}, this)).catch(function(err) {
			dom.content(target, E('div', { 'class': 'alert-message error' }, err.message || String(err)));
		});
	},

	handleRestart: function() {
		return ui.showModal(_('Restart USB controller?'), [
			E('p', {}, _('All devices attached to this USB controller will disconnect briefly.')),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-negative important',
					'click': L.bind(function() {
						ui.hideModal();
						ui.showModal(_('Restarting'), [ E('p', { 'class': 'spinning' }, _('Restarting USB controller…')) ]);
						fs.exec(RESTART_CMD).then(L.bind(function(res) {
							if (!res || res.code !== 0)
								throw new Error((res && (res.stderr || res.stdout)) || _('Restart failed'));
							return new Promise(function(resolve) { window.setTimeout(resolve, 8000); });
						}, this)).then(L.bind(function() {
							ui.hideModal();
							return this.refresh();
						}, this)).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, err.message || String(err)), 'error');
						});
					}, this)
				}, _('Restart controller'))
			])
		]);
	},

	render: function(data) {
		const body = E('div', { 'id': 'usbmodem-status-body' }, this.renderStatus(data));
		poll.add(L.bind(this.refresh, this), 5);

		return E([], [
			E('h2', {}, _('USB Modem Status')),
			E('p', {}, _('Monitor the USB host controller, modem network interface, drivers and recent kernel events.')),
			body,
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', { 'class': 'btn cbi-button-action', 'click': L.bind(this.refresh, this) }, _('Refresh')),
				' ',
				E('button', { 'class': 'btn cbi-button-negative', 'click': L.bind(this.handleRestart, this) }, _('Restart USB controller'))
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
