'use strict';
'require view';
'require fs';
'require ui';
'require poll';

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

return view.extend({
	loadStatus: function() {
		return fs.exec(STATUS_CMD).then(function(res) {
			if (res.code !== 0)
				throw new Error(res.stderr || _('Status command failed'));
			return JSON.parse(res.stdout);
		});
	},

	renderStatus: function(data) {
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
				row(_('Operational state'), data.network.operstate),
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
		return this.loadStatus().then(L.bind(function(data) {
			dom.content(target, this.renderStatus(data));
		}, this)).catch(function(err) {
			dom.content(target, E('div', { 'class': 'alert-message error' }, err.message));
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
							if (res.code !== 0)
								throw new Error(res.stderr || res.stdout || _('Restart failed'));
							return new Promise(resolve => window.setTimeout(resolve, 8000));
						}, this)).then(L.bind(function() {
							ui.hideModal();
							return this.refresh();
						}, this)).catch(function(err) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, err.message), 'error');
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
